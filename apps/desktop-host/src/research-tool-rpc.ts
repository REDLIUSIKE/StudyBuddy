/** Correlated native tool transport. An uncertain execution is never replayed. */
import { randomUUID } from 'node:crypto'
import { parseHarnessResearchToolInvocationV1 } from '@studybuddy/contracts'
import type { HarnessResearchContextV1, HarnessResearchToolOperationV1 } from '@studybuddy/contracts'
interface Options { send(value: object): Promise<void>; current(context: HarnessResearchContextV1): boolean }
interface Pending { context: HarnessResearchContextV1; wireContext: HarnessResearchContextV1; resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }
/** Private Host-to-Main caller; no method is exposed to a guest or renderer. */
export class ResearchToolRpc {
  private readonly pending = new Map<string, Pending>()
  constructor(private readonly options: Options) {}
  /** Submit a single native tool call with captured binding and caller identity. */
  async invoke(context: HarnessResearchContextV1, operation: HarnessResearchToolOperationV1, toolCallId: string, record: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    if (!this.options.current(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    // The admitted Host binding also owns canonical filesystem roots. They
    // remain private to Host; the closed IPC contract carries identity only.
    const { authorizedRoots: _privateRoots, ...wireContext } = context as HarnessResearchContextV1 & { readonly authorizedRoots?: readonly string[] }
    const request = parseHarnessResearchToolInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), context: wireContext, toolCallId, operation, input: { record } })
    return new Promise((resolve, reject) => {
      const abort = () => {
        const row = this.pending.get(request.rpcId); if (!row) return
        this.pending.delete(request.rpcId); row.cleanup()
        void this.options.send({ type: 'research-tool-cancel', rpcId: request.rpcId, context: request.context }).catch(() => {})
        reject(Error('HARNESS_RESEARCH_TOOL_CANCELLED'))
      }
      const timer = setTimeout(abort, 30_000); timer.unref()
      this.pending.set(request.rpcId, { context, wireContext: request.context, resolve, reject, cleanup: () => { clearTimeout(timer); signal.removeEventListener('abort', abort) } })
      signal.addEventListener('abort', abort, { once: true })
      void this.options.send({ type: 'research-tool-request', request }).catch(() => {
        const row = this.pending.get(request.rpcId); if (!row) return
        this.pending.delete(request.rpcId); row.cleanup(); reject(Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE'))
      })
    })
  }
  /** Accept only a response correlated to an outstanding current request. */
  result(value: unknown): void {
    if (!value || typeof value !== 'object' || !('rpcId' in value) || typeof value.rpcId !== 'string') return
    const row = this.pending.get(value.rpcId); if (!row) return
    this.pending.delete(value.rpcId); row.cleanup()
    if (!this.options.current(row.context)) { row.reject(Error('HARNESS_RESEARCH_SCOPE_REVOKED')); return }
    if ('error' in value && value.error !== undefined) { row.reject(Error(typeof value.error === 'string' && /^[A-Z0-9_]{1,128}$/.test(value.error) ? value.error : 'HARNESS_RESEARCH_TOOL_UNAVAILABLE')); return }
    if (!('data' in value)) { row.reject(Error('HARNESS_RESEARCH_TOOL_RESPONSE_INVALID')); return }
    row.resolve(value.data)
  }
  /** Withdraw observers immediately on account or project admission revocation. */
  revoke(projectId?: string): void {
    for (const [rpcId, row] of this.pending) {
      if (projectId !== undefined && row.context.projectId !== projectId) continue
      row.cleanup(); row.reject(Error('HARNESS_RESEARCH_SCOPE_REVOKED'))
      void this.options.send({ type: 'research-tool-cancel', rpcId, context: row.wireContext }).catch(() => {})
      this.pending.delete(rpcId)
    }
  }
}
