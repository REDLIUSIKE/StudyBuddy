/** Closed page operations reuse the original native dispatcher and install authority. */
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { HARNESS_TOOL_METHODS, HARNESS_SKILL_SAFETY_LABS_METHODS, parseSkillSafetyScannerView, parseSkillSafetySessionView, } from '@studybuddy/contracts';
import { BusinessFailure } from "./business-api.js";
import { ToolInstallAuthorizations } from "./tool-install-authorizations.js";
import { ToolInstallStream } from "./tool-install-stream.js";
import { STUDYBUDDY_IPC } from "./types.js";
/** @param path System picker result. @returns An absolute real directory without a linked ancestor. */
export async function validateToolWorkingDirectory(path) {
    if (!isAbsolute(path) || !(await lstat(path)).isDirectory())
        throw new BusinessFailure('NATIVE_TOOL_INVALID_CONFIG');
    for (let current = path;;) {
        if ((await lstat(current)).isSymbolicLink())
            throw new BusinessFailure('NATIVE_TOOL_INVALID_CONFIG');
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return path;
}
export class ToolCenterBridge {
    views;
    native;
    picker;
    opener;
    navigate;
    safety;
    grants;
    streams;
    subscriptions = new Map();
    constructor(views, native, picker, opener, navigate, safety) {
        this.views = views;
        this.native = native;
        this.picker = picker;
        this.opener = opener;
        this.navigate = navigate;
        this.safety = safety;
        this.grants = new ToolInstallAuthorizations(native);
        this.streams = new ToolInstallStream({
            invoke: native.invoke.bind(native),
            subscribeInstallEvents: (scope, listener) => {
                if (!native.subscribeInstallEvents)
                    throw new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE');
                return native.subscribeInstallEvents(scope, listener);
            },
            subscribeInstallStream: (scope, listener) => {
                if (!native.subscribeInstallStream)
                    throw new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE');
                return native.subscribeInstallStream(scope, listener);
            },
        }, scope => views.refresh(scope));
    }
    state(event) {
        const row = this.views.checked(event);
        return { owner: row.lease, state: row.state };
    }
    async invoke(event, id, method, args) {
        const row = this.views.checked(event, id);
        if (typeof method === 'string' && HARNESS_SKILL_SAFETY_LABS_METHODS.some(name => name === method)) {
            if (row.target !== 'labs' || !this.safety || !Array.isArray(args))
                throw new BusinessFailure('TOOL_OPERATION_DENIED');
            if (method === 'getSkillSafetyScannerStatus') {
                if (args.length)
                    throw new BusinessFailure('TOOL_OPERATION_DENIED');
            }
            else {
                const input = args[0];
                if (args.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('requestId' in input) || typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 256)
                    throw new BusinessFailure('TOOL_OPERATION_DENIED');
            }
            const result = await this.safety.invoke(row.lease, method, args);
            this.views.checked(event, id);
            if (method === 'startSkillSafetyAssistant') {
                const ref = parseSkillSafetySessionView(result);
                this.navigate({ scope: row.lease.scope, target: 'skill-safety', ...ref });
                return ref;
            }
            return method === 'cancelSkillSafetyScannerPreparation' ? undefined : parseSkillSafetyScannerView(result);
        }
        if (typeof method !== 'string' ||
            !HARNESS_TOOL_METHODS.some(name => name === method) ||
            !Array.isArray(args) ||
            args.length > 3 ||
            Buffer.byteLength(JSON.stringify(args)) > 16 * 1024 * 1024)
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        if (method === 'getActiveInstall' && args.length)
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        const laboratory = method === 'getCodexChineseStatus' || method === 'applyCodexChinese' || method === 'restoreCodexChinese';
        if ((row.target === 'labs') !== laboratory || (laboratory && args.length))
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        let result;
        if (method === 'pickNativeWorkingDirectory') {
            if (args.length)
                throw new BusinessFailure('TOOL_OPERATION_DENIED');
            const path = await this.picker(row.window);
            this.views.checked(event, id);
            result = path === null ? null : await validateToolWorkingDirectory(path);
        }
        else if (method === 'openNativeToolInstall') {
            if (args.length !== 1)
                throw new BusinessFailure('TOOL_OPERATION_DENIED');
            const url = await this.native.invoke(row.lease.scope, 'resolveNativeToolInstallTarget', args);
            this.views.checked(event, id);
            await this.opener(url.url);
        }
        else if (method === 'prepareToolInstallation') {
            if (args.length !== 1 || typeof args[0] !== 'string')
                throw new BusinessFailure('TOOL_OPERATION_DENIED');
            result = await this.grants.prepare(row.lease, args[0]);
        }
        else if (method === 'startInstall') {
            if (args.length !== 1)
                throw new BusinessFailure('TOOL_OPERATION_DENIED');
            result = await this.grants.start(row.lease, args[0]);
        }
        else if (method === 'getActiveInstall') {
            result = await this.grants.active(row.lease);
        }
        else {
            const name = method;
            result = await this.native.invoke(row.lease.scope, name, args);
        }
        this.views.checked(event, id);
        if ([
            'configureSource',
            'connectNativeTool',
            'connectNativeUserSource',
            'restoreNativeConnectionUi',
            'restoreOfficialLogin',
            'restoreToolOfficialLogin',
            'saveNativeUserSource',
            'resumeNativeUserSourceSave',
            'saveNativeUserModel',
            'resumeNativeUserModelSave',
            'deleteNativeUserModel',
            'updateNativeUserModel',
        ].includes(method))
            this.views.refresh(row.lease.scope);
        return result;
    }
    navigation(event, id, target) {
        const row = this.views.checked(event, id);
        if (target !== 'tools' && target !== 'sources' && target !== 'recharge')
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        if (row.target === 'labs' ? target !== 'tools' : target === 'tools')
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        this.navigate({ scope: row.lease.scope, target });
    }
    async subscribe(event, id) {
        const row = this.views.checked(event, id), key = row.lease.lease;
        if (row.target === 'labs')
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        if (this.subscriptions.has(key)) {
            await this.subscriptions.get(key);
            return;
        }
        const pending = this.streams.attach(row.lease.scope, (payload) => {
            try {
                this.views.checked(event, id).view.webContents.send(STUDYBUDDY_IPC.toolInstallEvent, payload);
            }
            catch (error) {
                if (!(error instanceof BusinessFailure))
                    throw error;
            }
        });
        this.subscriptions.set(key, pending);
        try {
            await pending;
            this.views.checked(event, id);
        }
        catch (error) {
            this.subscriptions.delete(key);
            (await pending.catch(() => () => { }))();
            throw error;
        }
    }
    unsubscribe(event, id) {
        const row = this.views.checked(event, id);
        this.stop(row.lease.lease);
    }
    stop(id) {
        const pending = this.subscriptions.get(id);
        this.subscriptions.delete(id);
        if (pending)
            void pending
                .then(off => off())
                .catch(error => console.error('StudyBuddy install subscription failed', error instanceof BusinessFailure ? error.code : 'INSTALL_STREAM_FAILED'));
    }
    release(owner) {
        this.safety?.release(owner);
        this.stop(owner.lease);
        this.grants.revoke(owner);
    }
}
//# sourceMappingURL=tool-center-bridge.js.map