/** Main-only exact current-model preparation and terminal receipts for each upstream judge call. */
import { parseNativeBuiltinRequestReceiptV1 } from '@studybuddy/contracts'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ModelKeyClient } from './model-key-client.ts'
import type { SkillSafetyActor } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import type { AigcTextChoice, AigcTextConsumer, AigcPlatformConsumer } from './aigc-types.ts'
import type { StudyBuddyFetch } from './services.ts'
import type { SkillScannerLlmRequest, SkillScannerLlmResponse } from './skill-safety-transport.ts'
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'
export interface SkillSafetyCallRecord { requestId: string; fingerprint: string; modelIdentity: string; result?: SkillScannerLlmResponse }
export interface SkillSafetyCallStore {
  read(actor: SkillSafetyActor, id: string): Promise<SkillSafetyCallRecord | undefined>
  claim(actor: SkillSafetyActor, id: string, record: SkillSafetyCallRecord): Promise<SkillSafetyCallRecord>
  settle(actor: SkillSafetyActor, id: string, result: SkillScannerLlmResponse): Promise<void>
}
export interface SkillSafetyTextOptions {
  consumer: AigcTextConsumer; platform?: AigcPlatformConsumer
  selection(actor: SkillSafetyActor): Promise<AigcTextChoice | undefined>
  isCurrent(actor: SkillSafetyActor): boolean
  records: SkillSafetyCallStore
  fetch: StudyBuddyFetch
  audit(actor: SkillSafetyActor, record: Readonly<Record<string, unknown>>): Promise<void>
}
export class SkillSafetyTextConsumer {
  constructor(private readonly options: SkillSafetyTextOptions) {}
  /**
   * Prepare exactly one original current-model request for one actual judge invocation.
   * @param actor - Main-owned live account/session, never model JSON.
   * @param analysisId - Private scanner invocation and call identity.
   * @param request - Original upstream inert messages; cannot select a model, Key or funding.
   * @param signal - Current turn lifetime.
   * @returns Content and provider-terminal counts after trusted request reconciliation.
   * @throws Unknown outcomes cannot dispatch again, including after a Main restart.
   */
  async call(actor: SkillSafetyActor, analysisId: string, request: SkillScannerLlmRequest, signal: AbortSignal): Promise<SkillScannerLlmResponse> {
    const check = () => { if (signal.aborted) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED'); if (!this.options.isCurrent(actor)) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE') }
    check()
    const chosen = await this.options.selection(actor); check()
    if (!chosen || chosen.selection.protocol !== 'openai_chat_completions' || !['deepseek', 'kimi'].includes(chosen.selection.providerId) || chosen.authority.maxOutputTokens === null || request.maxTokens > chosen.authority.maxOutputTokens ||
      !Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1 || request.messages.length < 1 || request.messages.length > 20 || Buffer.byteLength(JSON.stringify(request)) > 4 * 1024 * 1024) throw new SkillSafetyError('SKILL_SAFETY_MODEL_UNSUPPORTED')
    // Copy before any await: an owner replacing its published object cannot alter this call's authority.
    const choice = structuredClone(chosen), choiceFingerprint = fingerprint(choice)
    const modelIdentity = fingerprint(choice.selection), argumentFingerprint = fingerprint([actor, choiceFingerprint, request])
    const scope = { accountId: actor.accountId, generation: actor.generation }
    const prior = await this.options.records.read(actor, analysisId); check()
    if (prior) {
      if (prior.fingerprint !== argumentFingerprint || prior.modelIdentity !== modelIdentity) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
      if (prior.result) return prior.result
      // Reconciliation is read-only; even a terminal receipt cannot recreate a lost verdict or grant another paid call.
      if (!('kind' in choice)) await this.options.consumer.consumerRequestStatus(scope, prior.requestId).catch(() => null)
      throw new SkillSafetyError('SKILL_SAFETY_OUTCOME_UNKNOWN')
    }
    const requestId = randomUUID(), record = { requestId, fingerprint: argumentFingerprint, modelIdentity }
    const claimed = await this.options.records.claim(actor, analysisId, record); check()
    if (claimed.requestId !== requestId) throw new SkillSafetyError('SKILL_SAFETY_OUTCOME_UNKNOWN')
    const input = { handle: choice.handle, clientRequestId: requestId, sessionId: actor.sessionId, protocol: choice.selection.protocol }
    let origin: string, apiKey: string
    if ('kind' in choice) {
      if (!this.options.platform) throw new SkillSafetyError('SKILL_SAFETY_MODEL_UNSUPPORTED')
      const prepared = await this.options.platform.prepareAigcRequest(scope, input); check()
      if (prepared.request.clientRequestId !== requestId || prepared.request.sessionId !== actor.sessionId || prepared.request.exactModelId !== choice.selection.exactModelId ||
        prepared.material.selectedModelId !== choice.selection.exactModelId || prepared.material.selectedProviderId !== choice.selection.providerId || prepared.material.fundingSource !== 'platform' ||
        prepared.material.protocol !== choice.selection.protocol || !prepared.material.authorizedModels.some(value => fingerprint(value) === fingerprint(choice.authority))) throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED')
      origin = prepared.material.gatewayOrigin; apiKey = prepared.material.apiKey
    } else {
      const { frozen, route } = await this.options.consumer.prepareConsumerRequest(scope, input); check()
      if (frozen.clientRequestId !== requestId || frozen.sessionId !== actor.sessionId || frozen.purpose !== 'chat' || fingerprint(frozen.selection) !== fingerprint(choice.selection) ||
        fingerprint(frozen.authority) !== fingerprint(choice.authority) || route.mode !== 'gateway' || route.routeId !== choice.selection.routeId ||
        frozen.requestReceipt !== null) throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED')
      origin = route.gatewayOrigin; apiKey = route.apiKey
    }
    if (fingerprint(await this.options.selection(actor)) !== choiceFingerprint) throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED'); check()
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || !apiKey || /[\s\p{Cc}]/u.test(apiKey)) throw new SkillSafetyError('SKILL_SAFETY_MODEL_UNSUPPORTED')
    const body = { model: choice.selection.exactModelId, messages: request.messages, stream: false,
      ...(choice.selection.providerId === 'kimi' ? { max_completion_tokens: request.maxTokens } : { max_tokens: request.maxTokens }) }
    const lifetime = AbortSignal.any([signal, AbortSignal.timeout(180_000)])
    await this.options.audit(actor, { analysisId, requestId, modelIdentity, selection: choice.selection, request }); check()
    const response = await this.options.fetch(origin + '/v1/chat/completions', { method: 'POST', credentials: 'omit', redirect: 'error', signal: lifetime,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'X-Request-Id': requestId }, body: JSON.stringify(body) }); check()
    if (!response.ok) { await response.body?.cancel(); throw new SkillSafetyError('SKILL_SAFETY_UPSTREAM_REJECTED') }
    const text = await boundedResponse(response, lifetime); check()
    if (text.includes(apiKey)) throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID')
    let value
    try { value = completion.parse(JSON.parse(text)) } catch { throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID') }
    if (value.model !== choice.selection.exactModelId || value.choices[0]?.finish_reason !== 'stop') throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID')
    const receipt = 'kind' in choice
      ? await platformReceipt(new ModelKeyClient({ baseUrl: origin, readKey: async () => apiKey, fetch: this.options.fetch }), requestId, lifetime)
      : await this.options.consumer.consumerRequestStatus(scope, requestId).catch(() => null)
    check()
    if (!receipt || receipt.state !== 'terminal' || receipt.requestId !== requestId || receipt.purpose !== 'chat') throw new SkillSafetyError('SKILL_SAFETY_OUTCOME_UNKNOWN')
    const result = { content: value.choices[0]!.message.content, usage: { input_tokens: value.usage.prompt_tokens, output_tokens: value.usage.completion_tokens, total_tokens: value.usage.total_tokens } }
    await this.options.audit(actor, { analysisId, requestId, modelIdentity, responseId: value.id, content: result.content, terminalUsage: value.usage, nativeReceipt: { ...receipt, requestTicket: null } }); check()
    await this.options.records.settle(actor, analysisId, result); check()
    return result
  }
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const completion = z.object({ id: z.string().min(1).max(256), model: z.string().min(1).max(256),
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(4 * 1024 * 1024) }).passthrough(), finish_reason: z.string() }).passthrough()).length(1),
  usage: z.object({ prompt_tokens: count, completion_tokens: count, total_tokens: count }).passthrough(),
}).passthrough()
async function boundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8 * 1024 * 1024) throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID'); chunks.push(part.value) } }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}
async function platformReceipt(client: ModelKeyClient, id: string, signal: AbortSignal) {
  try { const response = await client.requestStatus(id, signal); if (!response.ok) { await response.body?.cancel(); return null }; const value = parseNativeBuiltinRequestReceiptV1(JSON.parse(await boundedResponse(response, signal))); return { ...value, requestTicket: null } } catch { return null }
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
