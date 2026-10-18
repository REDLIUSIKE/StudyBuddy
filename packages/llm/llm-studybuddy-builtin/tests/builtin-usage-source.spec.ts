import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { canonicalNativeBuiltinCatalogPayloadV1 } from '@studybuddy/contracts'
import type { NativeBuiltinPreparedRouteV1, NativeBuiltinProviderId, NativeProtocol } from '@studybuddy/contracts'
import { expect, it } from 'vitest'
import { BuiltinModelDirectory } from '../src/studybuddy-builtin-models.ts'
import { createBuiltinWireAdapter } from '../src/studybuddy-builtin-wire.ts'

const owner = '11111111-1111-4111-8111-111111111111', host = '33333333-3333-4333-8333-333333333333'
const data = (row: object) => 'data: ' + JSON.stringify(row) + '\n\n'
type AnthropicFixtureEvent =
  | { type: 'message_start'; message: { id: string; type: 'message'; role: 'assistant'; model: string; content: readonly []; usage: Record<string, unknown> } }
  | { type: 'content_block_start'; index: number; content_block: { type: 'text'; text: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: 'end_turn' }; usage: Record<string, unknown> }
  | { type: 'message_stop' }
const anthropic = (row: AnthropicFixtureEvent) => 'event: ' + row.type + '\n' + data(row)
function sse(protocol: NativeProtocol, usage?: Record<string, unknown>): string {
  if (protocol === 'openai_chat_completions') return data({ id: 'response-a', model: 'model-a', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }] }) + data({ id: 'response-a', model: 'model-a', choices: [], ...(usage === undefined ? {} : { usage }) }) + 'data: [DONE]\n\n'
  if (protocol === 'openai_responses') return data({ type: 'response.created', response: { id: 'response-a', model: 'model-a', status: 'in_progress', output: [] } }) + data({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'message-a', role: 'assistant', content: [] } }) + data({ type: 'response.content_part.added', item_id: 'message-a', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }) + data({ type: 'response.output_text.delta', item_id: 'message-a', output_index: 0, content_index: 0, delta: 'OK' }) + data({ type: 'response.completed', response: { id: 'response-a', model: 'model-a', status: 'completed', output: [{ type: 'message', id: 'message-a', role: 'assistant', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }], ...(usage === undefined ? {} : { usage }) } })
  const start = usage === undefined ? {} : { ...usage, output_tokens: 0 }
  return anthropic({ type: 'message_start', message: { id: 'response-a', type: 'message', role: 'assistant', model: 'model-a', content: [], usage: start } }) + anthropic({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) + anthropic({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }) + anthropic({ type: 'content_block_stop', index: 0 }) + anthropic({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: usage === undefined ? {} : { output_tokens: usage.output_tokens } }) + anthropic({ type: 'message_stop' })
}
async function collect(protocol: NativeProtocol, usage?: Record<string, unknown>, providerId: NativeBuiltinProviderId = protocol === 'anthropic_messages' ? 'anthropic' : 'openai', wire?: string) {
  const ctx = new Context(); new LlmRuntime(ctx)
  const local: Extract<NativeBuiltinPreparedRouteV1, { mode: 'local_direct' }> = { mode: 'local_direct', routeId: 'source-one', displayName: 'Fixture source', baseUrl: protocol === 'anthropic_messages' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1', apiKey: 'synthetic-fixture-key', grant: { schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'fixture-r1', accountOwner: owner, deviceId: host, sourceId: '22222222-2222-4222-8222-222222222222', localRef: 'source-one', connectionId: '22222222-2222-4222-8222-222222222222', credentialRevision: 'fixture-r1', protocol, authorityExpiresAt: 4000000000, allowedModels: [{ logicalModelId: 'fixture.model-a', providerId, exactModelId: 'model-a', displayName: 'Fixture model', protocol, contextWindow: 128000, maxOutputTokens: 16000, capabilityFlags: ['tool_use'], evidenceSha256: 'b'.repeat(64), membershipRevision: 'fixture-r1', capabilityRevision: 'fixture-r1', adapterRevision: 'fixture-r1', priceAuthorityRevision: null, availability: 'available' }] } }
  const route: NativeBuiltinPreparedRouteV1 = providerId === 'deepseek' || providerId === 'kimi' ? { mode: 'gateway', routeId: local.routeId, displayName: local.displayName, gatewayOrigin: 'https://gateway.example.test', apiKey: local.apiKey, binding: { schemaVersion: 1, userId: 1, tokenId: 1, connectionId: local.grant.connectionId, operationId: '77777777-7777-4777-8777-777777777777', policyRevision: 'fixture-r1', tokenGroup: 'user-api', pendingExpiresAt: 2000000000, authorityExpiresAt: 4000000000, state: 'active', hostCatalogVersion: null, grant: { schemaVersion: 1, grantRevision: local.grant.grantRevision, catalogRevision: local.grant.catalogRevision, scope: { backendInstanceId: 'fixture-r1', accountOwner: owner, deviceId: host, sourceId: local.grant.sourceId, localRef: local.grant.localRef, providerId, credentialReference: 'fixture-r1', credentialRevision: 'fixture-r1', baseUrl: providerId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.moonshot.cn', protocol, consumerId: 'studybuddy_harness', consumerVersion: '1', fundingSource: 'user_api' }, allowedModels: local.grant.allowedModels } } } : local
  const directory = new BuiltinModelDirectory(ctx, { hostGeneration: host, createAdapter: (route, headers, facts) => createBuiltinWireAdapter(route, headers, { ...(facts === undefined ? {} : { facts }), fetch: async () => new Response(wire ?? sse(protocol, usage), { headers: { 'content-type': 'text/event-stream' } }) }), trustedConversation: options => ({ sessionId: String(options.sessionId), appendAudit: async () => {} }), admit: async capture => ({ schemaVersion: 1, clientRequestId: capture.clientRequestId, selection: capture.selection, authority: capture.authority, sessionId: capture.sessionId, purpose: capture.purpose, requestReceipt: null }) })
  const snapshot = { schemaVersion: 1 as const, operationId: '44444444-4444-4444-8444-444444444444', scope: { accountId: owner, generation: 1 }, hostGeneration: host, catalogVersion: 'fixture-r1', catalogDigest: 'c'.repeat(64), routes: [route] }
  const signed = { ...snapshot, catalogDigest: createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(snapshot)).digest('hex') }, ack = await directory.apply(signed)
  directory.publishReady({ schemaVersion: 1, operationId: snapshot.operationId, localRef: ack.applied[0]!.localRef, sourceRevision: 'e'.repeat(64), state: 'ready', phase: 'ready', catalogVersion: ack.catalogVersion, catalogDigest: ack.catalogDigest, hostApplied: ack, appliedModels: ack.applied, errorCode: null })
  const options: GenerateOptions = markAgentLoopRequest({ provider: 'source-one', model: 'model-a', sessionId: 'native-fixture-session' as never, maxTokens: 16, messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply OK.' }] }] })
  const chunks: StreamChunk[] = []
  try { for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk); return chunks }
  finally { await ctx.fiber.dispose() }
}
it.each(['openai_chat_completions', 'openai_responses', 'anthropic_messages'] as const)('omits SDK zero defaults when %s raw provider usage is missing', async protocol => {
  const chunks = await collect(protocol)
  expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'OK')).toBe(true)
  expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([])
})
it.each(['deepseek', 'kimi'] as const)('preserves %s Chat total and separates cache/reasoning without counting them twice', async provider => {
  expect((await collect('openai_chat_completions', { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29, prompt_cache_hit_tokens: 5, completion_tokens_details: { reasoning_tokens: 4 } }, provider)).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 15, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, reasoningTokens: 4 } }])
})
it.each(['deepseek', 'kimi'] as const)('records exact %s terminal usage for a tool-call step', async provider => {
  const wire = data({ id: 'response-a', model: 'model-a', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-video', type: 'function', function: { name: 'video_read_project', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] })
    + data({ id: 'response-a', model: 'model-a', choices: [], usage: { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29, prompt_cache_hit_tokens: 5, completion_tokens_details: { reasoning_tokens: 4 } } }) + 'data: [DONE]\n\n'
  const chunks = await collect('openai_chat_completions', undefined, provider, wire)
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
  expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 15, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, reasoningTokens: 4 } }])
})
it('preserves the existing SDK Chat cache-write detail and top-level cached token source without double counting', async () => {
  const chunks = await collect('openai_chat_completions', { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, cached_tokens: 3, prompt_tokens_details: { cache_write_tokens: 2 } })
  expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 15, outputTokens: 5, totalTokens: 25, cacheReadTokens: 3, cacheWriteTokens: 2 } }])
})
it.each([
  { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_cache_hit_tokens: 3, prompt_tokens_details: { cached_tokens: 4 } },
  { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_tokens_details: { cached_tokens: 18, cache_write_tokens: 3 } },
])('rejects conflicting or excessive reported Chat cache counters without clamping: %j', async usage => {
  expect((await collect('openai_chat_completions', usage)).filter(chunk => chunk.type === 'usage')).toEqual([])
})
it.each(['openai_chat_completions', 'openai_responses', 'anthropic_messages'] as const)('preserves authoritative all-zero fields from %s instead of treating zero as missing', async protocol => {
  const usage = protocol === 'openai_chat_completions' ? { prompt_tokens: 0, completion_tokens: 0 } : { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  expect((await collect(protocol, usage)).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, ...(protocol === 'anthropic_messages' ? { cacheReadTokens: 0, cacheWriteTokens: 0 } : {}) } }])
})
it.each(['openai_chat_completions', 'openai_responses'] as const)('omits %s partial raw usage with an absent required aggregate field', async protocol => {
  const usage = protocol === 'openai_chat_completions' ? { prompt_tokens: 20 } : { output_tokens: 9 }
  expect((await collect(protocol, usage)).filter(chunk => chunk.type === 'usage')).toEqual([])
})
it('requires all Anthropic aggregate cache fields and preserves its complete disjoint usage', async () => {
  expect((await collect('anthropic_messages', { input_tokens: 7, output_tokens: 9 })).filter(chunk => chunk.type === 'usage')).toEqual([])
  expect((await collect('anthropic_messages', { input_tokens: 7, output_tokens: 9, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 })).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 7, outputTokens: 9, cacheReadTokens: 5, cacheWriteTokens: 3, totalTokens: 24 } }])
})
it('keeps inconsistent provider totals unknown and preserves Responses cache/reasoning subsets', async () => {
  expect((await collect('openai_chat_completions', { prompt_tokens: 20, completion_tokens: 9, total_tokens: 99 })).filter(chunk => chunk.type === 'usage')).toEqual([])
  expect((await collect('openai_responses', { input_tokens: 20, output_tokens: 9, total_tokens: 29, input_tokens_details: { cached_tokens: 5 }, output_tokens_details: { reasoning_tokens: 4 } })).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 15, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, reasoningTokens: 4 } }])
})
it('preserves the live official Responses cache-write field alongside cache read and reasoning subsets', async () => {
  const usage = { input_tokens: 20, output_tokens: 9, total_tokens: 29, input_tokens_details: { cached_tokens: 5, cache_write_tokens: 3 }, output_tokens_details: { reasoning_tokens: 4 } }
  expect((await collect('openai_responses', usage)).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 12, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, cacheWriteTokens: 3, reasoningTokens: 4 } }])
  expect((await collect('openai_responses', { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } })).filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }])
})
it.each([3, -1, 'invalid'])('keeps Responses cache-write usage unknown if reported counters are invalid or exceed aggregate: %j', async write => {
  const chunks = await collect('openai_responses', { input_tokens: 5, output_tokens: 2, total_tokens: 7, input_tokens_details: { cached_tokens: 3, cache_write_tokens: write } })
  expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([])
})
function kimiStatistics(choiceUsage?: Record<string, unknown>, topUsage?: Record<string, unknown>, finalUsage?: Record<string, unknown>): string {
  return data({ id: 'response-a', model: 'model-a', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop', ...(choiceUsage === undefined ? {} : { usage: choiceUsage }) }], ...(topUsage === undefined ? {} : { usage: topUsage }) }) + (finalUsage === undefined ? '' : data({ id: 'response-a', model: 'model-a', choices: [], usage: finalUsage })) + 'data: [DONE]\n\n'
}
it('observes live official Kimi choice-only terminal statistics and deduplicates consistent top-level statistics', async () => {
  const usage = { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29, prompt_cache_hit_tokens: 5, completion_tokens_details: { reasoning_tokens: 4 } }
  const expected = [{ type: 'usage', usage: { inputTokens: 15, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, reasoningTokens: 4 } }]
  expect((await collect('openai_chat_completions', undefined, 'kimi', kimiStatistics(usage))).filter(chunk => chunk.type === 'usage')).toEqual(expected)
  const aggregate = { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 }
  expect((await collect('openai_chat_completions', undefined, 'kimi', kimiStatistics(usage, aggregate, aggregate))).filter(chunk => chunk.type === 'usage')).toEqual(expected)
})
it.each([
  [{ prompt_tokens: 21, completion_tokens: 9, total_tokens: 30 }, { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 }, undefined],
  [{ prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }, undefined, { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 }],
  [undefined, { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }, { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 }],
  [{ prompt_tokens: 20 }, undefined, { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 }],
  [{ prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_tokens_details: { cached_tokens: 18 } }, { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_tokens_details: { cache_write_tokens: 3 } }, undefined],
] as const)('rejects conflicting/partial Kimi statistics and combined caches beyond aggregate: %j', async (choice, top, final) => {
  const chunks = await collect('openai_chat_completions', undefined, 'kimi', kimiStatistics(choice, top, final))
  expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([])
})
