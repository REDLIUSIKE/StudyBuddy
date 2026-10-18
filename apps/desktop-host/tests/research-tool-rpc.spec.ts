import { expect, it, vi } from 'vitest'
import { ResearchToolRpc } from '../src/research-tool-rpc.ts'
const context = { scope: { accountId: 'account-a', generation: 2 }, hostGeneration: '22222222-2222-4222-8222-222222222222',
  projectId: 'study', workspaceId: 'workspace-a', sessionId: 'session-a', lease: '33333333-3333-4333-8333-333333333333' }
function setup() {
  let current = true
  const messages: any[] = []
  const rpc = new ResearchToolRpc({ send: async value => { messages.push(value) }, current: value => current && JSON.stringify(value) === JSON.stringify(context) })
  return { rpc, messages, revoke: () => { current = false; rpc.revoke() } }
}
it('correlates one native tool call and ignores unsolicited responses', async () => {
  const { rpc, messages } = setup()
  const run = rpc.invoke(context, 'notebook', 'call-a', { type: 'note', title: 'An observation' }, new AbortController().signal)
  expect(messages).toHaveLength(1)
  rpc.result({ rpcId: 'unknown', data: 'foreign' })
  rpc.result({ rpcId: messages[0].request.rpcId, data: { logged: true } })
  expect(await run).toEqual({ logged: true })
  expect(messages[0].request.context).toEqual(context)
})
it('revokes pending operations and rejects late responses without replay', async () => {
  const { rpc, messages, revoke } = setup()
  const run = rpc.invoke(context, 'memory', 'call-a', {}, new AbortController().signal)
  const rejected = expect(run).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  revoke(); rpc.result({ rpcId: messages[0].request.rpcId, data: { text: 'late' } })
  await rejected
  expect(messages.filter(value => value.type === 'research-tool-request')).toHaveLength(1)
})
it('refuses a forged account before any private dispatch', async () => {
  const { rpc, messages } = setup()
  await expect(rpc.invoke({ ...context, scope: { ...context.scope, accountId: 'foreign' } }, 'notebook', 'call-a', {}, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  expect(messages).toHaveLength(0)
})
it('cancels an observer without sending another execution request', async () => {
  const { rpc, messages } = setup(), stop = new AbortController()
  const run = rpc.invoke(context, 'notebook', 'call-a', {}, stop.signal)
  const rejected = expect(run).rejects.toThrow('HARNESS_RESEARCH_TOOL_CANCELLED')
  stop.abort(); await rejected
  expect(messages.map(value => value.type)).toEqual(['research-tool-request', 'research-tool-cancel'])
})
it('contains a failed private send and does not retry', async () => {
  const send = vi.fn(async () => { throw Error('Disconnected') })
  const rpc = new ResearchToolRpc({ send, current: () => true })
  await expect(rpc.invoke(context, 'notebook', 'call-a', {}, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
  expect(send).toHaveBeenCalledTimes(1)
})
it('keeps private admission roots on Host while sending the closed public context', async () => {
  const binding = { ...context, authorizedRoots: ['C:/admitted-fixture/project/sandbox'] }
  const messages: any[] = [], observed: unknown[] = []
  let rpc: ResearchToolRpc
  rpc = new ResearchToolRpc({ current: value => { observed.push(value); return value === binding }, send: async message => {
    messages.push(message)
    if ((message as any).type === 'research-tool-request') rpc.result({ rpcId: (message as any).request.rpcId, data: { mounted: true } })
  } })
  await expect(rpc.invoke(binding, 'catalog', 'catalog-a', {}, new AbortController().signal)).resolves.toEqual({ mounted: true })
  expect(observed.every(value => value === binding)).toBe(true)
  expect(messages[0].request.context).toEqual(context)
  expect(JSON.stringify(messages)).not.toContain('authorizedRoots')
  expect(JSON.stringify(messages)).not.toContain('admitted-fixture')
})
it('sends the same closed context when cancelling a privately admitted binding', async () => {
  const binding = { ...context, authorizedRoots: ['C:/admitted-fixture/project/sandbox'] }, messages: any[] = []
  const rpc = new ResearchToolRpc({ current: value => value === binding, send: async message => { messages.push(message) } }), stop = new AbortController()
  const run = rpc.invoke(binding, 'memory', 'recall-a', {}, stop.signal)
  const rejected = expect(run).rejects.toThrow('HARNESS_RESEARCH_TOOL_CANCELLED')
  stop.abort(); await rejected
  expect(messages[1]).toMatchObject({ type: 'research-tool-cancel', context })
  expect(Object.keys(messages[1].context).sort()).toEqual(Object.keys(context).sort())
})
it('still rejects any unexpected authority fields instead of dropping them silently', async () => {
  const send = vi.fn(async () => {}), rpc = new ResearchToolRpc({ current: () => true, send })
  await expect(rpc.invoke({ ...context, authorizedRoots: ['C:/fixture'], extraAuthority: 'unsupported' } as never, 'catalog', 'catalog-b', {}, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_REQUEST_INVALID')
  expect(send).not.toHaveBeenCalled()
})
