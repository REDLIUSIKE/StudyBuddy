import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { AigcTextGrant } from '../src/studybuddy/aigc-types.ts'
import { SkillSafetyTextConsumer, type SkillSafetyCallRecord, type SkillSafetyTextOptions } from '../src/studybuddy/skill-safety-text-consumer.ts'

const actor = { accountId: 'owner', generation: 1, sessionId: brandString<SessionId>('session') }
const request = { messages: [{ role: 'user' as const, content: 'Original inert Cisco prompt' }], maxTokens: 64 }
function fixture(overrides: Partial<SkillSafetyTextOptions> = {}) {
  const rows = new Map<string, SkillSafetyCallRecord>(), prepared: string[] = [], dispatched: string[] = [], audited: object[] = []
  const choice: AigcTextGrant = { handle: 'a'.repeat(64), sourceLabel: 'Synthetic source', catalogVersion: 'fixture-1', catalogDigest: 'b'.repeat(64),
    selection: { routeId: 'route', sourceId: randomUUID(), localRef: 'source', providerId: 'kimi', exactModelId: 'fixture-exact-model', protocol: 'openai_chat_completions', connectionId: randomUUID(), credentialRevision: 'credential-1', grantRevision: 'c'.repeat(64), fundingSource: 'user_api' },
    authority: { logicalModelId: 'fixture', providerId: 'kimi', exactModelId: 'fixture-exact-model', displayName: 'Fixture', protocol: 'openai_chat_completions', contextWindow: 128000, maxOutputTokens: 16000, capabilityFlags: ['tool_use'], evidenceSha256: 'd'.repeat(64), membershipRevision: 'member-1', capabilityRevision: 'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available' } }
  const options: SkillSafetyTextOptions = { selection: async () => choice, isCurrent: () => true, records: {
    read: async (_actor, id) => rows.get(id), claim: async (_actor, id, row) => { const prior = rows.get(id); if (prior) return prior; rows.set(id, row); return row },
    settle: async (_actor, id, result) => { rows.set(id, { ...rows.get(id)!, result }) },
  }, consumer: { consumerCatalog: async () => [choice], consumerRequestStatus: async (_scope, id) => ({ schemaVersion: 1, operationId: randomUUID(), requestId: id, purpose: 'chat', requestTicket: null, expiresAt: 4000000000, state: 'terminal' }),
    prepareConsumerRequest: async (_scope, input) => { prepared.push(input.clientRequestId); return { frozen: { schemaVersion: 1, selection: choice.selection, authority: choice.authority, clientRequestId: input.clientRequestId, sessionId: input.sessionId, purpose: 'chat', requestReceipt: null },
      route: { mode: 'gateway', routeId: 'route', displayName: 'Source', gatewayOrigin: 'https://synthetic.gateway.test', apiKey: 'private-credential-never-in-context', binding: {} as never } } },
  }, fetch: async (url, init) => {
    dispatched.push(url); const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer private-credential-never-in-context')
    expect(headers.has('Cookie')).toBe(false); expect(headers.has('X-StudyBuddy-Client-Audience')).toBe(false)
    expect(headers.has('X-StudyBuddy-Request-Ticket')).toBe(false)
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: choice.selection.exactModelId, messages: request.messages, max_completion_tokens: 64 })
    return Response.json({ id: 'actual-response', model: choice.selection.exactModelId, choices: [{ message: { content: 'recorded verdict' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })
  }, audit: async (_actor, row) => { audited.push(row) }, ...overrides }
  return { choice, rows, options, prepared, dispatched, audited, consumer: new SkillSafetyTextConsumer(options) }
}
it('each_judge_call_prepares_once and uses actual terminal usage without exposing credentials', async () => {
  const f = fixture(), signal = new AbortController().signal
  const result = await f.consumer.call(actor, 'analysis:1', request, signal)
  await f.consumer.call(actor, 'analysis:2', request, signal)
  expect(result.usage).toEqual({ input_tokens: 5, output_tokens: 2, total_tokens: 7 })
  expect(f.prepared).toHaveLength(2); expect(new Set(f.prepared).size).toBe(2); expect(f.dispatched).toHaveLength(2)
  expect(JSON.stringify([result, f.audited, [...f.rows]])).not.toContain('private-credential-never-in-context')
})
it('rejects a retired non-null prepared receipt before any judge dispatch', async () => {
  const f = fixture(), prepare = f.options.consumer.prepareConsumerRequest
  f.options.consumer.prepareConsumerRequest = async (...args) => {
    const result = await prepare(...args)
    return { ...result, frozen: { ...result.frozen, requestReceipt: { schemaVersion: 1, operationId: randomUUID(),
      requestId: result.frozen.clientRequestId, purpose: 'chat', state: 'prepared',
      requestTicket: 'retired-private-ticket', expiresAt: 4_000_000_000 } } }
  }
  await expect(f.consumer.call(actor, 'analysis:retired', request, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_MODEL_CHANGED')
  expect(f.dispatched).toEqual([])
  expect(f.audited).toEqual([])
})
it('same actual call returns its immutable result rather than repeating paid inference', async () => {
  const f = fixture(), signal = new AbortController().signal
  const first = await f.consumer.call(actor, 'analysis:1', request, signal)
  expect(await f.consumer.call(actor, 'analysis:1', request, signal)).toEqual(first)
  expect(f.prepared).toHaveLength(1); expect(f.dispatched).toHaveLength(1)
})
it('unknown_receipt_blocks_duplicate_call including a fresh Main consumer instance', async () => {
  const f = fixture()
  f.options.consumer.consumerRequestStatus = async () => null
  await expect(f.consumer.call(actor, 'analysis:1', request, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_OUTCOME_UNKNOWN')
  await expect(new SkillSafetyTextConsumer(f.options).call(actor, 'analysis:1', request, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_OUTCOME_UNKNOWN')
  expect(f.prepared).toHaveLength(1); expect(f.dispatched).toHaveLength(1)
})
it('unsupported_current_route_does_not_switch_funding', async () => {
  const f = fixture()
  f.choice.selection = { ...f.choice.selection, protocol: 'anthropic_messages' }
  await expect(f.consumer.call(actor, 'analysis:1', request, new AbortController().signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_MODEL_UNSUPPORTED' })
  expect(f.prepared).toEqual([]); expect(f.dispatched).toEqual([]); expect(f.choice.selection.fundingSource).toBe('user_api')
})
it('changed model or funding after preparation cannot dispatch', async () => {
  const f = fixture(), prepare = f.options.consumer.prepareConsumerRequest
  f.options.consumer.prepareConsumerRequest = async (...args) => { const result = await prepare(...args); f.choice.selection = { ...f.choice.selection, exactModelId: 'another-exact-model' }; return result }
  await expect(f.consumer.call(actor, 'analysis:1', request, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_MODEL_CHANGED')
  expect(f.dispatched).toEqual([])
})
it('missing terminal usage and output limit are visible failures, never estimates', async () => {
  const f = fixture({ fetch: async () => Response.json({ model: 'fixture-exact-model', choices: [{ message: { content: 'partial' }, finish_reason: 'length' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) })
  await expect(f.consumer.call(actor, 'analysis:1', request, new AbortController().signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_RESPONSE_INVALID' })
})
it('cancellation carries its machine code without preparing or dispatching', async () => {
  const f = fixture()
  await expect(f.consumer.call(actor, 'analysis:cancelled', request, AbortSignal.abort())).rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' })
  expect(f.prepared).toEqual([]); expect(f.dispatched).toEqual([])
})
