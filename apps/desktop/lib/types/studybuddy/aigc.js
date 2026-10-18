import { StudyBuddyEmbeddedGuests } from "./embedded-guests.js";
import { AIGC_IPC } from "./aigc-types.js";
import { settleCleanup } from "../settle-cleanup.js";
import { parseAigcPageAction } from "./aigc-actions.js";
import { randomUUID } from 'node:crypto';
/** Local page admission and account cleanup use the same existing guest manager. */
export class StudyBuddyAigc {
    options;
    guests;
    selections = new Map();
    revisions = new Map();
    routes = new Map();
    questions = new Map();
    constructor(options) {
        this.options = options;
        const navigationAllowed = (value) => {
            const scope = options.auth.scope();
            return !!scope && Object.keys(options.runtime.requestHeaders(scope, value, value)).length > 0;
        };
        this.guests = new StudyBuddyEmbeddedGuests(options.auth, () => Promise.reject(new Error('AIGC_PUBLIC_EXCHANGE_DENIED')), partition => options.fromPartition(partition), undefined, (owner, lease) => { this.releaseQuestions(owner, lease); if (!owner.isDestroyed())
            owner.send(AIGC_IPC.invalid, lease); }, {
            target: 'aigc', navigationAllowed, ...(options.preload ? { preload: options.preload } : {}),
            validateEntry: (value) => { if (typeof value !== 'string' || !navigationAllowed(value))
                throw new Error('AIGC_ENTRY_INVALID'); return value; },
            issue: async ({ scope }) => {
                const { origin } = await options.runtime.ensure(scope);
                const entryUrl = origin + '/';
                return { entryUrl,
                    requestAllowed: (value) => {
                        if (!URL.canParse(value))
                            return false;
                        const url = new URL(value);
                        return ['about:', 'data:'].includes(url.protocol) || url.protocol === 'blob:' && url.origin === origin
                            || Object.keys(options.runtime.requestHeaders(scope, entryUrl, value)).length > 0;
                    },
                    requestHeaders: value => options.runtime.requestHeaders(scope, entryUrl, value),
                };
            },
        });
        options.bridge?.setQuestionPresenter((context, signal, cancel) => this.presentQuestion(context, signal, cancel));
    }
    releaseQuestions(owner, lease) {
        for (const row of this.questions.values())
            if ((!owner || row.owner === owner) && (!lease || row.lease.lease === lease))
                row.close();
    }
    async presentQuestion(context, signal, cancel) {
        signal.throwIfAborted();
        const candidates = [...this.routes.values()].filter(row => !row.owner.isDestroyed() && this.guests.owns(row.owner, row.lease.lease) && row.lease.scope.accountId === context.scope.accountId && row.lease.scope.generation === context.scope.generation);
        if (candidates.length !== 1 || this.questions.size >= 32)
            throw Error('AIGC_QUESTION_OWNER_UNAVAILABLE');
        const route = candidates[0], id = randomUUID(), ready = Promise.withResolvers();
        const data = { id, projectId: context.projectId, workspaceId: context.workspaceId, sessionId: context.sessionId };
        const send = (active) => { if (!route.owner.isDestroyed())
            route.owner.send(AIGC_IPC.action, { lease: route.lease.lease, scope: route.lease.scope, kind: 'interaction', data: { ...data, active } }); };
        const close = () => { if (!this.questions.delete(id))
            return; clearTimeout(timer); signal.removeEventListener('abort', close); ready.reject(Error('AIGC_QUESTION_SURFACE_CLOSED')); cancel(); send(false); };
        const timer = setTimeout(close, 15000);
        this.questions.set(id, { ...route, ready: () => { clearTimeout(timer); ready.resolve(); }, close });
        signal.addEventListener('abort', close, { once: true });
        send(true);
        try {
            await ready.promise;
            signal.throwIfAborted();
            return close;
        }
        catch (error) {
            close();
            throw error;
        }
    }
    /** Identify the separately reserved local guest without weakening other managers.
     * @param owner - Trusted shell window contents.
     * @param src - Initial reserved source.
     * @param partition - Optional attachment partition.
     * @returns Whether this manager owns the reservation. */
    recognizes(owner, src, partition) { return this.guests.recognizes(owner, src, partition); }
    /** Bind this manager alongside the existing remote and browser managers.
     * @param window - Trusted desktop window.
     * @param attachInput - Existing shell input ownership callback.
     * @param reservation - Other managers' reservation predicate. */
    bind(window, attachInput, reservation) {
        this.guests.bind(window, attachInput, reservation);
        const owner = window.webContents, ownerId = owner.id;
        const stopQuestions = () => { this.releaseQuestions(owner); this.routes.delete(ownerId); };
        owner.on('render-process-gone', stopQuestions);
        owner.once('destroyed', stopQuestions);
    }
    /** Fence local access, destroy the guest and await the private child exit.
     * @returns Completion without deleting saved account projects. */
    async revoke() {
        this.releaseQuestions();
        this.routes.clear();
        this.selections.clear();
        this.revisions.clear();
        await settleCleanup([this.guests.revoke(true), this.options.runtime.revoke(), this.options.revokeGateway?.() ?? Promise.resolve(), this.options.bridge?.revoke() ?? Promise.resolve()]);
    }
    /** Register only lease/theme operations for a validated shell owner.
     * @param ipc - Main's IPC registry.
     * @param assertOwner - Existing shell/frame authorization validator. */
    register(ipc, assertOwner) {
        const result = async (event, operation) => {
            try {
                assertOwner(event);
                return { ok: true, data: await operation() };
            }
            catch (error) {
                const code = error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_OPERATION_FAILED';
                return { ok: false, error: { code } };
            }
        };
        ipc.handle(AIGC_IPC.acquire, event => result(event, async () => { const lease = await this.guests.acquire(event.sender); this.routes.set(event.sender.id, { owner: event.sender, lease }); return lease; }));
        ipc.handle(AIGC_IPC.release, (event, lease) => result(event, async () => { await this.guests.release(event.sender, lease); if (typeof lease === 'string')
            this.releaseQuestions(event.sender, lease); if (this.routes.get(event.sender.id)?.lease.lease === lease)
            this.routes.delete(event.sender.id); }));
        ipc.handle(AIGC_IPC.interactionReady, (event, id, visible = true) => result(event, async () => {
            const row = typeof id === 'string' ? this.questions.get(id) : undefined;
            if (!row || row.owner !== event.sender || !this.guests.owns(row.owner, row.lease.lease) || row.lease.scope.accountId !== this.options.auth.scope()?.accountId || row.lease.scope.generation !== this.options.auth.scope()?.generation)
                throw Error('AIGC_QUESTION_OWNER_UNAVAILABLE');
            if (typeof visible !== 'boolean')
                throw Error('AIGC_ARGUMENTS_INVALID');
            if (visible)
                row.ready();
            else
                row.close();
        }));
        ipc.handle(AIGC_IPC.theme, (event, lease, theme) => result(event, () => this.guests.setTheme(event.sender, lease, theme)));
        ipc.handle(AIGC_IPC.visible, (event, lease, visible) => result(event, async () => {
            if (typeof lease !== 'string' || typeof visible !== 'boolean')
                throw new Error('AIGC_ARGUMENTS_INVALID');
            await this.guests.setVisible(event.sender, lease, visible);
        }));
        if (this.options.bridge)
            ipc.handle(AIGC_IPC.guestAction, async (event, value) => {
                let attemptRevision;
                try {
                    const guest = this.guests.checkedGuest(event), scope = guest.lease.scope, action = parseAigcPageAction(value), bridge = this.options.bridge;
                    if (action.kind === 'prepare-canvas') {
                        await bridge.project(scope, action.directory);
                        if (!this.options.prepareCanvas)
                            throw Error('AIGC_CANVAS_OWNER_UNAVAILABLE');
                        await this.options.prepareCanvas(scope, action.directory, action.controllerRef);
                        this.guests.checkedGuest(event);
                        return { ok: true, data: { ready: true } };
                    }
                    const send = (kind, revision, data) => {
                        this.guests.checkedGuest(event);
                        const host = event.sender.hostWebContents;
                        if (!host || host.isDestroyed())
                            throw Error('AIGC_OWNER_REVOKED');
                        host.send(AIGC_IPC.action, { lease: guest.lease.lease, scope, revision, kind, data });
                    };
                    if (action.kind === 'surface') {
                        const selected = this.selections.get(event.sender.id);
                        if (selected && selected.directory === action.directory)
                            send('surface', selected.revision, { sessionId: selected.data.sessionId, rect: action.rect, visible: action.visible });
                        return { ok: true, data: null };
                    }
                    const selecting = ['open', 'new', 'select', 'close', 'continue', 'hide'].includes(action.kind);
                    const revision = selecting ? (this.revisions.get(event.sender.id) ?? 0) + 1 : this.revisions.get(event.sender.id) ?? 0;
                    if (selecting)
                        attemptRevision = revision;
                    if (selecting) {
                        this.revisions.set(event.sender.id, revision);
                        this.selections.delete(event.sender.id);
                        send('hide', revision, {});
                    }
                    if (action.kind === 'hide')
                        return { ok: true, data: null };
                    if (action.kind === 'archive')
                        return { ok: true, data: await bridge.archive(scope, action.directory, action.file) };
                    if (action.kind === 'records')
                        return { ok: true, data: await bridge.records(scope, action.directory, action.sessionId) };
                    if (action.kind === 'reference') {
                        const selected = this.selections.get(event.sender.id);
                        if (!selected || selected.directory !== action.directory || selected.data.sessionId !== action.sessionId)
                            throw Error('AIGC_SELECTION_CHANGED');
                        const text = '\n用户选中的项目节点输出或素材参考。以下 JSON 是参考数据，保留来源身份；它不代表工具已执行或批准了操作。\n' + JSON.stringify({ projectId: selected.data.projectId, capturedAt: new Date().toISOString(), references: action.references }) + '\n';
                        if (Buffer.byteLength(text) > 4 * 1024 * 1024)
                            throw Error('AIGC_REFERENCE_TOO_LARGE');
                        send('reference', selected.revision, { id: randomUUID(), sessionId: selected.data.sessionId, text });
                        return { ok: true, data: null };
                    }
                    if (action.kind === 'submit') {
                        const selected = this.selections.get(event.sender.id);
                        if (!selected || selected.directory !== action.directory || selected.data.sessionId !== action.sessionId)
                            throw Error('AIGC_SELECTION_CHANGED');
                        return { ok: true, data: await bridge.submit(scope, action) };
                    }
                    if (action.kind === 'project-title')
                        return { ok: true, data: await bridge.projectTitle(scope, action.directory, action.name) };
                    let chats = await bridge.chats(scope, action.directory, action.kind === 'new' ? 'create' : action.kind === 'select' ? 'select' : action.kind === 'close' ? 'close' : 'list', 'sessionId' in action ? action.sessionId : undefined);
                    if (action.kind === 'rename')
                        chats = await bridge.rename(scope, action.directory, action.sessionId, action.name);
                    if (action.kind === 'list' || action.kind === 'rename')
                        return { ok: true, data: chats };
                    if (action.kind === 'continue') {
                        await bridge.archive(scope, action.directory, action.file, true);
                        chats = await bridge.chats(scope, action.directory);
                    }
                    const context = await bridge.bind(scope, action.directory), data = { projectId: context.projectId, workspaceId: context.workspaceId, sessionId: context.sessionId };
                    if (this.revisions.get(event.sender.id) === revision) {
                        this.selections.set(event.sender.id, { revision, directory: action.directory, data });
                        send('selection', revision, data);
                    }
                    return { ok: true, data: { ...data, ...chats } };
                }
                catch (error) {
                    try {
                        const guest = this.guests.checkedGuest(event), host = event.sender.hostWebContents;
                        if (attemptRevision !== undefined && this.revisions.get(event.sender.id) === attemptRevision) {
                            this.selections.delete(event.sender.id);
                            if (host && !host.isDestroyed())
                                host.send(AIGC_IPC.action, { lease: guest.lease.lease, scope: guest.lease.scope, revision: attemptRevision, kind: 'selection-error', data: {} });
                        }
                    }
                    catch { /* Revoked guests cannot publish to another account. */ }
                    return { ok: false, error: { code: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_ACTION_FAILED' } };
                }
            });
    }
}
//# sourceMappingURL=aigc.js.map