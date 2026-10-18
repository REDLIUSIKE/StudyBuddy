/** SDK wire projection of real frozen Session records; integration/policy tests own enforcement. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SandboxPolicyService from '../../../sandbox/sandbox-policy/src/index.ts'
import { createProcessDeepSeekHarness } from '../src/api.ts'

const expectedPath = fileURLToPath(new URL('./expected/project-source-roots.json', import.meta.url))
const fakeRuntime = fileURLToPath(new URL('./fake-runtime.ts', import.meta.url))
it('retains the exact non-ignorable frozen sources in SDK events and notifications', async () => {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as { finalResponse: string; sourceEvents: SessionEvent[] }
  const ctx = new Context()
  let records: SessionEvent[]
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'read-only' })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      const session = ctx.sessions.create(SessionId('sdk-project-sources'), { meta: { cwd: '/projects/main' } })
      ctx.sandboxPolicy.captureWorkspaceRoots(session, ['/projects/main', '/projects/资料 空间'])
      records = [...session.snapshotEvents()]
      expect(records).toEqual(expected.sourceEvents)
      expect(records.some(event => event.type === 'turn/start')).toBe(false)
    } finally { clock.mockRestore() }
  } finally { await ctx.fiber.dispose() }
  const harness = createProcessDeepSeekHarness({
    command: process.execPath, args: [fakeRuntime], description: 'project sources SDK projection only', initializeTimeoutMs: 5000,
    environment: () => ({ ...process.env, FAKE_TEXT: expected.finalResponse, FAKE_PREPARE_SESSION_EVENTS: JSON.stringify(records) }),
  })
  try {
    await harness.start()
    const subscription = harness.client.subscribeSessionTree('sdk-project-sources')
    try {
      const result = await harness.session('sdk-project-sources').run('Project source projection only.')
      const notification = await subscription.next()
      expect(notification.method).toBe('session.event')
      if (notification.method !== 'session.event') throw new Error('Missing source preparation record')
      const sourceEvents = [notification.params.event]
      expect({ finalResponse: result.finalResponse, sourceEvents }).toEqual(expected)
      expect(sourceEvents[0]).not.toHaveProperty('ignorable')
      expect(sourceEvents[0]).not.toHaveProperty('surfaceOp')
      // High-level runs intentionally begin at their own enqueue receipt;
      // preparation records remain available through the raw SDK subscription.
      expect(result.events.some(event => event.type === 'sandbox/workspace-roots')).toBe(false)
    } finally { subscription.close() }
  } finally { await harness.close() }
})
