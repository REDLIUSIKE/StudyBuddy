import { expect, it } from 'vitest'
import { fixture, owner } from './fixture.ts'
import { CapabilityAssociationStore } from '../../src/capabilities/associations.ts'

it('storesLinksWithoutSessionRewriteAndIsolatesAccounts', async () => {
  const f = await fixture()
  try {
    const before = JSON.stringify(f.agent.session.header)
    const store = new CapabilityAssociationStore(f.ctx)
    const caller = { ...owner, callerSessionId: f.agent.id, workspaceId: null, toolCallId: 'call-original' }
    const target = { moduleId: 'novel', projectRef: 'novel-one' }
    await store.link(caller, target, 'operation-one')
    expect(await store.find(caller, 'novel')).toEqual([target])
    expect(await store.find({ ...caller, scope: { accountId: 'account-b', generation: 1 } }, 'novel')).toEqual([])
    expect(await store.find({ ...caller, callerSessionId: f.other.id }, 'novel')).toEqual([])
    expect(await store.operation(caller, 'operation-one')).toMatchObject({ target, originSessionId: f.agent.id })
    expect(JSON.stringify(f.agent.session.header)).toBe(before)
  } finally { await f.close() }
})
it('keepsOriginalOperationsAfterLaterEditsAndRebinding', async () => {
  const f = await fixture()
  try {
    const store = new CapabilityAssociationStore(f.ctx)
    const caller = { ...owner, callerSessionId: f.agent.id, workspaceId: null, toolCallId: 'call-original' }
    const target = { moduleId: 'novel', projectRef: 'novel-one' }
    await store.link(caller, target, 'operation-first')
    await store.link(caller, target, 'operation-second')
    await store.link(caller, target, null)
    expect(await store.operation(caller, 'operation-first')).toMatchObject({ target, originSessionId: f.agent.id })
    expect(await store.operation(caller, 'operation-second')).toMatchObject({ target, originSessionId: f.agent.id })
  } finally { await f.close() }
})
