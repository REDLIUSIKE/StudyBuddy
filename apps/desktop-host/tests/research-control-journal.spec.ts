import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { TestSessionQueryEngine } from '../../../packages/session-query/session-query/tests/test-service.ts'
import { installResearchHostControl } from '../src/research-control.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const owner = { scope: { accountId: 'journal-account', generation: 1 }, hostGeneration: '11111111-1111-4111-8111-111111111111' }
const sessionId = 'session-22222222-2222-4222-8222-222222222222'
const childId = 'session-33333333-3333-4333-8333-333333333333'
const foreignId = 'session-44444444-4444-4444-8444-444444444444'
const lease = '55555555-5555-4555-8555-555555555555'

async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'research-journal-control-')))
  const foreignRoot = await realpath(await mkdtemp(join(tmpdir(), 'research-journal-foreign-')))
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(foreignRoot, { recursive: true, force: true })
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(TestSessionQueryEngine)
  const workspace = { id: 'workspace-study', path: root, sessionIds: [] as string[] }
  ctx.provide('workspaceRegistry', {
    resolveByPath: async () => workspace,
    get: (id: string) => id === workspace.id ? workspace : undefined,
  })
  ctx.provide('sessionController', {
    create: async (request: { sessionId: string }) => {
      ctx.sessions.create(SessionId(request.sessionId), { meta: { cwd: root } })
      workspace.sessionIds.push(request.sessionId)
    },
  })
  ctx.provide('agents', { list: () => [], get: () => undefined, isOwnedBy: () => false })
  const control = installResearchHostControl(ctx, owner.hostGeneration, async () => {})
  await control.command('scope', owner)
  const context = { ...owner, projectId: 'study', workspaceId: workspace.id, sessionId, lease }
  expect(await control.command('bind', { ...owner, projectId: 'study', root, sessionId, lease })).toMatchObject(context)
  ctx.sessions.create(SessionId(childId), { meta: { cwd: root, parentSession: SessionId(sessionId) } })
  ctx.sessions.create(SessionId(foreignId), { meta: { cwd: foreignRoot, parentSession: SessionId(sessionId) } })
  ctx.sessions.get(SessionId(childId))!.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Recorded child journal, no model request' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  return { ctx, control, context }
}

it('lists journal-sessions through the actual singular Cordis sessionQuery service', async () => {
  const { ctx, control, context } = await setup()
  expect(ctx.get('sessionQuery')).toBeDefined()
  expect(await control.command('journal-export', { context, input: { kind: 'sessions' } })).toEqual([
    { id: sessionId, parentSessionId: null }, { id: childId, parentSessionId: sessionId },
  ])
})

it('exports the owned child journal and keeps foreign project and forged binding reads denied', async () => {
  const { control, context } = await setup()
  const query = { cursor: { seq: -1, offset: 0 }, endSeq: null }
  const value = await control.command('journal-export', { context, input: { sessionId: childId, ...query } })
  const page = z.object({ nativeSessionId: z.string(), dataBase64: z.string() }).parse(value)
  expect(page.nativeSessionId).toBe(childId)
  expect(Buffer.from(page.dataBase64, 'base64').toString('utf8')).toContain('Recorded child journal, no model request')
  await expect(control.command('journal-export', { context, input: { sessionId: foreignId, ...query } }))
    .rejects.toThrow('HARNESS_RESEARCH_EXPORT_SESSION_DENIED')
  await expect(control.command('journal-export', { context: { ...context, projectId: 'another-project' }, input: { kind: 'sessions' } }))
    .rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
})
