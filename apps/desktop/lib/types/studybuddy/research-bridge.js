/** Main owns project-to-native bindings; no page may nominate paths, accounts or Sessions. */
import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHarnessResearchContextV1, parseHarnessResearchInvocationV1 } from '@studybuddy/contracts';
import { accountResearchDirectory } from "./research-runtime.js";
import { assertResearchPath } from "./research-resources.js";
import { ResearchChatStore } from "./research-chat-store.js";
import { isResearchReference } from "./research-actions.js";
import { readResearchSpeech, parseResearchSpeechResult } from "./research-speech.js";
/** Durable Session identity is written before private admission so retries cannot create duplicates. */
export class ResearchBridge {
    options;
    identity;
    lease = randomUUID();
    bindings = new Map();
    admittedBindings = new Map();
    exportRoots = new Map();
    scopeReady;
    chatStore;
    constructor(options) {
        this.options = options;
    }
    owner(scope) {
        if (!this.options.isCurrent(scope))
            throw Error('RESEARCH_SCOPE_REVOKED');
        const owner = this.options.hostContext(scope);
        if (owner.scope.accountId !== scope.accountId || owner.scope.generation !== scope.generation)
            throw Error('RESEARCH_SCOPE_REVOKED');
        const key = JSON.stringify(owner);
        if (key !== this.identity) {
            this.identity = key;
            this.lease = randomUUID();
            this.bindings.clear();
            this.admittedBindings.clear();
            this.exportRoots.clear();
            this.scopeReady = undefined;
            this.chatStore = new ResearchChatStore(() => this.identity === key && this.options.isCurrent(scope));
        }
        return owner;
    }
    assert(scope, owner) {
        if (!this.options.isCurrent(scope) || this.identity !== JSON.stringify(owner) || JSON.stringify(this.options.hostContext(scope)) !== JSON.stringify(owner))
            throw Error('RESEARCH_SCOPE_REVOKED');
    }
    /** Resolve an existing admitted project to its persistent native Session.
     * @param scope - Authenticated Main account generation.
     * @param projectId - Existing named project, never a directory supplied by a page.
     * @returns Main-owned native binding. */
    async bind(scope, projectId, requestedSessionId) {
        const owner = this.owner(scope), chats = await this.chats(scope, projectId);
        this.assert(scope, owner);
        const sessionId = requestedSessionId ?? chats.selectedSessionId;
        if (sessionId === null)
            throw Error('RESEARCH_CHAT_NOT_SELECTED');
        if (!chats.chats.some(chat => chat.sessionId === sessionId))
            throw Error('RESEARCH_CHAT_NOT_FOUND');
        const cached = this.bindings.get(sessionId);
        if (cached)
            return cached.then(binding => { this.assert(scope, owner); if (binding.projectId !== projectId)
                throw Error('RESEARCH_BINDING_INVALID'); return binding; });
        const request = this.admit(scope, owner, projectId, sessionId).catch(error => { if (this.bindings.get(sessionId) === request)
            this.bindings.delete(sessionId); throw error; });
        this.bindings.set(sessionId, request);
        return request;
    }
    async project(scope, owner, projectId) {
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId))
            throw Error('RESEARCH_PROJECT_INVALID');
        const project = join(accountResearchDirectory(this.options.userDataRoot, scope.accountId), 'projects', projectId);
        await assertResearchPath(project);
        this.assert(scope, owner);
        const metadata = join(project, 'project.json');
        await assertResearchPath(metadata);
        const stat = await lstat(metadata);
        if (!stat.isFile() || stat.size > 1024 * 1024)
            throw Error('RESEARCH_PROJECT_INVALID');
        const meta = JSON.parse(await readFile(metadata, 'utf8'));
        if (!meta || typeof meta !== 'object' || !('id' in meta) || meta.id !== projectId)
            throw Error('RESEARCH_PROJECT_INVALID');
        this.assert(scope, owner);
        return project;
    }
    /** Mutate only this owned project's tab list; selections must already belong to its manifest. */
    async chats(scope, projectId, operation = 'list', sessionId) {
        const owner = this.owner(scope), project = await this.project(scope, owner, projectId), store = this.chatStore;
        this.assert(scope, owner);
        const file = join(project, '.studybuddy-native.json');
        const value = await (operation === 'create' ? store.create(file) : operation === 'select' ? store.select(file, sessionId ?? '') : operation === 'close' ? store.close(file, sessionId ?? '') : store.get(file));
        this.assert(scope, owner);
        return value;
    }
    /** Admit an existing sandbox file reference without accepting paths supplied as authority. */
    async reference(scope, projectId, path) {
        if (!isResearchReference(path))
            throw Error('RESEARCH_ACTION_INVALID');
        const owner = this.owner(scope), project = await this.project(scope, owner, projectId), target = join(project, 'sandbox', path);
        await assertResearchPath(target);
        this.assert(scope, owner);
        if (!(await lstat(target)).isFile())
            throw Error('RESEARCH_REFERENCE_NOT_FOUND');
        this.assert(scope, owner);
    }
    async admit(scope, owner, projectId, sessionId) {
        const project = await this.project(scope, owner, projectId);
        const sandbox = join(project, 'sandbox');
        await assertResearchPath(sandbox);
        const root = await realpath(sandbox);
        this.assert(scope, owner);
        this.assert(scope, owner);
        await (this.scopeReady ??= this.options.command('scope', owner).then(() => undefined));
        this.assert(scope, owner);
        const value = await this.options.command('bind', { ...owner, projectId, root, sessionId, lease: this.lease });
        this.assert(scope, owner);
        if (!value || typeof value !== 'object' || !('workspaceId' in value))
            throw Error('RESEARCH_BINDING_INVALID');
        const binding = parseHarnessResearchContextV1({ scope: Reflect.get(value, 'scope'), hostGeneration: Reflect.get(value, 'hostGeneration'), projectId: Reflect.get(value, 'projectId'),
            workspaceId: value.workspaceId, sessionId: Reflect.get(value, 'sessionId'), lease: Reflect.get(value, 'lease') });
        if (binding.projectId !== projectId || binding.sessionId !== sessionId || binding.lease !== this.lease || JSON.stringify({ scope: binding.scope, hostGeneration: binding.hostGeneration }) !== JSON.stringify(owner))
            throw Error('RESEARCH_BINDING_INVALID');
        this.admittedBindings.set(sessionId, Object.freeze(binding));
        try {
            await this.options.command('tools', { context: binding });
            this.assert(scope, owner);
        }
        catch (error) {
            this.admittedBindings.delete(sessionId);
            throw error;
        }
        return Object.freeze(binding);
    }
    /** Read an already admitted binding during private tool setup without re-entering bind. */
    bound(scope, projectId, sessionId) {
        const owner = this.owner(scope), binding = this.admittedBindings.get(sessionId);
        this.assert(scope, owner);
        if (!binding || binding.projectId !== projectId)
            throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
        return binding;
    }
    /** Dispatch a closed child action through the actual native owner.
     * @param scope - Current account generation.
     * @param request - Correlated private action, containing no model route.
     * @param signal - Observer cancellation; an admitted model request is not replayed.
     * @returns Native result or uncertain failure. */
    async invoke(scope, request, signal) {
        signal.throwIfAborted();
        const owner = this.owner(scope);
        if (request.operation === 'journal-sessions') {
            if (request.input !== null || request.sessionId !== undefined)
                throw Error('HARNESS_RESEARCH_REQUEST_INVALID');
            const chats = await this.chats(scope, request.projectId);
            signal.throwIfAborted();
            this.assert(scope, owner);
            const sessions = [], seen = new Set();
            for (const chat of chats.chats) {
                const context = await this.bind(scope, request.projectId, chat.sessionId);
                const result = await this.options.command('journal-export', { context, input: { kind: 'sessions' } });
                signal.throwIfAborted();
                this.assert(scope, owner);
                if (!Array.isArray(result) || result.length > 1024)
                    throw Error('RESEARCH_EXPORT_INVALID');
                for (const row of result) {
                    if (!row || typeof row.id !== 'string' || !/^session-[a-f0-9-]{36}$/.test(row.id) || !(row.parentSessionId === null || typeof row.parentSessionId === 'string'))
                        throw Error('RESEARCH_EXPORT_INVALID');
                    if (seen.has(row.id))
                        continue;
                    if (sessions.length >= 1024)
                        throw Error('RESEARCH_EXPORT_LIMIT');
                    seen.add(row.id);
                    this.exportRoots.set(request.projectId + ':' + row.id, chat.sessionId);
                    sessions.push({ id: row.id, label: row.id === chat.sessionId ? chat.label : '研究子任务 ' + row.id.slice(8, 16), closed: row.id === chat.sessionId ? chat.closed : true, parentSessionId: row.parentSessionId, rootSessionId: chat.sessionId });
                }
            }
            return { projectId: request.projectId, sessions };
        }
        const exportRoot = request.operation === 'journal-export' && request.sessionId ? this.exportRoots.get(request.projectId + ':' + request.sessionId) : undefined;
        const binding = request.operation === 'journal-export' || request.operation === 'goal' || request.operation === 'schedules' ? await this.bind(scope, request.projectId, exportRoot ?? request.sessionId) : request.sessionId ? this.bound(scope, request.projectId, request.sessionId) : await this.bind(scope, request.projectId);
        signal.throwIfAborted();
        this.assert(scope, owner);
        if (request.operation === 'bind')
            return binding;
        if (request.operation === 'speech-transcribe') {
            if (!this.options.speech)
                throw Error('RESEARCH_SPEECH_UNAVAILABLE');
            const project = await this.project(scope, owner, request.projectId);
            const input = await readResearchSpeech(join(project, 'sandbox'), request.input, signal);
            this.assert(scope, owner);
            signal.throwIfAborted();
            const result = await this.options.speech(scope, input, signal, binding);
            this.assert(scope, owner);
            signal.throwIfAborted();
            return parseResearchSpeechResult(result, input.requestId);
        }
        if (request.operation === 'settlements') {
            if (!this.options.settlements)
                throw Error('RESEARCH_BUDGET_USAGE_UNAVAILABLE');
            const result = await this.options.settlements(scope, request.input, signal);
            this.assert(scope, owner);
            return result;
        }
        if (request.operation === 'model-catalog') {
            if (request.input !== null)
                throw Error('HARNESS_RESEARCH_REQUEST_INVALID');
            const data = await this.options.command('model-catalog', { context: binding });
            signal.throwIfAborted();
            this.assert(scope, owner);
            return data;
        }
        if (request.operation === 'advanced' || request.operation === 'goal' || request.operation === 'schedules') {
            const data = await this.options.command(request.operation, { context: binding, input: request.input });
            signal.throwIfAborted();
            this.assert(scope, owner);
            return data;
        }
        if (request.operation === 'journal-export') {
            if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input) || Object.keys(request.input).length !== 2 || !('cursor' in request.input) || !('endSeq' in request.input))
                throw Error('RESEARCH_EXPORT_INVALID');
            const data = await this.options.command('journal-export', { context: binding, input: { sessionId: request.sessionId ?? binding.sessionId, cursor: request.input.cursor, endSeq: request.input.endSeq } });
            signal.throwIfAborted();
            this.assert(scope, owner);
            return data;
        }
        if (request.operation === 'journal') {
            if (!request.input || typeof request.input !== 'object' || Object.keys(request.input).length !== 1 || !('afterSeq' in request.input) ||
                !Number.isSafeInteger(request.input.afterSeq) || Number(request.input.afterSeq) < -1)
                throw Error('HARNESS_RESEARCH_REQUEST_INVALID');
            const data = await this.options.command('journal', { context: binding, afterSeq: request.input.afterSeq });
            signal.throwIfAborted();
            this.assert(scope, owner);
            return data;
        }
        if (request.operation === 'project-close') {
            await this.options.command('project-close', { projectId: request.projectId });
            for (const [id, row] of this.admittedBindings)
                if (row.projectId === request.projectId) {
                    this.bindings.delete(id);
                    this.admittedBindings.delete(id);
                }
            for (const key of this.exportRoots.keys())
                if (key.startsWith(request.projectId + ':'))
                    this.exportRoots.delete(key);
            return null;
        }
        const parsed = parseHarnessResearchInvocationV1({ schemaVersion: 1, rpcId: request.rpcId, context: binding, operation: request.operation, input: request.input });
        const result = await this.options.command('invoke', parsed);
        signal.throwIfAborted();
        this.assert(scope, owner);
        return result;
    }
    /** Fence private bindings while leaving original project/session files intact.
     * @returns Completion of native admission revocation. */
    async revoke() {
        const applied = this.scopeReady;
        this.identity = undefined;
        this.bindings.clear();
        this.admittedBindings.clear();
        this.exportRoots.clear();
        this.scopeReady = undefined;
        this.chatStore = undefined;
        if (applied) {
            await applied.catch(() => undefined);
            await this.options.command('scope', null);
        }
    }
}
//# sourceMappingURL=research-bridge.js.map