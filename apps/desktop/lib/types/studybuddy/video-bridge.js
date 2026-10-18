import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accountVideoDirectory } from "./video-runtime.js";
import { assertVideoPath } from "./video-path.js";
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
/** Main resolves original project identities; guests never choose native roots or Sessions. */
export class VideoBridge {
    options;
    identity;
    lease = randomUUID();
    ready;
    requests = new Map();
    bindings = new Map();
    admissions = new Map();
    closingProjects = new Map();
    selections = new Map();
    callers = new Map();
    tasks = new Map();
    sourcePins = new Map();
    constructor(options) {
        this.options = options;
    }
    owner(scope) {
        if (!this.options.isCurrent(scope))
            throw Error('VIDEO_SCOPE_REVOKED');
        const owner = this.options.hostContext(scope), key = JSON.stringify(owner);
        if (owner.scope.accountId !== scope.accountId || owner.scope.generation !== scope.generation)
            throw Error('VIDEO_SCOPE_REVOKED');
        if (this.identity !== key) {
            for (const row of this.callers.values())
                row.controller.abort();
            this.callers.clear();
            this.tasks.clear();
            this.sourcePins.clear();
            this.identity = key;
            this.lease = randomUUID();
            this.ready = undefined;
            this.requests.clear();
            this.bindings.clear();
            this.admissions.clear();
            this.closingProjects.clear();
            this.selections.clear();
        }
        return owner;
    }
    assert(owner) {
        if (!this.options.isCurrent(owner.scope) || JSON.stringify(owner) !== this.identity || JSON.stringify(this.options.hostContext(owner.scope)) !== this.identity)
            throw Error('VIDEO_SCOPE_REVOKED');
    }
    async bind(scope, projectId) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId))
            throw Error('VIDEO_PROJECT_INVALID');
        const owner = this.owner(scope), closing = this.closingProjects.get(projectId);
        if (closing) {
            await closing;
            this.assert(owner);
        }
        const existing = this.requests.get(projectId);
        if (existing)
            return existing.then(value => { this.assert(owner); return value; });
        const request = this.admit(owner, projectId).catch(error => { if (this.requests.get(projectId) === request)
            this.requests.delete(projectId); throw error; });
        this.requests.set(projectId, request);
        return request;
    }
    async admit(owner, projectId) {
        const info = await this.options.runtime.command(owner.scope, 'projectInfo', { projectId });
        this.assert(owner);
        if (!record(info) || info.id !== projectId || typeof info.path !== 'string')
            throw Error('VIDEO_PROJECT_INVALID');
        await assertVideoPath(info.path);
        const root = await realpath(info.path);
        this.assert(owner);
        if (root !== info.path)
            throw Error('VIDEO_PATH_DENIED');
        // projectInfo has already checked domain admission, including original Studio renames.
        await this.options.runtime.admitPaths(owner.scope, { kind: 'project', paths: [root] });
        this.assert(owner);
        const store = join(accountVideoDirectory(this.options.userDataRoot, owner.scope.accountId), 'native-sessions');
        await assertVideoPath(store);
        await mkdir(store, { recursive: true });
        this.assert(owner);
        const file = join(store, createHash('sha256').update(projectId).digest('hex') + '.json');
        await assertVideoPath(file);
        try {
            await writeFile(file, JSON.stringify({ projectId, sessionId: 'session-video-' + randomUUID() }) + '\n', { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        const saved = JSON.parse(await readFile(file, 'utf8'));
        this.assert(owner);
        if (!record(saved) || Object.keys(saved).length !== 2 || saved.projectId !== projectId || typeof saved.sessionId !== 'string' || !/^session-video-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(saved.sessionId))
            throw Error('VIDEO_SESSION_INVALID');
        await (this.ready ??= this.options.command('scope', owner));
        this.assert(owner);
        const value = await this.options.command('bind', { ...owner, projectId, sessionId: saved.sessionId, lease: this.lease, root });
        this.assert(owner);
        if (!record(value) || !record(value.scope) || value.scope.accountGeneration !== this.options.runtime.generation(owner.scope) || value.scope.projectId !== projectId || value.scope.sessionId !== saved.sessionId || typeof value.scope.workspaceId !== 'string' || value.projectRoot !== root || value.lease !== this.lease || value.hostGeneration !== owner.hostGeneration || !record(value.ownedScope) || value.ownedScope.accountId !== owner.scope.accountId || value.ownedScope.generation !== owner.scope.generation)
            throw Error('VIDEO_BINDING_INVALID');
        const binding = { scope: { accountGeneration: this.options.runtime.generation(owner.scope), workspaceId: value.scope.workspaceId, projectId, sessionId: saved.sessionId }, ownedScope: { ...owner.scope }, hostGeneration: owner.hostGeneration, lease: this.lease, projectRoot: root };
        this.admissions.set(projectId, binding);
        await this.options.runtime.command(owner.scope, 'bind', { scope: binding.scope, projectRoot: root });
        this.assert(owner);
        await this.options.runtime.restoreProjectPaths(owner.scope, binding.scope);
        this.assert(owner);
        this.bindings.set(binding.scope.sessionId, binding);
        try {
            await this.options.command('tools', binding.scope);
            this.assert(owner);
        }
        catch (error) {
            this.bindings.delete(binding.scope.sessionId);
            throw error;
        }
        return binding;
    }
    /** Stop the previous project's native Agent, media and render work before re-admission. */
    async closeProject(scope, projectId) {
        const owner = this.owner(scope), existing = this.closingProjects.get(projectId);
        if (existing)
            return existing;
        for (const row of this.callers.values())
            if (row.binding.scope.projectId === projectId)
                row.controller.abort();
        this.tasks.delete(projectId);
        this.sourcePins.delete(projectId);
        const request = this.requests.get(projectId);
        const closing = Promise.resolve().then(async () => {
            await request?.catch(() => { });
            this.assert(owner);
            const binding = this.admissions.get(projectId);
            this.requests.delete(projectId);
            this.admissions.delete(projectId);
            this.selections.delete(projectId);
            if (binding)
                this.bindings.delete(binding.scope.sessionId);
            const stopped = await Promise.allSettled([
                ...(binding ? [this.options.runtime.command(scope, 'unbind', { scope: binding.scope }).catch(error => { if (!(error instanceof Error && error.message === 'VIDEO_SCOPE_REVOKED'))
                        throw error; })] : []),
                ...(this.ready ? [this.options.command('project-close', { ...owner, projectId })] : []),
            ]);
            this.assert(owner);
            const failed = stopped.find(result => result.status === 'rejected');
            if (failed?.status === 'rejected')
                throw failed.reason;
        });
        this.closingProjects.set(projectId, closing);
        try {
            await closing;
        }
        finally {
            if (this.closingProjects.get(projectId) === closing)
                this.closingProjects.delete(projectId);
        }
    }
    current = (scope) => {
        if (this.closingProjects.has(scope.projectId))
            return false;
        const value = this.bindings.get(scope.sessionId);
        if (!value || Object.keys(value.scope).some(key => Reflect.get(value.scope, key) !== Reflect.get(scope, key)))
            return false;
        try {
            this.assert({ scope: value.ownedScope, hostGeneration: value.hostGeneration });
            return true;
        }
        catch {
            return false;
        }
    };
    selection(scope, projectId, value) { const owner = this.owner(scope); this.assert(owner); this.selections.set(projectId, value); }
    isEditorOwner(caller, projectId) { const binding = this.admissions.get(projectId); return !!binding && this.current(binding.scope) && binding.scope.sessionId === caller.callerSessionId && binding.hostGeneration === caller.hostGeneration && binding.ownedScope.accountId === caller.scope.accountId && binding.ownedScope.generation === caller.scope.generation; }
    binding = async (scope, caller) => {
        if (!this.current(scope))
            throw Error('VIDEO_SCOPE_REVOKED');
        const value = this.bindings.get(scope.sessionId);
        const admitted = caller ? this.actualCaller(scope, caller) : undefined;
        return { scope: value.ownedScope, projectRoot: value.projectRoot, ...(admitted ? { callerSessionId: admitted.callerSessionId, toolCallId: admitted.toolCallId } : {}) };
    };
    actualCaller(scope, caller) {
        const grant = this.callers.get(caller.grantRef);
        if (!grant || grant.signal.aborted || grant.binding.scope.projectId !== scope.projectId || grant.binding.scope.sessionId !== scope.sessionId || grant.caller.callerSessionId !== caller.sessionId || grant.caller.toolCallId !== caller.toolCallId)
            throw Error('VIDEO_CALLER_REVOKED');
        this.assert({ scope: grant.caller.scope, hostGeneration: grant.caller.hostGeneration });
        return grant.caller;
    }
    capabilityCaller(scope, caller) { return structuredClone(this.actualCaller(scope, caller)); }
    async restoreSource(caller, directory) {
        if (!/^session-video-[a-f0-9-]{36}$/.test(caller.callerSessionId))
            return false;
        this.owner(caller.scope);
        const store = join(accountVideoDirectory(this.options.userDataRoot, caller.scope.accountId), 'native-sessions');
        await assertVideoPath(store);
        const files = await readdir(store).catch(error => { if (error.code === 'ENOENT')
            return []; throw error; });
        for (const file of files) {
            if (!/^[a-f0-9]{64}\.json$/.test(file))
                continue;
            const path = join(store, file);
            await assertVideoPath(path);
            const row = JSON.parse(await readFile(path, 'utf8'));
            if (!record(row) || row.sessionId !== caller.callerSessionId || typeof row.projectId !== 'string')
                continue;
            const binding = await this.bind(caller.scope, row.projectId);
            if (binding.scope.sessionId !== caller.callerSessionId || binding.projectRoot !== directory || binding.hostGeneration !== caller.hostGeneration)
                throw Error('VIDEO_SCOPE_REVOKED');
            return true;
        }
        return false;
    }
    async retainTask(caller, projectId) {
        const binding = await this.bind(caller.scope, projectId);
        if (caller.hostGeneration !== binding.hostGeneration)
            throw Error('VIDEO_SCOPE_REVOKED');
        let owners = this.tasks.get(projectId);
        if (!owners)
            this.tasks.set(projectId, owners = new Set());
        owners.add(caller.callerSessionId);
        return binding;
    }
    releaseTask(caller, projectId) { const owners = this.tasks.get(projectId); owners?.delete(caller.callerSessionId); if (!owners?.size)
        this.tasks.delete(projectId); }
    retainSource(caller) {
        const binding = this.bindings.get(caller.callerSessionId);
        if (!binding)
            return () => { };
        this.assert({ scope: caller.scope, hostGeneration: caller.hostGeneration });
        const id = binding.scope.projectId;
        let row = this.sourcePins.get(id);
        if (!row)
            this.sourcePins.set(id, row = { refs: 0 });
        row.refs++;
        const held = row;
        let released = false;
        return () => { if (released)
            return; released = true; if (--held.refs === 0 && this.sourcePins.get(id) === held)
            this.sourcePins.delete(id); };
    }
    async releaseView(scope, projectId) { if (!this.tasks.get(projectId)?.size && !this.sourcePins.get(projectId))
        await this.closeProject(scope, projectId); }
    async invokeCapability(caller, projectId, operation, input, signal) {
        const binding = await this.retainTask(caller, projectId), grantRef = randomUUID(), invocation = { schemaVersion: 1, grantRef, sessionId: caller.callerSessionId, toolCallId: caller.toolCallId }, controller = new AbortController();
        signal = AbortSignal.any([signal, controller.signal]);
        this.callers.set(grantRef, { caller: structuredClone(caller), binding, signal, controller });
        try {
            const value = operation === 'mediaChoices' ? await this.options.mediaChoices?.(binding.scope, signal, invocation) : await this.options.runtime.command(caller.scope, 'capability', { scope: binding.scope, caller: invocation, input: { operation, args: input } }, signal);
            this.actualCaller(binding.scope, invocation);
            signal.throwIfAborted();
            if (value === undefined)
                throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
            return value;
        }
        finally {
            this.callers.delete(grantRef);
        }
    }
    /** Studio operations use the same admitted native Session and existing media owner. */
    async capability(request, signal) {
        if (!this.current(request.scope))
            throw Error('VIDEO_SCOPE_REVOKED');
        signal.throwIfAborted();
        const actual = request.caller ? this.actualCaller(request.scope, request.caller) : undefined;
        if (request.operation === 'project-release') {
            if (!record(request.input) || Object.keys(request.input).length)
                throw Error('VIDEO_REQUEST_INVALID');
            const owner = this.bindings.get(request.scope.sessionId);
            await this.closeProject(owner.ownedScope, request.scope.projectId);
            signal.throwIfAborted();
            this.assert({ scope: owner.ownedScope, hostGeneration: owner.hostGeneration });
            return { data: { released: true }, artifacts: [] };
        }
        if (request.operation !== 'translate' && request.operation !== 'session-export') {
            if (!this.options.mediaRequest)
                throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
            return this.options.mediaRequest(request, signal);
        }
        const input = { scope: request.scope, operationId: request.requestId, operation: request.operation, input: request.input, ...(actual ? { callerSessionId: actual.callerSessionId } : {}) };
        const cancel = () => { void this.options.command('cancel-native', { scope: request.scope, operationId: request.requestId }).catch(() => { }); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
            const result = await this.options.command('native', input, signal);
            signal.throwIfAborted();
            if (!this.current(request.scope))
                throw Error('VIDEO_SCOPE_REVOKED');
            if (!record(result) || !Array.isArray(result.artifacts) || result.artifacts.length > (request.operation === 'translate' ? 0 : 1) || result.receiptRef !== request.requestId || !('data' in result))
                throw Error('VIDEO_NATIVE_RESPONSE_INVALID');
            const artifacts = result.artifacts.map(value => {
                if (!record(value) || typeof value.relativePath !== 'string' || !value.relativePath.startsWith('.film/chat/studybuddy-native/') || value.relativePath.includes('\\') || value.relativePath.split('/').includes('..') || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || value.mime !== 'application/zip')
                    throw Error('VIDEO_NATIVE_RESPONSE_INVALID');
                return { relativePath: value.relativePath, sha256: value.sha256, mime: value.mime };
            });
            return { data: result.data, artifacts, receiptRef: request.requestId };
        }
        finally {
            signal.removeEventListener('abort', cancel);
        }
    }
    async tool(request, signal) {
        if (!this.current(request.scope) || request.hostGeneration !== this.bindings.get(request.scope.sessionId)?.hostGeneration || !['readProject', 'readGuide', 'readFile', 'applyEdit', 'look', 'transcribe', 'translate', 'createExport', 'cancelExport', 'readExports', 'mediaChoices', 'mediaRequest'].includes(request.operation))
            throw Error('VIDEO_SCOPE_REVOKED');
        const binding = this.bindings.get(request.scope.sessionId);
        if (request.operation === 'mediaChoices') {
            if (!this.options.mediaChoices)
                throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
            return this.options.mediaChoices(request.scope, signal);
        }
        if (request.operation === 'mediaRequest') {
            if (!this.options.mediaRequest || !record(request.input) || Object.keys(request.input).some(key => !['operation', 'authorityRef', 'requestId', 'input'].includes(key)) || typeof request.input.operation !== 'string' || typeof request.input.authorityRef !== 'string' || typeof request.input.requestId !== 'string')
                throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
            const value = await this.options.runtime.command(binding.ownedScope, 'mediaRequest', { scope: request.scope, input: request.input }, signal);
            if (!this.current(request.scope))
                throw Error('VIDEO_SCOPE_REVOKED');
            return value;
        }
        const result = await this.options.runtime.command(binding.ownedScope, request.operation, { scope: request.scope, input: request.input }, signal);
        if (!this.current(request.scope))
            throw Error('VIDEO_SCOPE_REVOKED');
        return request.operation === 'readProject' && record(result) ? { ...result, selection: this.selections.get(request.scope.projectId) ?? null } : result;
    }
    async revoke() {
        for (const row of this.callers.values())
            row.controller.abort();
        this.callers.clear();
        this.tasks.clear();
        this.sourcePins.clear();
        this.identity = undefined;
        this.ready = undefined;
        this.requests.clear();
        this.bindings.clear();
        this.admissions.clear();
        this.closingProjects.clear();
        this.selections.clear();
        await this.options.command('scope', null);
    }
}
//# sourceMappingURL=video-bridge.js.map