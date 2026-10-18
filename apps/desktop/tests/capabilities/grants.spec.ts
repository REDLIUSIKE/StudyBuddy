import { expect, it } from 'vitest'
import { CapabilityGrantStore } from '../../src/studybuddy/capabilities/grants.ts'
import { caller, target } from './fixture.ts'
it('rejectsWrongHostAndAccountGeneration', () => {
  const grants = new CapabilityGrantStore(), ref = grants.issue(caller, target, ['execute'])
  expect(grants.assert(ref, { ...caller, toolCallId: 'next-call' }, 'execute')).toEqual(target)
  for (const changed of [{ ...caller, hostGeneration: 'foreign' }, { ...caller, scope: { ...caller.scope, generation: 4 } }, { ...caller, callerSessionId: 'other' }]) {
    expect(() => grants.assert(ref, changed, 'execute')).toThrow('CAPABILITY_GRANT_REVOKED')
  }
  grants.revoke(caller.scope)
  expect(() => grants.assert(ref, caller, 'execute')).toThrow('CAPABILITY_GRANT_REVOKED')
})
