import { expect, it, vi } from 'vitest'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { fixture, owner } from './fixture.ts'
import { capabilityContext } from '../../src/capabilities/context.ts'
import { CapabilityPolicy } from '../../src/capabilities/policy.ts'

it('derivesCallerFromExec', async () => {
  const f = await fixture()
  try {
    const context = capabilityContext(f.ctx, owner, { agent: f.agent, callId: 'call-original', signal: new AbortController().signal })
    expect(context.caller).toEqual({ ...owner, callerSessionId: f.agent.id, workspaceId: null, toolCallId: 'call-original' })
    expect(context.agent).toBe(f.agent)
    expect(() => capabilityContext(f.ctx, owner, { agent: undefined, callId: 'call-original', signal: context.signal })).toThrow('CAPABILITY_SESSION_REQUIRED')
  } finally { await f.close() }
})
it('readOnlyDeniesMutationAndRetainsBudgetGuard', async () => {
  const f = await fixture(), guard = vi.fn(async () => {})
  try {
    const context = capabilityContext(f.ctx, owner, { agent: f.agent, callId: 'call-original', signal: new AbortController().signal })
    const policy = new CapabilityPolicy(f.ctx, guard)
    setSandboxMode(f.agent.session, 'read-only')
    await expect(policy.authorize(context, 'write', null)).rejects.toThrow('CAPABILITY_READ_ONLY')
    expect(guard).not.toHaveBeenCalled()
    await policy.authorize(context, 'read', null)
    setSandboxMode(f.agent.session, 'workspace-write')
    guard.mockRejectedValueOnce(Error('CAPABILITY_BUDGET_DENIED'))
    await expect(policy.authorize(context, 'generation', null)).rejects.toThrow('CAPABILITY_BUDGET_DENIED')
  } finally { await f.close() }
})
