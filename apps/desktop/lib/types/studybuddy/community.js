/** Original authenticated pages with separate leases and a narrowly scoped native Skill bridge. */
import { randomUUID } from 'node:crypto';
import { isAbsolute, extname } from 'node:path';
import { lstat } from 'node:fs/promises';
import { StudyBuddyEmbeddedGuests } from "./embedded-guests.js";
import { communityCampusEntry, communityEntry, communityNavigationAllowed, communityProfileAction } from "./community-routes.js";
import { COMMUNITY_IPC } from "./community-types.js";
import { SkillsNativeClient } from "./skill-native-client.js";
const origin = 'https://guijitongzhuo.com';
const page = origin + '/skills?embed=desktop&host_ui=harness';
const commands = new Set([
    'skill_center_bridge_connect', 'skill_center_scan', 'skill_center_copy', 'skill_center_install', 'skill_center_manage',
    'skill_center_cancel_operation', 'skill_center_open_instance', 'skill_center_open_project', 'skill_center_open_tool_center',
    'skill_center_pick_project', 'skill_center_library_metadata', 'skill_center_import_local', 'skill_center_export',
    'skill_center_forget_project', 'skill_center_copy_preflight', 'skill_center_watch_start', 'skill_center_watch_stop',
    'skill_center_ai_session', 'skill_center_ai_approve', 'skill_center_record_diagnostic',
]);
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const same = (a, b) => a?.accountId === b.accountId && a.generation === b.generation;
/** All remote requests are tied to the admitted guest's current main frame and account generation. */
export class StudyBuddyCommunity {
    deps;
    zhilian;
    skills;
    constructor(deps) {
        this.deps = deps;
        const invalid = (owner, lease) => { if (!owner.isDestroyed())
            owner.send(COMMUNITY_IPC.invalid, lease); };
        this.zhilian = new StudyBuddyEmbeddedGuests(deps.auth, deps.fetch, partition => deps.session(partition), undefined, invalid, {
            target: 'zhilian', validateEntry: value => communityEntry('zhilian', value), navigationAllowed: value => communityNavigationAllowed('zhilian', value),
            navigate: async (owner, guest, lease, value) => {
                const action = communityProfileAction(value);
                if (!action)
                    return;
                await deps.auth.withSession(async (current) => {
                    if (!same(current.scope, lease.scope))
                        throw Error('ACCOUNT_SCOPE_CHANGED');
                    const response = await deps.fetch(origin + '/api/v1/auth/embedded-session', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + current.accessToken }, body: JSON.stringify(action === 'open' ? { target: 'personal_profile', returnTarget: 'zhilian' } : { target: 'zhilian' }) });
                    if (!response.ok)
                        throw Error(response.status === 401 ? 'AUTH_REQUIRED' : 'COMMUNITY_TICKET_FAILED');
                    const body = await response.json();
                    if (!record(body))
                        throw Error('COMMUNITY_ENTRY_INVALID');
                    const entry = action === 'open' ? communityCampusEntry(body.entryUrl) : communityEntry('zhilian', body.entryUrl);
                    if (!same(deps.auth.scope(), lease.scope) || !this.zhilian.owns(owner, lease.lease) || guest.isDestroyed())
                        throw Error('ACCOUNT_SCOPE_CHANGED');
                    await guest.loadURL(entry);
                });
            },
        });
        this.skills = new StudyBuddyEmbeddedGuests(deps.auth, deps.fetch, partition => deps.session(partition), undefined, invalid, {
            target: 'skills', validateEntry: value => communityEntry('skills', value), navigationAllowed: value => communityNavigationAllowed('skills', value), preload: deps.preload,
            issue: async (current) => {
                const client = new SkillsNativeClient(deps.runtime, current, deps.home(), deps.version);
                let live = true;
                const stopRenewal = deps.auth.subscribe(state => {
                    if (!live || state.phase !== 'authenticated' || !same(deps.auth.scope(), current.scope))
                        return;
                    void deps.auth.withSession(session => client.renewSession(session)).catch(() => {
                        if (live && same(deps.auth.scope(), current.scope))
                            void this.skills.revoke(true)
                                .catch(() => { console.error('StudyBuddy Skill renewal cleanup failed'); });
                    });
                });
                const dispose = async () => { live = false; stopRenewal(); await client.dispose(); };
                try {
                    const issued = await client.invoke('prepare', {}, page);
                    await deps.auth.withSession(session => client.renewSession(session));
                    if (!record(issued) || typeof issued.entryUrl !== 'string' || typeof issued.bindingId !== 'string' || !/^[a-f0-9]{64}$/.test(issued.bindingId))
                        throw Error('SKILL_NATIVE_RESPONSE_INVALID');
                    return {
                        entryUrl: issued.entryUrl, startup: { bindingId: issued.bindingId, operationId: randomUUID() },
                        invoke: client.invoke.bind(client), dispose,
                    };
                }
                catch (error) {
                    await dispose();
                    throw error;
                }
            },
        });
    }
    recognizes(owner, src, partition) {
        return this.zhilian.recognizes(owner, src, partition) || this.skills.recognizes(owner, src, partition);
    }
    bind(window, input, reservation) {
        this.zhilian.bind(window, input, (src, partition) => reservation(src, partition) || this.skills.recognizes(window.webContents, src, partition));
        this.skills.bind(window, input, (src, partition) => reservation(src, partition) || this.zhilian.recognizes(window.webContents, src, partition));
    }
    revoke() {
        return Promise.all([this.zhilian.revoke(), this.skills.revoke()]).then(() => undefined);
    }
    manager(owner, lease) {
        if (typeof lease !== 'string')
            throw Error('COMMUNITY_LEASE_INVALID');
        if (this.zhilian.owns(owner, lease))
            return this.zhilian;
        if (this.skills.owns(owner, lease))
            return this.skills;
        throw Error('COMMUNITY_OWNER_MISMATCH');
    }
    register(ipc, assertOwner) {
        const result = async (run) => {
            try {
                return { ok: true, data: await run() };
            }
            catch (error) {
                const code = error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'COMMUNITY_OPERATION_FAILED';
                console.error('StudyBuddy community operation failed: ' + code);
                if (code === 'AUTH_REQUIRED')
                    void this.deps.auth.restore();
                return { ok: false, error: { code } };
            }
        };
        ipc.handle(COMMUNITY_IPC.acquire, (event, target) => result(async () => {
            assertOwner(event);
            if (target !== 'zhilian' && target !== 'skills')
                throw Error('COMMUNITY_TARGET_DENIED');
            return this[target].acquire(event.sender);
        }));
        ipc.handle(COMMUNITY_IPC.release, (event, lease) => result(async () => {
            assertOwner(event);
            await this.manager(event.sender, lease).release(event.sender, lease);
        }));
        ipc.handle(COMMUNITY_IPC.theme, (event, lease, value) => result(async () => {
            assertOwner(event);
            await this.manager(event.sender, lease).setTheme(event.sender, lease, value);
        }));
        ipc.handle(COMMUNITY_IPC.visible, (event, lease, value) => result(async () => {
            assertOwner(event);
            if (typeof lease !== 'string' || typeof value !== 'boolean')
                throw Error('COMMUNITY_ARGUMENTS_INVALID');
            await this.manager(event.sender, lease).setVisible(event.sender, lease, value);
        }));
        ipc.on(COMMUNITY_IPC.startup, (event) => {
            try {
                const row = this.skills.checkedGuest(event);
                event.returnValue = row.issued.startup ?? null;
            }
            catch {
                event.returnValue = null;
            }
        });
        ipc.handle(COMMUNITY_IPC.invoke, (event, command, raw) => result(async () => {
            try {
                return await this.invoke(event, command, raw);
            }
            catch (error) {
                const terminal = ['AUTH_REQUIRED', 'SKILL_BRIDGE_EXPIRED', 'SKILL_SESSION_RESTART_REQUIRED', 'SKILL_NATIVE_CLOSED', 'SKILL_NATIVE_PROTOCOL_INVALID'];
                if (error instanceof Error && terminal.includes(error.message)) {
                    const window = this.deps.window();
                    let lease;
                    try {
                        lease = this.skills.checkedGuest(event).lease.lease;
                    }
                    catch { /* account revocation already owns cleanup */ }
                    if (lease && window && this.skills.owns(window.webContents, lease)) {
                        try {
                            await this.skills.revoke();
                        }
                        finally {
                            if (!window.isDestroyed())
                                window.webContents.send(COMMUNITY_IPC.invalid, lease);
                        }
                    }
                }
                throw error;
            }
        }));
    }
    async invoke(event, command, raw) {
        if (typeof command !== 'string' || !commands.has(command) || !record(raw) || Object.hasOwn(raw, 'selectedPath') || Buffer.byteLength(JSON.stringify(raw)) > 16 * 1024 * 1024)
            throw Error('SKILL_OPERATION_DENIED');
        const checked = this.skills.checkedGuest(event);
        if (!checked.issued.invoke)
            throw Error('SKILL_NATIVE_UNAVAILABLE');
        let input = raw;
        const window = this.deps.window();
        if (!window || window.isDestroyed() || !this.skills.owns(window.webContents, checked.lease.lease))
            throw Error('COMMUNITY_OWNER_MISMATCH');
        if (['skill_center_pick_project', 'skill_center_import_local', 'skill_center_export'].includes(command)) {
            // The original native service checks the bridge again after the dialog and before any file effect.
            await checked.issued.invoke('authorize_dialog', { command, original: raw }, event.sender.getURL(), () => { });
            const selectedPath = await this.deps.pick(window, command, raw);
            this.skills.checkedGuest(event);
            input = { ...raw, selectedPath };
        }
        const value = await checked.issued.invoke(command, input, event.sender.getURL(), (channelId, payload) => {
            try {
                this.skills.checkedGuest(event);
                event.sender.send(COMMUNITY_IPC.event, { lease: checked.lease.lease, scope: checked.lease.scope, channelId, payload });
            }
            catch { /* revoked channel has no recipient */ }
        });
        this.skills.checkedGuest(event);
        if (command === 'skill_center_open_instance') {
            if (!record(value) || typeof value.path !== 'string' || !isAbsolute(value.path))
                throw Error('SKILL_NATIVE_RESPONSE_INVALID');
            const stat = await lstat(value.path);
            if (!stat.isDirectory() && !(stat.isFile() && extname(value.path).toLowerCase() === '.md'))
                throw Error('SKILL_PATH_UNSAFE');
            this.skills.checkedGuest(event);
            if (await this.deps.openPath(value.path))
                throw Error('SKILL_OPEN_FAILED');
            return null;
        }
        if (command === 'skill_center_open_project') {
            if (!record(value) || typeof value.url !== 'string' || !URL.canParse(value.url))
                throw Error('SKILL_NATIVE_RESPONSE_INVALID');
            const url = new URL(value.url);
            if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port)
                throw Error('SKILL_SOURCE_NOT_GITHUB');
            await this.deps.openExternal(url.href);
            return null;
        }
        if (command === 'skill_center_open_tool_center') {
            window.webContents.send(COMMUNITY_IPC.navigation, { scope: checked.lease.scope, target: 'tools' });
            return null;
        }
        return value;
    }
}
//# sourceMappingURL=community.js.map