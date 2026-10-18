/** Observe exact provider terminal fields without deriving tokens from stream events. */
import type { NativeBuiltinTerminalUsageV1, NativeBuiltinUsageRecordV1, NativeProtocol } from '@studybuddy/contracts'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'

/** Mutable observation owned only by a single private adapter dispatch. */
export interface BuiltinResponseFacts {
  providerResponseId: string | null
  returnedModel: string | null
  usage: NativeBuiltinTerminalUsageV1 | null
  outcome: NativeBuiltinUsageRecordV1['outcome']
}

/** Project provider-terminal aggregate counts; absent raw fields never become SDK zero defaults.
 * @param facts - Raw response observation from this exact private request.
 * @returns Disjoint known cache/input fields and the authoritative full-call total, or undefined. */
export function projectBuiltinTerminalUsage(facts: BuiltinResponseFacts): TokenUsage | undefined {
  const usage = facts.usage
  if (usage === null || !['completed', 'incomplete', 'refused'].includes(facts.outcome) || usage.inputTotalTokens === null) return
  const inputTotal = usage.inputTotalTokens, outputTokens = usage.outputTokens, read = usage.cacheReadTokens, write = usage.cacheWriteTokens, reasoning = usage.reasoningTokens
  if (![inputTotal, outputTokens, ...(read === null ? [] : [read]), ...(write === null ? [] : [write]), ...(reasoning === null ? [] : [reasoning])].every(value => Number.isSafeInteger(value) && value >= 0)) return
  const inputTokens = inputTotal - (read ?? 0) - (write ?? 0), totalTokens = inputTotal + outputTokens
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(totalTokens) || reasoning !== null && reasoning > outputTokens) return
  return { inputTokens, outputTokens, totalTokens, ...(read === null ? {} : { cacheReadTokens: read }), ...(write === null ? {} : { cacheWriteTokens: write }), ...(reasoning === null ? {} : { reasoningTokens: reasoning }) }
}

const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' &&
  !Array.isArray(value) ? value as Record<string, unknown> : undefined
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown): string | null => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) ? value : null

function usage(protocol: NativeProtocol, value: unknown): NativeBuiltinTerminalUsageV1 | null {
  const row = object(value)
  if (row === undefined) return null
  const chat = protocol === 'openai_chat_completions'
  const inputTokens = count(chat ? row.prompt_tokens : row.input_tokens)
  const outputTokens = count(chat ? row.completion_tokens : row.output_tokens)
  if (inputTokens === null || outputTokens === null) return null
  const inputDetails = object(chat ? row.prompt_tokens_details : row.input_tokens_details)
  const outputDetails = object(chat ? row.completion_tokens_details : row.output_tokens_details)
  const reads = (protocol === 'anthropic_messages' ? [row.cache_read_input_tokens] : chat ? [inputDetails?.cached_tokens, row.prompt_cache_hit_tokens, row.cached_tokens] : [inputDetails?.cached_tokens]).filter(value => value !== undefined)
  if (reads.some(value => count(value) === null) || new Set(reads).size > 1) return null
  const cacheReadTokens = count(protocol === 'anthropic_messages' ? row.cache_read_input_tokens :
    inputDetails?.cached_tokens ?? row.prompt_cache_hit_tokens ?? (chat ? row.cached_tokens : undefined))
  const write = protocol === 'anthropic_messages' ? row.cache_creation_input_tokens : inputDetails?.cache_write_tokens
  if (write !== undefined && count(write) === null) return null
  const cacheWriteTokens = count(write)
  const cacheCreation = object(row.cache_creation)
  const inputTotalTokens = protocol === 'anthropic_messages' ? cacheReadTokens !== null && cacheWriteTokens !== null ? inputTokens + cacheReadTokens + cacheWriteTokens : null : inputTokens
  if (inputTotalTokens !== null && (!Number.isSafeInteger(inputTotalTokens + outputTokens) || (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) > inputTotalTokens)) return null
  if (Object.hasOwn(row, 'total_tokens') && (count(row.total_tokens) === null || inputTotalTokens === null || row.total_tokens !== inputTotalTokens + outputTokens)) return null
  return {
    inputTokens, outputTokens,
    inputTotalTokens,
    cacheReadTokens, cacheWriteTokens, reasoningTokens: count(outputDetails?.reasoning_tokens),
    cacheWrite5mTokens: count(cacheCreation?.ephemeral_5m_input_tokens), cacheWrite1hTokens:
      count(cacheCreation?.ephemeral_1h_input_tokens),
  }
}

/** Wrap the provider fetch while leaving its exact response bytes available to the shipped SDK.
 * @param transport - The process-owned HTTP implementation.
 * @param protocol - Native-issued exact protocol.
 * @param facts - One request's private observation, never shared across requests.
 * @returns A no-redirect transport with a bounded incremental SSE observer. */
export function observeBuiltinTerminal(transport: typeof fetch, protocol: NativeProtocol, facts: BuiltinResponseFacts): typeof fetch {
  return async (input, init) => {
    const result = await transport(input, { ...init, redirect: 'error' })
    if (!result.ok || result.body === null || !result.headers.get('content-type')?.includes('text/event-stream')) return result
    let buffer = '', data: string[] = [], invalid = false, ended = false
    let pendingUsage: NativeBuiltinTerminalUsageV1 | null = null
    let invalidUsage = false
    let anthropicUsage: Record<string, unknown> = {}
    let terminal: NativeBuiltinUsageRecordV1['outcome'] = 'unknown'
    const decoder = new TextDecoder()
    const identity = (row: Record<string, unknown>) => {
      const id = text(row.id), model = text(row.model)
      if (id !== null) {
        if (facts.providerResponseId !== null && facts.providerResponseId !== id) invalid = true
        facts.providerResponseId = id
      }
      if (model !== null) { if (facts.returnedModel !== null && facts.returnedModel !== model) invalid = true; facts.returnedModel = model }
    }
    const end = () => {
      ended = true
      facts.outcome = invalid ? 'contract_invalid' : terminal
      facts.usage = invalid || invalidUsage || terminal === 'unknown' || terminal === 'failed' ? null : pendingUsage
    }
    const rejectUsage = () => { invalidUsage = true; pendingUsage = null; facts.usage = null }
    // Kimi's two documented terminal locations describe one request. Preserve
    // known fields from consistent observations; never prefer one conflict.
    const recordUsage = (value: unknown) => {
      if (value === undefined || value === null || invalidUsage) return
      const candidate = usage(protocol, value)
      if (candidate === null) { rejectUsage(); return }
      const combined = { ...candidate }
      if (pendingUsage !== null) for (const key of Object.keys(candidate) as (keyof NativeBuiltinTerminalUsageV1)[]) {
        const previous = pendingUsage[key], current = candidate[key]
        if (previous !== null && current !== null && previous !== current) { rejectUsage(); return }
        if (previous !== null && current === null) combined[key] = previous
      }
      if (combined.inputTotalTokens !== null && (combined.cacheReadTokens ?? 0) + (combined.cacheWriteTokens ?? 0) > combined.inputTotalTokens) { rejectUsage(); return }
      pendingUsage = combined
    }
    const event = () => {
      const payload = data.join('\n'); data = []
      if (payload === '') return
      if (payload === '[DONE]') { if (protocol === 'openai_chat_completions') end(); return }
      let parsed: unknown; try { parsed = JSON.parse(payload) } catch { invalid = true; return }
      const row = object(parsed); if (row === undefined) { invalid = true; return }
      if (protocol === 'openai_chat_completions') {
        identity(row)
        recordUsage(row.usage)
        if (Array.isArray(row.choices)) recordUsage(object(row.choices[0])?.usage)
        if (Array.isArray(row.choices)) for (const choice of row.choices) {
          const reason = object(choice)?.finish_reason
          if (reason === 'stop' || reason === 'tool_calls') terminal = 'completed'
          else if (reason === 'length') terminal = 'incomplete'
          else if (reason === 'content_filter') terminal = 'refused'
        }
      } else if (protocol === 'openai_responses') {
        const response = object(row.response)
        if (response !== undefined) identity(response)
        if (row.type === 'response.completed' || row.type === 'response.incomplete' || row.type === 'response.failed') {
          terminal = row.type === 'response.completed' ? 'completed' : row.type === 'response.incomplete' ? 'incomplete' : 'failed'
          recordUsage(response?.usage); end()
        }
      } else {
        const message = object(row.message)
        if (row.type === 'message_start' && message !== undefined) { identity(message); anthropicUsage = { ...object(message.usage) } }
        if (row.type === 'message_delta') {
          anthropicUsage = { ...anthropicUsage, ...object(row.usage) }
          const reason = object(row.delta)?.stop_reason
          if (reason === 'end_turn' || reason === 'tool_use' || reason === 'stop_sequence') terminal = 'completed'
          else if (reason === 'max_tokens') terminal = 'incomplete'
          else if (reason === 'refusal') terminal = 'refused'
        }
        if (row.type === 'message_stop') { pendingUsage = usage(protocol, anthropicUsage); end() }
      }
    }
    const feed = (part: string) => {
      buffer += part
      if (buffer.length > 256 * 1024) { invalid = true; buffer = ''; data = []; return }
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1)
        if (line === '') event()
        else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
          if (data.reduce((sum, item) => sum + item.length, 0) > 256 * 1024) { invalid = true; data = [] }
        }
      }
    }
    const body = result.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { feed(decoder.decode(chunk, { stream: true })); controller.enqueue(chunk) },
      flush() {
        feed(decoder.decode()); if (!ended || invalid) {
          facts.outcome = invalid ? 'contract_invalid' :
            'unknown'; facts.usage = null
        }
      },
    }))
    return new Response(body, { status: result.status, statusText: result.statusText, headers: result.headers })
  }
}
