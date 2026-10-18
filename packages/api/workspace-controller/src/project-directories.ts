/** Canonical source authority and recoverable managed directories for the current profile. */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId, realpathNormalize } from '@deepseek-ai/dsh-workspace'
import type { ProjectRequestId, WorkspaceSourceId, WorkspaceSourceFolder } from '@deepseek-ai/dsh-workspace/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { workspaceView } from './feed.ts'
import { projectDirectorySpec } from './project-directory-spec.ts'
import { validateDocumentsDirectory } from './default-directory.ts'
import type { ChatPrepareRequest, ChatPrepareValue, ProjectCreateRequest, SourceFolderView, WorkspaceValue } from './types.ts'

/** One profile owns all source registrations and allocation intents through this instance. */
export class ProjectDirectories {
  private domain: Domain<typeof projectDirectorySpec> | undefined
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  /**
   * @param ctx - current profile's Workspace and StorageDomain services.
   * @param documents - OS-aware Documents resolver; no directories are created by it.
   * @param managedRoot - optional fully qualified product-root override.
   */
  constructor(private readonly ctx: Context, private readonly documents: () => Promise<string>, private readonly managedRoot?: string) {
    if (managedRoot !== undefined) validateDocumentsDirectory(managedRoot)
    ctx.effect(() => async () => {
      this.disposed = true
      await this.tail
      await this.domain?.close()
    }, 'workspace.projects')
  }

  /**
   * Canonicalize and register one source without making a visible project.
   * @param request - user-picked directory.
   * @returns its stable current-profile identity; unavailable paths reject.
   */
  registerSource(request: { path: string }): Promise<SourceFolderView> {
    return this.enqueue(async () => {
      const path = await realpathNormalize(request.path)
      if (!(await stat(path)).isDirectory()) {
        throw new RemoteError('workspace/invalid-path', 'Choose an existing source directory', { path: request.path })
      }
      const domain = await this.open()
      const table = domain.table('sources')
      for (const [, source] of table.entries()) if (source.path === path) return source
      const source = { sourceId: randomUUID() as WorkspaceSourceId, path }
      await table.put(source.sourceId, source)
      return source
    })
  }

  /**
   * Prepare and durably register one confirmed named project.
   * @param request - stable request id, name, and current-profile source identities.
   * @returns the exact project; failures retain recoverable intent and never remove user files.
   */
  createProject(request: ProjectCreateRequest): Promise<WorkspaceValue> {
    return this.enqueue(async () => {
      const title = request.title.trim()
      if (title === '') throw new RemoteError('gateway/bad-request', 'Enter a project name', {})
      const domain = await this.open()
      const sourceIds = [...new Set(request.sourceIds)]
      const primarySourceId = request.primarySourceId ?? sourceIds[0]
      if (request.primarySourceId !== undefined && !sourceIds.includes(request.primarySourceId)) {
        throw this.unavailable(request.primarySourceId)
      }
      const fingerprint = JSON.stringify({ title, sourceIds, primarySourceId })
      const allocations = domain.table('allocations')
      let record = allocations.get(request.requestId)
      if (record !== undefined) {
        if (record.kind !== 'project' || record.fingerprint !== fingerprint) throw this.conflict(request.requestId)
        if (record.committed) {
          const project = this.ctx.workspaceRegistry.get(record.workspaceId)
          if (project === undefined) {
            throw new RemoteError('workspace/not-found', 'The prepared project is no longer registered', { workspaceId: record.workspaceId })
          }
          await this.validateSources(record.sourceFolders)
          return { workspace: workspaceView(project) }
        }
      } else {
        const existing = this.ctx.workspaceRegistry.list().find(project => project.title === title)
        if (existing !== undefined) throw new RemoteError('workspace/name-conflict', 'Choose another project name', { name: title })
        let sourceFolders: WorkspaceSourceFolder[] = []
        for (const id of sourceIds) {
          const source = domain.table('sources').get(id)
          if (source === undefined) throw this.unavailable(id)
          sourceFolders.push(source)
        }
        await this.validateSources(sourceFolders)
        const workspaceId = WorkspaceId(randomUUID())
        let managed: { path: string, ready: boolean } | undefined
        if (sourceFolders.length === 0) {
          const path = await this.target('Projects', String(workspaceId))
          const sourceId = randomUUID() as WorkspaceSourceId
          sourceFolders = [{ sourceId, path }]
          managed = { path, ready: false }
        }
        record = {
          kind: 'project', fingerprint, workspaceId, title, sourceFolders,
          primarySourceId: primarySourceId ?? sourceFolders[0]!.sourceId,
          ...(managed === undefined ? {} : { managed }), committed: false,
        }
        await allocations.put(request.requestId, record)
      }
      if (record.kind !== 'project') throw this.conflict(request.requestId)
      if (record.managed !== undefined) {
        try { await this.ensureManaged(record.managed) }
        catch (cause) {
          throw new RemoteError('workspace/managed-directory-unavailable', 'The project directory could not be prepared. Retry or choose sources.',
            { requestId: request.requestId }, { cause })
        }
        record = { ...record, managed: { ...record.managed, ready: true } }
        await allocations.put(request.requestId, record)
        for (const source of record.sourceFolders) await domain.table('sources').put(source.sourceId, source)
      }
      await this.validateSources(record.sourceFolders)
      const project = await this.ctx.workspaceRegistry.createProjectRecord({
        workspaceId: record.workspaceId, title: record.title,
        sourceFolders: record.sourceFolders, primarySourceId: record.primarySourceId,
      })
      await allocations.put(request.requestId, { ...record, committed: true })
      return { workspace: workspaceView(project) }
    })
  }

  /**
   * Allocate one ordinary-chat directory, without a visible Workspace or Session.
   * @param request - retry identity for this preparation.
   * @returns one stable generated cwd/Session identity.
   */
  prepareChat(request: ChatPrepareRequest): Promise<ChatPrepareValue> {
    return this.enqueue(async () => {
      const domain = await this.open()
      const allocations = domain.table('allocations')
      let record = allocations.get(request.requestId)
      if (record !== undefined && record.kind !== 'chat') throw this.conflict(request.requestId)
      if (record === undefined) {
        const id = randomUUID()
        record = {
          kind: 'chat', fingerprint: 'chat', sessionId: SessionId('session-' + id),
          managed: { path: await this.target('Chats', id), ready: false },
        }
        await allocations.put(request.requestId, record)
      }
      if (record.kind !== 'chat') throw this.conflict(request.requestId)
      try {
        await this.ensureManaged(record.managed)
        if (!record.managed.ready) await allocations.put(request.requestId, { ...record, managed: { ...record.managed, ready: true } })
      } catch (cause) {
        throw new RemoteError('workspace/managed-directory-unavailable',
          'The chat directory could not be prepared. Retry or choose another project.',
          { requestId: request.requestId }, { cause })
      }
      return { cwd: record.managed.path, sessionId: record.sessionId }
    })
  }

  private async open(): Promise<Domain<typeof projectDirectorySpec>> {
    this.domain ??= await this.ctx.storageDomain.open(projectDirectorySpec)
    if (this.domain.global.get().namespace === null) await this.domain.global.set({ namespace: randomUUID() })
    return this.domain
  }

  private async target(category: 'Projects' | 'Chats', id: string): Promise<string> {
    const domain = await this.open()
    const documents = await realpath(await this.documents())
    const product = this.managedRoot ?? join(documents, 'StudyBuddy')
    const parent = await realpath(dirname(product))
    const normalizedProduct = join(parent, basename(product))
    const namespace = domain.global.get().namespace
    if (namespace === null) throw new Error('Project namespace was not committed')
    return join(normalizedProduct, namespace, category, id)
  }

  private async ensureManaged(allocation: { path: string, ready: boolean }): Promise<void> {
    const domain = await this.open()
    const namespace = domain.global.get().namespace
    const categoryRoot = dirname(allocation.path)
    const namespaceRoot = dirname(categoryRoot)
    const productRoot = dirname(namespaceRoot)
    if (basename(namespaceRoot) !== namespace || !['Projects', 'Chats'].includes(basename(categoryRoot))
      || !/^[0-9a-f-]{36}$/.test(basename(allocation.path))) throw new Error('Invalid managed allocation identity')
    const base = await realpath(dirname(productRoot))
    for (const path of [productRoot, namespaceRoot, categoryRoot, allocation.path]) {
      const offset = relative(base, path)
      if (offset === '' || offset.startsWith('..' + sep) || offset === '..') throw new Error('Managed allocation escapes its parent')
      let info
      try { info = await lstat(path) } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
      if (info === undefined) {
        if (allocation.ready) throw new Error('Managed chat directory is unavailable')
        try { await mkdir(path) }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
        info = await lstat(path)
      } else if (path === allocation.path && !allocation.ready && (await readdir(path)).length > 0) {
        throw new Error('Uncommitted allocation directory contains files; preserve it for recovery')
      }
      if (info.isSymbolicLink() || !info.isDirectory() || await realpath(path) !== path) {
        throw new Error('Managed allocation has an unexpected link or directory')
      }
    }
  }

  private async validateSources(sources: readonly WorkspaceSourceFolder[]): Promise<void> {
    for (const source of sources) {
      try {
        if (await realpathNormalize(source.path) !== source.path || !(await stat(source.path)).isDirectory()) throw this.unavailable(source.sourceId)
      } catch (cause) {
        throw new RemoteError('workspace/source-unavailable', 'This project source is unavailable. Reselect it or work outside a project.',
          { sourceId: source.sourceId }, { cause })
      }
    }
  }

  private conflict(requestId: ProjectRequestId) {
    return new RemoteError('workspace/project-request-conflict', 'This request was already used with different input', { requestId })
  }

  private unavailable(sourceId: WorkspaceSourceId) {
    return new RemoteError('workspace/source-unavailable', 'Select a source from the current profile', { sourceId })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Project directories are closed'))
    const result = this.tail.then(operation)
    this.tail = result.then(() => {}, () => {})
    return result
  }
}
