import { describe, expect, it, vi } from 'vitest'
import { ResearchHostController } from '../src/research-host.ts'

const host = '22222222-2222-4222-8222-222222222222'
const operationId = '44444444-4444-4444-8444-444444444444'
const rpcId = '55555555-5555-4555-8555-555555555555'
const context = { scope: { accountId: 'owned-account', generation: 3 }, hostGeneration: host,
  projectId: 'project-a', workspaceId: 'workspace-a', sessionId: 'session-a', lease: operationId }
const action = { operationId, kind: 'conversation' as const, input: { prompt: 'Review the dataset', references: ['user_data/study.csv'] } }
const request = { schemaVersion: 1 as const, rpcId, context, operation: 'submit' as const, input: action }
const signal = () => new AbortController().signal
function setup() {
  const execution = {
    admitted: vi.fn(async (value: typeof context) => value.projectId === 'project-a' && value.workspaceId === 'workspace-a' && value.sessionId === 'session-a' && value.lease === operationId),
    capabilities: vi.fn(async () => [{ id: 'conversation', state: 'ready' as const }]),
    submit: vi.fn(async (_context: unknown, _action: unknown, _signal: AbortSignal) => ({ runId: operationId, state: 'queued' as const })),
    inspect: vi.fn(async () => ({ runId: operationId, state: 'completed' as const })),
    cancel: vi.fn(async () => ({ runId: operationId, state: 'failed' as const })),
    answer: vi.fn(async () => {}), subscribe: vi.fn((_context: unknown, _listener: (event: any) => void) => () => {}),
  }
  const owner = new ResearchHostController({ hostGeneration: host, execution })
  owner.setScope({ scope: context.scope, hostGeneration: host })
  return { owner, execution }
}

describe('private native research admission', () => {
  it('submits one captured operation and recovers it without repeating model admission', async () => {
    const { owner, execution } = setup()
    expect(await owner.invoke(request, signal())).toEqual({ runId: operationId, state: 'queued' })
    expect(await owner.invoke({ ...request, rpcId: '66666666-6666-4666-8666-666666666666' }, signal())).toEqual({ runId: operationId, state: 'queued' })
    expect(execution.submit).toHaveBeenCalledTimes(1)
    expect(execution.submit.mock.calls[0]?.[0]).toEqual(context)
    expect(await owner.invoke({ ...request, operation: 'inspect', input: { runId: operationId } }, signal())).toEqual({ runId: operationId, state: 'completed' })
    expect(execution.submit).toHaveBeenCalledTimes(1)
  })
  it.each([
    { ...context, scope: { ...context.scope, generation: 2 } },
    { ...context, scope: { ...context.scope, accountId: 'another-account' } },
    { ...context, hostGeneration: '33333333-3333-4333-8333-333333333333' },
    { ...context, projectId: 'another-project' },
    { ...context, workspaceId: 'another-workspace' },
    { ...context, sessionId: 'another-session' },
    { ...context, lease: '77777777-7777-4777-8777-777777777777' },
  ])('refuses a stale or forged binding before dispatch', async forged => {
    const { owner, execution } = setup()
    await expect(owner.invoke({ ...request, context: forged }, signal())).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
    expect(execution.submit).not.toHaveBeenCalled()
  })
  it('refuses edited model authority and unknown operations before native dispatch', async () => {
    const { owner, execution } = setup()
    for (const value of [
      { ...request, input: { ...action, input: { ...action.input, model: 'different-model' } } },
      { ...request, operation: 'provider-fetch' },
    ]) await expect(owner.invoke(value as never, signal())).rejects.toThrow('HARNESS_RESEARCH_REQUEST_INVALID')
    expect(execution.submit).not.toHaveBeenCalled()
  })
  it('does not reuse an operation ID for changed content or another Session', async () => {
    const { owner, execution } = setup()
    await owner.invoke(request, signal())
    await expect(owner.invoke({ ...request, input: { ...action, input: { ...action.input, prompt: 'A different paid call' } } }, signal())).rejects.toThrow('HARNESS_RESEARCH_OPERATION_CONFLICT')
    expect(execution.submit).toHaveBeenCalledTimes(1)
  })
  it('rejects a late result after account invalidation', async () => {
    const { owner, execution } = setup()
    let finish!: (value: { runId: string; state: 'queued' }) => void
    execution.submit.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = owner.invoke(request, signal())
    const rejected = expect(pending).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
    await vi.waitFor(() => expect(execution.submit).toHaveBeenCalledTimes(1))
    owner.setScope(null)
    finish({ runId: operationId, state: 'queued' })
    await rejected
  })
  it('keeps helper failures on the selected authority without a fallback dispatch', async () => {
    const { owner, execution } = setup()
    execution.submit.mockRejectedValue(Error('SELECTED_AUTHORITY_UNAVAILABLE'))
    await expect(owner.invoke({ ...request, input: { ...action, kind: 'methods-draft' } }, signal())).rejects.toThrow('SELECTED_AUTHORITY_UNAVAILABLE')
    expect(execution.submit).toHaveBeenCalledTimes(1)
  })
  it('refuses a forged subscription before attaching a native listener', async () => {
    const { owner, execution } = setup()
    const listener = vi.fn()
    const dispose = owner.subscribe({ ...context, sessionId: 'another-session' }, listener)
    await vi.waitFor(() => expect(execution.admitted).toHaveBeenCalledTimes(1))
    expect(execution.subscribe).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
    dispose()
  })
  it('delivers an observed event once and drops late events after logout', async () => {
    const { owner, execution } = setup()
    const listener = vi.fn()
    const dispose = owner.subscribe(context, listener)
    await vi.waitFor(() => expect(execution.subscribe).toHaveBeenCalledTimes(1))
    const publish = execution.subscribe.mock.calls[0]![1]
    const event = { eventId: 'native-event-1', projectId: 'project-a', sessionRef: 'session-a', runId: operationId, actor: 'native', kind: 'turn/end', payload: {} }
    publish(event); publish(event)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    owner.setScope(null); publish({ ...event, eventId: 'native-event-2' })
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
  })
})
