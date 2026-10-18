import { expect, it } from 'vitest'
import { parseSkillSafetyInvocation, parseSkillSafetyPrepared } from '../src/wire.ts'
const actor = { accountId: 'owner', generation: 1, sessionId: 'session' }
const call = { rpcId: '358079c4-9b23-4db3-a2ca-0e5ba194d63d', context: { hostGeneration: 'host', actor }, operation: { kind: 'preflight', command: { kind: 'install', requestId: 'req', reportId: 'report' } } }
it('only private actor/closed command is accepted; model approvals and paths are rejected', () => {
  expect(parseSkillSafetyInvocation(call)).toEqual(call)
  expect(() => parseSkillSafetyInvocation({ ...call, operation: { ...call.operation, command: { ...call.operation.command, approved: true } } })).toThrow('SKILL_SAFETY_COMMAND_INVALID')
  expect(() => parseSkillSafetyInvocation({ ...call, path: 'C:/outside' })).toThrow('SKILL_SAFETY_COMMAND_INVALID')
  expect(() => parseSkillSafetyInvocation({ ...call, context: { ...call.context, actor: { ...actor, generation: Infinity } } })).toThrow('SKILL_SAFETY_COMMAND_INVALID')
})
it('native notice carries exactly its Main identity and two bounded options', () => {
  const value = { intentId: 'intent', requestId: 'req', argumentDigest: 'a'.repeat(64), question: { id: 'intent', header: '确认检查', question: '继续？', options: [{ label: '继续检查' }, { label: '取消' }] } }
  expect(parseSkillSafetyPrepared(value)).toEqual(value)
  expect(() => parseSkillSafetyPrepared({ ...value, approval: true })).toThrow('SKILL_SAFETY_COMMAND_INVALID')
})
