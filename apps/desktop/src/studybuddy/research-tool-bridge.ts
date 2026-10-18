/** Main-selected local research endpoints for admitted native model tools. */
import { parseHarnessResearchToolInvocationV1 } from '@studybuddy/contracts'
import type { HarnessResearchContextV1, OwnedScope } from '@studybuddy/contracts'
interface Options {
  isCurrent(scope: OwnedScope): boolean
  binding(scope: OwnedScope, projectId: string, sessionId: string): Promise<HarnessResearchContextV1>
  origin(scope: OwnedScope): Promise<string>
  headers(scope: OwnedScope, url: string): Readonly<Record<string, string>>
  fetch(url: string, init: RequestInit): Promise<Response>
}
const same = (a: HarnessResearchContextV1, b: HarnessResearchContextV1) => a.scope.accountId === b.scope.accountId && a.scope.generation === b.scope.generation &&
  a.hostGeneration === b.hostGeneration && a.projectId === b.projectId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.lease === b.lease
/** No endpoint, credential, model or authority can be selected by tool arguments. */
export class ResearchNativeToolBridge {
  constructor(private readonly options: Options) {}
  /** Execute once under the exact private Host/project context. */
  async handle(value: unknown, signal: AbortSignal): Promise<unknown> {
    const request = parseHarnessResearchToolInvocationV1(value), context = request.context
    const assert = () => { signal.throwIfAborted(); if (!this.options.isCurrent(context.scope)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED') }
    assert(); const binding = await this.options.binding(context.scope, context.projectId, context.sessionId); assert()
    if (!same(binding, context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    const origin = await this.options.origin(context.scope); assert()
    if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || Number(new URL(origin).port) > 65535) throw Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
    const url = `${origin}/api/research/tools/${request.operation}`, headers = this.options.headers(context.scope, url)
    if (!headers['X-StudyBuddy-Research-Tool']) throw Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
    const response = await this.options.fetch(url, { method: 'POST', redirect: 'error', signal, headers: { ...headers,
      'Content-Type': 'application/json', Origin: origin, 'X-Project-Id': context.projectId },
      body: JSON.stringify({ toolCallId: request.toolCallId, sessionId: context.sessionId, record: request.input.record }) })
    assert()
    if (!response.body) throw Error('HARNESS_RESEARCH_TOOL_FAILED')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0
    try { for (;;) { const next = await reader.read(); assert(); if (next.done) break
      bytes += next.value.byteLength; if (bytes > 512 * 1024) throw Error('HARNESS_RESEARCH_TOOL_RESPONSE_INVALID'); chunks.push(next.value)
    } } finally { await reader.cancel().catch(() => {}) }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if(!response.ok){const row=result&&typeof result==='object'?result as Record<string,unknown>:undefined;const code=row?.detail??row?.message;throw Error(typeof code==='string'&&/^(?:RESEARCH_|AUTODL_)[A-Z0-9_]{1,100}$/.test(code)?code:'HARNESS_RESEARCH_TOOL_FAILED')}
    assert(); if (!same(await this.options.binding(context.scope, context.projectId, context.sessionId), context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    assert(); return result
  }
}
