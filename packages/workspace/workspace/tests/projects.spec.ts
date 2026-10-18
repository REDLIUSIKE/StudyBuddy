import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WorkspaceRegistry, { WorkspaceId } from '../src/index.ts'
import type { WorkspaceSourceFolder, WorkspaceSourceId } from '../src/types.ts'

const contexts: Context[] = []
const paths: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true })
})

async function harness(pool = new MemoryMediaPool()) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-registry-')))
  paths.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const domain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', domain)
  ctx.provide('storageDomain', domain)
  ctx.provide('sessionPersistence', { list: async () => [] } as never)
  await ctx.plugin(WorkspaceRegistry)
  const source = async (id: string): Promise<WorkspaceSourceFolder> => {
    const path = join(root, id)
    await mkdir(path)
    return { sourceId: id as WorkspaceSourceId, path: await realpath(path) }
  }
  return { ctx, root, pool, registry: ctx.workspaceRegistry, source }
}

it('creates a distinct named identity without claiming the old directory conversations', async () => {
  const h = await harness()
  const first = await h.source('first')
  const second = await h.source('second')
  const old = await h.registry.create(first.path, 'Original')
  const session = h.ctx.sessions.create(SessionId('old-chat'), { meta: { cwd: first.path } })
  await old.attachSession(session.id)
  const project = await h.registry.createProjectRecord({
    workspaceId: WorkspaceId('named-project'), title: 'Named', sourceFolders: [first, second], primarySourceId: first.sourceId,
  })
  expect(project.id).not.toBe(old.id)
  expect(project.sessionIds).toEqual([])
  expect(project.sourceFolders).toEqual([first, second])
  expect(old.sessionIds).toEqual([session.id])
  expect(h.registry.list().map(row => row.title)).toEqual(['Named', 'Original'])
  expect(session.header.cwd).toBe(first.path)
})

it('preserves the explicit primary and leaves folder adoption on the legacy identity', async () => {
  const h = await harness()
  const first = await h.source('first')
  const second = await h.source('second')
  const old = await h.registry.create(second.path, 'Existing')
  const project = await h.registry.createProjectRecord({
    workspaceId: WorkspaceId('named-project'), title: 'Named', sourceFolders: [first, second], primarySourceId: second.sourceId,
  })
  expect(project.path).toBe(second.path)
  expect(await h.registry.create(second.path)).toBe(old)
  expect(project.sessionIds).toEqual([])
})

it('reuses an exact identity and refuses a retry that changes its sources', async () => {
  const h = await harness()
  const first = await h.source('first')
  const second = await h.source('second')
  const request = {
    workspaceId: WorkspaceId('named-project'), title: 'Named', sourceFolders: [first], primarySourceId: first.sourceId,
  }
  const project = await h.registry.createProjectRecord(request)
  expect(await h.registry.createProjectRecord(request)).toBe(project)
  await expect(h.registry.createProjectRecord({ ...request, sourceFolders: [second], primarySourceId: second.sourceId }))
    .rejects.toThrow('conflict')
  expect(project.path).toBe(first.path)
})

it('refuses an invalid primary before exposing a record', async () => {
  const h = await harness()
  const first = await h.source('first')
  await expect(h.registry.createProjectRecord({
    workspaceId: WorkspaceId('named-project'), title: 'Named', sourceFolders: [first], primarySourceId: 'missing' as WorkspaceSourceId,
  })).rejects.toThrow('primary')
  expect(h.registry.list()).toEqual([])
})

it('refuses to attach a historical conversation to a second project sharing its primary path', async () => {
  const h = await harness()
  const source = await h.source('shared')
  const legacy = await h.registry.create(source.path)
  const session = h.ctx.sessions.create(SessionId('owned-chat'), { meta: { cwd: source.path } })
  await legacy.attachSession(session.id)
  const project = await h.registry.createProjectRecord({
    workspaceId: WorkspaceId('named-project'), title: 'Named', sourceFolders: [source], primarySourceId: source.sourceId,
  })
  await expect(project.attachSession(session.id)).rejects.toThrow('already')
  expect(project.sessionIds).toEqual([])
  expect(legacy.sessionIds).toEqual([session.id])
})

it('opening a single folder does not silently inherit a named project additional source roots', async () => {
  const h = await harness()
  const first = await h.source('first')
  const second = await h.source('second')
  const project = await h.registry.createProjectRecord({
    workspaceId: WorkspaceId('named-project'), title: 'Group', sourceFolders: [first, second], primarySourceId: first.sourceId,
  })
  expect(await h.registry.resolveByPath(first.path)).toBeUndefined()
  const folder = await h.registry.create(first.path)
  expect(folder.id).not.toBe(project.id)
  expect(folder.sourceFolders).toBeUndefined()
  expect(await h.registry.resolveByPath(first.path)).toBe(folder)
})
