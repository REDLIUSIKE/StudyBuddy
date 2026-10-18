/** Canonical source authority and recoverable managed directories for the current profile. */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { SessionId } from '@deepseek-ai/dsh-session';
import { WorkspaceId, realpathNormalize } from '@deepseek-ai/dsh-workspace';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceView } from "./feed.js";
import { projectDirectorySpec } from "./project-directory-spec.js";
import { validateDocumentsDirectory } from "./default-directory.js";
/** One profile owns all source registrations and allocation intents through this instance. */
export class ProjectDirectories {
    ctx;
    documents;
    managedRoot;
    domain;
    tail = Promise.resolve();
    disposed = false;
    /**
     * @param ctx - current profile's Workspace and StorageDomain services.
     * @param documents - OS-aware Documents resolver; no directories are created by it.
     * @param managedRoot - optional fully qualified product-root override.
     */
    constructor(ctx, documents, managedRoot) {
        this.ctx = ctx;
        this.documents = documents;
        this.managedRoot = managedRoot;
        if (managedRoot !== undefined)
            validateDocumentsDirectory(managedRoot);
        ctx.effect(() => async () => {
            this.disposed = true;
            await this.tail;
            await this.domain?.close();
        }, 'workspace.projects');
    }
    /**
     * Canonicalize and register one source without making a visible project.
     * @param request - user-picked directory.
     * @returns its stable current-profile identity; unavailable paths reject.
     */
    registerSource(request) {
        return this.enqueue(async () => {
            const path = await realpathNormalize(request.path);
            if (!(await stat(path)).isDirectory()) {
                throw new RemoteError('workspace/invalid-path', 'Choose an existing source directory', { path: request.path });
            }
            const domain = await this.open();
            const table = domain.table('sources');
            for (const [, source] of table.entries())
                if (source.path === path)
                    return source;
            const source = { sourceId: randomUUID(), path };
            await table.put(source.sourceId, source);
            return source;
        });
    }
    /**
     * Prepare and durably register one confirmed named project.
     * @param request - stable request id, name, and current-profile source identities.
     * @returns the exact project; failures retain recoverable intent and never remove user files.
     */
    createProject(request) {
        return this.enqueue(async () => {
            const title = request.title.trim();
            if (title === '')
                throw new RemoteError('gateway/bad-request', 'Enter a project name', {});
            const domain = await this.open();
            const sourceIds = [...new Set(request.sourceIds)];
            const primarySourceId = request.primarySourceId ?? sourceIds[0];
            if (request.primarySourceId !== undefined && !sourceIds.includes(request.primarySourceId)) {
                throw this.unavailable(request.primarySourceId);
            }
            const fingerprint = JSON.stringify({ title, sourceIds, primarySourceId });
            const allocations = domain.table('allocations');
            let record = allocations.get(request.requestId);
            if (record !== undefined) {
                if (record.kind !== 'project' || record.fingerprint !== fingerprint)
                    throw this.conflict(request.requestId);
                if (record.committed) {
                    const project = this.ctx.workspaceRegistry.get(record.workspaceId);
                    if (project === undefined) {
                        throw new RemoteError('workspace/not-found', 'The prepared project is no longer registered', { workspaceId: record.workspaceId });
                    }
                    await this.validateSources(record.sourceFolders);
                    return { workspace: workspaceView(project) };
                }
            }
            else {
                const existing = this.ctx.workspaceRegistry.list().find(project => project.title === title);
                if (existing !== undefined)
                    throw new RemoteError('workspace/name-conflict', 'Choose another project name', { name: title });
                let sourceFolders = [];
                for (const id of sourceIds) {
                    const source = domain.table('sources').get(id);
                    if (source === undefined)
                        throw this.unavailable(id);
                    sourceFolders.push(source);
                }
                await this.validateSources(sourceFolders);
                const workspaceId = WorkspaceId(randomUUID());
                let managed;
                if (sourceFolders.length === 0) {
                    const path = await this.target('Projects', String(workspaceId));
                    const sourceId = randomUUID();
                    sourceFolders = [{ sourceId, path }];
                    managed = { path, ready: false };
                }
                record = {
                    kind: 'project', fingerprint, workspaceId, title, sourceFolders,
                    primarySourceId: primarySourceId ?? sourceFolders[0].sourceId,
                    ...(managed === undefined ? {} : { managed }), committed: false,
                };
                await allocations.put(request.requestId, record);
            }
            if (record.kind !== 'project')
                throw this.conflict(request.requestId);
            if (record.managed !== undefined) {
                try {
                    await this.ensureManaged(record.managed);
                }
                catch (cause) {
                    throw new RemoteError('workspace/managed-directory-unavailable', 'The project directory could not be prepared. Retry or choose sources.', { requestId: request.requestId }, { cause });
                }
                record = { ...record, managed: { ...record.managed, ready: true } };
                await allocations.put(request.requestId, record);
                for (const source of record.sourceFolders)
                    await domain.table('sources').put(source.sourceId, source);
            }
            await this.validateSources(record.sourceFolders);
            const project = await this.ctx.workspaceRegistry.createProjectRecord({
                workspaceId: record.workspaceId, title: record.title,
                sourceFolders: record.sourceFolders, primarySourceId: record.primarySourceId,
            });
            await allocations.put(request.requestId, { ...record, committed: true });
            return { workspace: workspaceView(project) };
        });
    }
    /**
     * Allocate one ordinary-chat directory, without a visible Workspace or Session.
     * @param request - retry identity for this preparation.
     * @returns one stable generated cwd/Session identity.
     */
    prepareChat(request) {
        return this.enqueue(async () => {
            const domain = await this.open();
            const allocations = domain.table('allocations');
            let record = allocations.get(request.requestId);
            if (record !== undefined && record.kind !== 'chat')
                throw this.conflict(request.requestId);
            if (record === undefined) {
                const id = randomUUID();
                record = {
                    kind: 'chat', fingerprint: 'chat', sessionId: SessionId('session-' + id),
                    managed: { path: await this.target('Chats', id), ready: false },
                };
                await allocations.put(request.requestId, record);
            }
            if (record.kind !== 'chat')
                throw this.conflict(request.requestId);
            try {
                await this.ensureManaged(record.managed);
                if (!record.managed.ready)
                    await allocations.put(request.requestId, { ...record, managed: { ...record.managed, ready: true } });
            }
            catch (cause) {
                throw new RemoteError('workspace/managed-directory-unavailable', 'The chat directory could not be prepared. Retry or choose another project.', { requestId: request.requestId }, { cause });
            }
            return { cwd: record.managed.path, sessionId: record.sessionId };
        });
    }
    async open() {
        this.domain ??= await this.ctx.storageDomain.open(projectDirectorySpec);
        if (this.domain.global.get().namespace === null)
            await this.domain.global.set({ namespace: randomUUID() });
        return this.domain;
    }
    async target(category, id) {
        const domain = await this.open();
        const documents = await realpath(await this.documents());
        const product = this.managedRoot ?? join(documents, 'StudyBuddy');
        const parent = await realpath(dirname(product));
        const normalizedProduct = join(parent, basename(product));
        const namespace = domain.global.get().namespace;
        if (namespace === null)
            throw new Error('Project namespace was not committed');
        return join(normalizedProduct, namespace, category, id);
    }
    async ensureManaged(allocation) {
        const domain = await this.open();
        const namespace = domain.global.get().namespace;
        const categoryRoot = dirname(allocation.path);
        const namespaceRoot = dirname(categoryRoot);
        const productRoot = dirname(namespaceRoot);
        if (basename(namespaceRoot) !== namespace || !['Projects', 'Chats'].includes(basename(categoryRoot))
            || !/^[0-9a-f-]{36}$/.test(basename(allocation.path)))
            throw new Error('Invalid managed allocation identity');
        const base = await realpath(dirname(productRoot));
        for (const path of [productRoot, namespaceRoot, categoryRoot, allocation.path]) {
            const offset = relative(base, path);
            if (offset === '' || offset.startsWith('..' + sep) || offset === '..')
                throw new Error('Managed allocation escapes its parent');
            let info;
            try {
                info = await lstat(path);
            }
            catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                    throw error;
            }
            if (info === undefined) {
                if (allocation.ready)
                    throw new Error('Managed chat directory is unavailable');
                try {
                    await mkdir(path);
                }
                catch (error) {
                    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST'))
                        throw error;
                }
                info = await lstat(path);
            }
            else if (path === allocation.path && !allocation.ready && (await readdir(path)).length > 0) {
                throw new Error('Uncommitted allocation directory contains files; preserve it for recovery');
            }
            if (info.isSymbolicLink() || !info.isDirectory() || await realpath(path) !== path) {
                throw new Error('Managed allocation has an unexpected link or directory');
            }
        }
    }
    async validateSources(sources) {
        for (const source of sources) {
            try {
                if (await realpathNormalize(source.path) !== source.path || !(await stat(source.path)).isDirectory())
                    throw this.unavailable(source.sourceId);
            }
            catch (cause) {
                throw new RemoteError('workspace/source-unavailable', 'This project source is unavailable. Reselect it or work outside a project.', { sourceId: source.sourceId }, { cause });
            }
        }
    }
    conflict(requestId) {
        return new RemoteError('workspace/project-request-conflict', 'This request was already used with different input', { requestId });
    }
    unavailable(sourceId) {
        return new RemoteError('workspace/source-unavailable', 'Select a source from the current profile', { sourceId });
    }
    enqueue(operation) {
        if (this.disposed)
            return Promise.reject(new Error('Project directories are closed'));
        const result = this.tail.then(operation);
        this.tail = result.then(() => { }, () => { });
        return result;
    }
}
//# sourceMappingURL=project-directories.js.map