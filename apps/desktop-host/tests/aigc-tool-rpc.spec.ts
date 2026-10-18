import { expect, it } from 'vitest'
import { AigcToolRpc } from '../src/aigc-tool-rpc.ts'
const context = { scope: { accountId: 'account-a', generation: 1 }, hostGeneration: '00000000-0000-4000-8000-000000000004',
  projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'workspace-a', sessionId: 'session-00000000-0000-4000-8000-000000000001', lease: '00000000-0000-4000-8000-000000000002' }
it('correlates native child identity, cancels once, and rejects late revoked results without retries', async () => {
  const sent: any[] = [], rpc = new AigcToolRpc({ send: async value => { sent.push(value) }, current: () => true })
  const abort = new AbortController(), first = rpc.invoke(context, '00000000-0000-4000-8000-000000000005', 'execute', 'call-a', {}, abort.signal)
  expect(sent[0].request.callerSessionId).toBe('00000000-0000-4000-8000-000000000005')
  const rejected = expect(first).rejects.toThrow('AIGC_OPERATION_CANCELLED'); abort.abort(); await rejected
  rpc.result({ rpcId: sent[0].request.rpcId, data: 'late' }); expect(sent).toHaveLength(2)
  const second = rpc.invoke(context, context.sessionId, 'resources', 'call-b', {}, new AbortController().signal)
  const revoked = expect(second).rejects.toThrow('AIGC_SCOPE_REVOKED'); rpc.revoke(); await revoked
  const third = rpc.invoke(context, context.sessionId, 'state', 'call-c', {}, new AbortController().signal)
  rpc.result({ rpcId: sent.at(-1).request.rpcId, data: { ready: true } }); expect(await third).toEqual({ ready: true })
})
