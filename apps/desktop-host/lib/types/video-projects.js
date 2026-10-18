import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence';
import { parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts';
const same = (a, b) => !!a && a.hostGeneration === b.hostGeneration && a.scope.accountId === b.scope.accountId && a.scope.generation === b.scope.generation;
export function parseVideoProjectAdmission(value) {
    if (!value || typeof value !== 'object')
        throw Error('VIDEO_PROJECT_INVALID');
    const row = value;
    if (Object.keys(row).length !== 6 || Object.keys(row).some(key => !['scope', 'hostGeneration', 'projectId', 'sessionId', 'lease', 'root'].includes(key)) || typeof row.projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.projectId) || typeof row.sessionId !== 'string' || !/^session-video-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.sessionId) || typeof row.lease !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.lease) || typeof row.root !== 'string' || !isAbsolute(row.root))
        throw Error('VIDEO_PROJECT_INVALID');
    return { ...parseNativeBuiltinHostContextV1({ scope: row.scope, hostGeneration: row.hostGeneration }), projectId: row.projectId, sessionId: row.sessionId, lease: row.lease, root: row.root };
}
async function canonical(value) {
    for (let path = resolve(value);; path = dirname(path)) {
        if ((await lstat(path)).isSymbolicLink())
            throw Error('VIDEO_PATH_DENIED');
        if (dirname(path) === path)
            break;
    }
    if (!(await lstat(value)).isDirectory())
        throw Error('VIDEO_PATH_DENIED');
    return realpath(value);
}
/** Account-owned video projects admit real native workspaces and persistent Sessions. */
export class NativeVideoProjects {
    ctx;
    hostGeneration;
    scope = null;
    epoch = 0;
    lifecycle = new AbortController();
    cleanup = Promise.resolve();
    bindings = new Map();
    pending = new Map();
    constructor(ctx, hostGeneration) {
        this.ctx = ctx;
        this.hostGeneration = hostGeneration;
    }
    matchesScope(value) { return value === null ? this.scope === null : same(this.scope, parseNativeBuiltinHostContextV1(value)); }
    async setScope(value) {
        const next = value === null ? null : parseNativeBuiltinHostContextV1(value);
        if (next && next.hostGeneration !== this.hostGeneration)
            throw Error('VIDEO_SCOPE_REVOKED');
        if (next ? same(this.scope, next) : this.scope === null)
            return this.cleanup;
        const owned = this.owned(new Set(this.bindings.keys()));
        ++this.epoch;
        this.lifecycle.abort();
        this.lifecycle = new AbortController();
        this.scope = next;
        this.bindings.clear();
        this.pending.clear();
        for (const agent of owned)
            agent.cancel({ kind: 'parent' });
        await (this.cleanup = Promise.all([this.cleanup, ...owned.map(agent => agent.whenIdle())]).then(() => { }));
    }
    binding = (scope) => {
        const row = this.bindings.get(scope.sessionId);
        return row && same(this.scope, { scope: row.ownedScope, hostGeneration: row.hostGeneration }) && Object.keys(row.scope).every(key => Reflect.get(row.scope, key) === Reflect.get(scope, key)) ? row : undefined;
    };
    async bind(value) {
        const input = parseVideoProjectAdmission(value), epoch = this.epoch;
        this.assert(input, epoch);
        const previous = this.bindings.get(input.sessionId);
        if (previous) {
            if (previous.scope.projectId !== input.projectId || previous.lease !== input.lease || previous.projectRoot !== input.root)
                throw Error('VIDEO_PROJECT_CONFLICT');
            return previous;
        }
        const signature = JSON.stringify(input), pending = this.pending.get(input.sessionId);
        if (pending) {
            if (pending.signature !== signature)
                throw Error('VIDEO_PROJECT_CONFLICT');
            return pending.request;
        }
        const request = this.create(input, epoch).finally(() => { if (this.pending.get(input.sessionId)?.request === request)
            this.pending.delete(input.sessionId); });
        this.pending.set(input.sessionId, { signature, request });
        return request;
    }
    assert(value, epoch) { if (epoch !== this.epoch || !same(this.scope, value))
        throw Error('VIDEO_SCOPE_REVOKED'); }
    async create(input, epoch) {
        const signal = this.lifecycle.signal;
        await this.cleanup;
        this.assert(input, epoch);
        const root = await canonical(input.root);
        this.assert(input, epoch);
        if (root !== input.root)
            throw Error('VIDEO_PATH_DENIED');
        const sessionId = SessionId(input.sessionId);
        let stored = this.ctx.sessions.get(sessionId)?.header;
        const persistence = this.ctx.get('sessionPersistence');
        if (!stored && persistence) {
            try {
                const handle = await persistence.open(sessionId, 'read', { signal });
                try {
                    stored = handle.header;
                }
                finally {
                    await handle.close();
                }
            }
            catch (error) {
                if (!(error instanceof SessionPersistenceNotFoundError))
                    throw error;
            }
            this.assert(input, epoch);
        }
        // Workspace's live membership filters headers whose birth directory no longer resolves.
        // A renamed video's preserved header still identifies its original immutable Workspace path.
        const workspaces = stored ? this.ctx.workspaceRegistry.list() : [];
        const originalWorkspace = stored ? (workspaces.find(workspace => workspace.sessionIds.includes(sessionId)) ?? workspaces.find(workspace => workspace.path === stored.cwd)) : undefined;
        if (stored && (!stored.cwd || stored.parentSession || stored.cwd !== root && !originalWorkspace))
            throw Error('VIDEO_SESSION_CONFLICT');
        const existing = originalWorkspace ?? await this.ctx.workspaceRegistry.resolveByPath(root);
        this.assert(input, epoch);
        const workspace = existing ?? await this.ctx.workspaceRegistry.create(root);
        this.assert(input, epoch);
        await this.ctx.sessionController.create(originalWorkspace ? { sessionId, cwd: stored.cwd } : { sessionId, workspaceId: workspace.id });
        this.assert(input, epoch);
        const agent = this.ctx.agents.get(sessionId), directory = this.ctx.get('workingDirectory');
        if (!agent || !directory)
            throw Error('VIDEO_NATIVE_SESSION_UNAVAILABLE');
        if (directory.get(agent.session) !== root) {
            await directory.set(agent, root, signal);
            this.assert(input, epoch);
            await this.ctx.sessions.flush(agent.session);
            this.assert(input, epoch);
        }
        if (await canonical(root) !== root)
            throw Error('VIDEO_PATH_DENIED');
        this.assert(input, epoch);
        const scope = { accountGeneration: createHash('sha256').update(JSON.stringify([input.scope.accountId, input.scope.generation])).digest('hex'), workspaceId: workspace.id, projectId: input.projectId, sessionId: input.sessionId };
        const binding = { scope, ownedScope: { ...input.scope }, hostGeneration: input.hostGeneration, lease: input.lease, projectRoot: root };
        this.bindings.set(scope.sessionId, binding);
        return binding;
    }
    async close(projectId) {
        const rows = [...this.bindings.values()].filter(row => row.scope.projectId === projectId);
        const owned = this.owned(new Set(rows.map(row => row.scope.sessionId)));
        for (const row of rows)
            this.bindings.delete(row.scope.sessionId);
        for (const agent of owned)
            agent.cancel({ kind: 'user' });
        await Promise.all(owned.map(agent => agent.whenIdle()));
    }
    owned(roots) {
        const live = this.ctx.agents.list(), owned = live.filter(agent => roots.has(agent.id));
        for (let index = 0; index < owned.length; index++)
            for (const agent of live)
                if (!owned.includes(agent) && this.ctx.agents.isOwnedBy(agent.id, owned[index]))
                    owned.push(agent);
        return owned;
    }
}
//# sourceMappingURL=video-projects.js.map