import { mkdir, mkdtemp, readFile, realpath, readdir, rm, rmdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, symbols } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { ProjectRequestId, WorkspaceSourceId } from '@deepseek-ai/dsh-workspace/types'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WorkspaceController from '../src/index.ts'

const contexts: Context[] = []
const directories: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})

const intent = (): ProjectRequestId => randomUUID() as ProjectRequestId

async function harness(pool = new MemoryMediaPool(), documents?: string) {
  const root = documents ?? await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-test-')))
  if (documents === undefined) directories.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const domain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', domain)
  // The production storage provider is a sibling plugin, not an ambient root service.
  await ctx.plugin((provider: Context) => { provider.provide('storageDomain', domain) })
  ctx.provide('sessionPersistence', { list: async () => [] } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = () => {}
  ctx.provide('typert', { lookups: { configure: () => dispose }, contexts: { configureHost: () => dispose } } as never)
  await ctx.plugin(WorkspaceController, { documentsDirectory: root })
  // Remote dispatch uses the original plugin owner, not a root-rebound service proxy.
  const controller = Reflect.get(ctx.workspaceController, symbols.original) as WorkspaceController
  return { ctx, controller, pool, root }
}

async function sourceDirectory(root: string, name: string) {
  const path = join(root, name)
  await mkdir(path)
  return path
}

describe('profile-owned project directory preparation', () => {
  it('allows the managed source of a name-only project to be reused as an exact source', async () => {
    const h = await harness()
    const first = await h.controller.createProject({ requestId: intent(), title: 'First', sourceIds: [] })
    const source = first.workspace.sourceFolders![0]!
    expect(await h.controller.registerSource({ path: source.path })).toEqual(source)
    const second = await h.controller.createProject({ requestId: intent(), title: 'Second', sourceIds: [source.sourceId] })
    expect(second.workspace.path).toBe(source.path)
    expect(second.workspace.workspaceId).not.toBe(first.workspace.workspaceId)
  })
  it('creates a named project without asking for a source directory or creating a Session', async () => {
    const h = await harness()
    const result = await h.controller.createProject({ requestId: intent(), title: '毕业论文', sourceIds: [] })
    expect(result.workspace.title).toBe('毕业论文')
    expect(result.workspace.sessionIds).toEqual([])
    expect(relative(h.root, result.workspace.path)).toMatch(/^StudyBuddy[\\/][^\\/]+[\\/]Projects[\\/]/)
    expect(await readdir(result.workspace.path)).toEqual([])
    expect(h.ctx.sessions.list()).toEqual([])
  })

  it('registers aliases as one canonical source without making a visible project', async () => {
    const h = await harness()
    const path = await sourceDirectory(h.root, '资料 文件夹')
    const alias = join(h.root, '资料别名')
    await symlink(path, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const a = await h.controller.registerSource({ path })
    const b = await h.controller.registerSource({ path: alias })
    expect(b).toEqual(a)
    expect(a.path).toBe(await realpath(path))
    expect(h.ctx.workspaceRegistry.list()).toEqual([])
  })

  it('uses the explicit primary and preserves an existing project and user files', async () => {
    const h = await harness()
    const a = await sourceDirectory(h.root, '主资料')
    const b = await sourceDirectory(h.root, '其他资料')
    await writeFile(join(a, 'keep.txt'), 'original')
    const old = await h.controller.create({ path: a })
    const first = await h.controller.registerSource({ path: a })
    const second = await h.controller.registerSource({ path: b })
    const result = await h.controller.createProject({
      requestId: intent(), title: '新组合', sourceIds: [first.sourceId, second.sourceId], primarySourceId: second.sourceId,
    })
    expect(result.workspace.path).toBe(await realpath(b))
    expect(result.workspace.workspaceId).not.toBe(old.workspace.workspaceId)
    expect(result.workspace.sourceFolders).toEqual([first, second])
    expect(h.ctx.workspaceRegistry.get(old.workspace.workspaceId)?.path).toBe(await realpath(a))
    expect(await readFile(join(a, 'keep.txt'), 'utf8')).toBe('original')
  })

  it('deduplicates repeated source identities while the first remains primary', async () => {
    const h = await harness()
    const source = await h.controller.registerSource({ path: await sourceDirectory(h.root, 'source') })
    const project = await h.controller.createProject({
      requestId: intent(), title: 'Sources', sourceIds: [source.sourceId, source.sourceId],
    })
    expect(project.workspace.path).toBe(source.path)
    expect(project.workspace.sourceFolders).toEqual([source])
  })

  it('resolves concurrent and lost-reply retries to one project identity', async () => {
    const h = await harness()
    const request = { requestId: intent(), title: '同一操作', sourceIds: [] }
    const [a, b] = await Promise.all([h.controller.createProject(request), h.controller.createProject(request)])
    const again = await h.controller.createProject(request)
    expect(b).toEqual(a)
    expect(again).toEqual(a)
    expect(h.ctx.workspaceRegistry.list()).toHaveLength(1)
  })

  it('rejects a changed payload for an already committed request', async () => {
    const h = await harness()
    const requestId = intent()
    await h.controller.createProject({ requestId, title: 'A', sourceIds: [] })
    await expect(h.controller.createProject({ requestId, title: 'B', sourceIds: [] }))
      .rejects.toMatchObject({ code: 'workspace/project-request-conflict' })
    expect(h.ctx.workspaceRegistry.list().map(row => row.title)).toEqual(['A'])
  })

  it('keeps ordinary chats ungrouped with distinct paths and stable retry identities', async () => {
    const h = await harness()
    const requestId = intent()
    const [a, b] = await Promise.all([
      h.controller.prepareChat({ requestId }), h.controller.prepareChat({ requestId: intent() }),
    ])
    expect(a.cwd).not.toBe(b.cwd)
    expect(a.sessionId).not.toBe(b.sessionId)
    expect(await h.controller.prepareChat({ requestId })).toEqual(a)
    expect(relative(h.root, a.cwd)).toMatch(/^StudyBuddy[\\/][^\\/]+[\\/]Chats[\\/]/)
    expect(h.ctx.workspaceRegistry.list()).toEqual([])
    expect(h.ctx.sessions.list()).toEqual([])
  })

  it('recovers the same creation after the account domain is reopened', async () => {
    const h = await harness()
    const request = { requestId: intent(), title: '恢复项目', sourceIds: [] }
    const first = await h.controller.createProject(request)
    await h.ctx.fiber.dispose()
    const resumed = await harness(h.pool, h.root)
    expect(await resumed.controller.createProject(request)).toEqual(first)
    expect(resumed.ctx.workspaceRegistry.list()).toHaveLength(1)
  })

  it('refuses another profile source identity without creating anything', async () => {
    const h = await harness()
    await expect(h.controller.createProject({
      requestId: intent(), title: '非法来源', sourceIds: ['foreign-source' as WorkspaceSourceId],
    })).rejects.toMatchObject({ code: 'workspace/source-unavailable' })
    expect(h.ctx.workspaceRegistry.list()).toEqual([])
    expect(await readdir(h.root)).toEqual([])
  })

  it('refuses a disappeared source rather than creating it or choosing another', async () => {
    const h = await harness()
    const path = await sourceDirectory(h.root, 'gone')
    const source = await h.controller.registerSource({ path })
    await rmdir(path)
    await expect(h.controller.createProject({
      requestId: intent(), title: '失效来源', sourceIds: [source.sourceId],
    })).rejects.toMatchObject({ code: 'workspace/source-unavailable' })
    expect(h.ctx.workspaceRegistry.list()).toEqual([])
    expect(await readdir(h.root)).toEqual([])
  })

  it('keeps profile namespaces separate under the same redirected Documents', async () => {
    const h = await harness()
    const other = await harness(new MemoryMediaPool(), h.root)
    const a = await h.controller.prepareChat({ requestId: intent() })
    const b = await other.controller.prepareChat({ requestId: intent() })
    expect(a.cwd).not.toBe(b.cwd)
    expect(a.cwd.split(/[\\/]/).at(-3)).not.toBe(b.cwd.split(/[\\/]/).at(-3))
  })

  it('keeps Chinese and spaced redirected Documents paths without deriving paths from the title', async () => {
    const original = await harness()
    const documents = await sourceDirectory(original.root, '重定向文档 资料')
    const h = await harness(new MemoryMediaPool(), documents)
    const project = await h.controller.createProject({ requestId: intent(), title: '../不作目录名', sourceIds: [] })
    expect(project.workspace.path.startsWith(documents)).toBe(true)
    expect(project.workspace.path).not.toContain('不作目录名')
  })

  it('does not recreate a prepared ordinary directory after it disappears', async () => {
    const h = await harness()
    const requestId = intent()
    const prepared = await h.controller.prepareChat({ requestId })
    await rmdir(prepared.cwd)
    await expect(h.controller.prepareChat({ requestId }))
      .rejects.toMatchObject({ code: 'workspace/managed-directory-unavailable' })
  })

  it('keeps recovery on the same intent after a failed persistence write', async () => {
    const h = await harness()
    const request = { requestId: intent(), title: '恢复写入', sourceIds: [] }
    h.pool.failNextWrites = 1
    await expect(h.controller.createProject(request)).rejects.toThrow('injected write failure')
    expect(h.ctx.workspaceRegistry.list()).toEqual([])
    const first = await h.controller.createProject(request)
    expect(await h.controller.createProject(request)).toEqual(first)
    expect(h.ctx.workspaceRegistry.list()).toHaveLength(1)
  })

  it('does not follow a product-root junction outside the intended Documents location', async () => {
    const h = await harness()
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-outside-')))
    directories.push(outside)
    await symlink(outside, join(h.root, 'StudyBuddy'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(h.controller.prepareChat({ requestId: intent() }))
      .rejects.toMatchObject({ code: 'workspace/managed-directory-unavailable' })
    expect(await readdir(outside)).toEqual([])
  })
})
