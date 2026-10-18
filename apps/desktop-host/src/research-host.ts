/** Private research admission and operation identity; never registered as a renderer RPC namespace. */
import { parseHarnessResearchContextV1, parseHarnessResearchInvocationV1, parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import type { HarnessResearchActionV1, HarnessResearchContextV1, HarnessResearchEventV1, HarnessResearchInvocationV1, HarnessResearchRunV1, OwnedScope } from '@studybuddy/contracts'
export { runNativeResearchHelper } from './research-helper.ts'
export { createNativeResearchExecution } from './research-session-execution.ts'

/** Provider supplied by the native Session/Workspace owner, not by a guest page. */
export interface NativeResearchExecution {
  admitted(context: HarnessResearchContextV1): Promise<boolean>
  capabilities(context: HarnessResearchContextV1, signal: AbortSignal): Promise<unknown>
  submit(context: HarnessResearchContextV1, action: HarnessResearchActionV1, signal: AbortSignal): Promise<HarnessResearchRunV1>
  inspect(context: HarnessResearchContextV1, runId: string, signal: AbortSignal): Promise<HarnessResearchRunV1>
  cancel(context: HarnessResearchContextV1, runId: string, signal: AbortSignal): Promise<HarnessResearchRunV1>
  answer(context: HarnessResearchContextV1, interactionId: string, answer: unknown, signal: AbortSignal): Promise<void>
  subscribe(context: HarnessResearchContextV1, listener: (event: HarnessResearchEventV1) => void): () => void
}
interface Operation {
  readonly context: HarnessResearchContextV1
  readonly signature: string
  readonly submitted: Promise<HarnessResearchRunV1>
}
export interface ResearchHostOptions { readonly hostGeneration: string; readonly execution: NativeResearchExecution }

function revoked(): Error { return Error('HARNESS_RESEARCH_SCOPE_REVOKED') }
function sameContext(a: HarnessResearchContextV1, b: HarnessResearchContextV1): boolean {
  return a.scope.accountId === b.scope.accountId && a.scope.generation === b.scope.generation && a.hostGeneration === b.hostGeneration &&
    a.projectId === b.projectId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.lease === b.lease
}

export class ResearchHostController {
  private scope: OwnedScope | undefined
  private revocation = new AbortController()
  private readonly operations = new Map<string, Operation>()
  private readonly subscriptions = new Set<() => void>()

  /** @param options - private native execution owner and this Host process identity. */
  constructor(private readonly options: ResearchHostOptions) {}

  /** @param value - Main-owned account generation; null invalidates all old waiters and listeners. */
  setScope(value: unknown): void {
    const next = value === null ? undefined : parseNativeBuiltinHostContextV1(value)
    if (next && next.hostGeneration !== this.options.hostGeneration) throw revoked()
    if (next?.scope.accountId === this.scope?.accountId && next?.scope.generation === this.scope?.generation) return
    this.revocation.abort(revoked())
    for (const dispose of this.subscriptions) dispose()
    this.subscriptions.clear()
    this.operations.clear()
    this.scope = next?.scope
    this.revocation = new AbortController()
  }

  private current(context: HarnessResearchContextV1): boolean {
    return context.hostGeneration === this.options.hostGeneration && this.scope?.accountId === context.scope.accountId && this.scope.generation === context.scope.generation
  }

  private async guarded<T>(context: HarnessResearchContextV1, signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.current(context)) throw revoked()
    const epoch = this.revocation.signal
    const linked = AbortSignal.any([signal, epoch])
    const cancelled = () => epoch.aborted ? revoked() : Error('HARNESS_RESEARCH_WAIT_CANCELLED')
    if (linked.aborted) throw cancelled()
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(cancelled())
      linked.addEventListener('abort', abort, { once: true })
      void (async () => {
        if (!await this.options.execution.admitted(context) || !this.current(context) || epoch.aborted) throw revoked()
        linked.throwIfAborted()
        const result = await work(linked)
        if (!this.current(context) || epoch.aborted) throw revoked()
        linked.throwIfAborted()
        return result
      })().then(resolve, reject).finally(() => linked.removeEventListener('abort', abort))
    })
  }

  /** @param value - closed private invocation. @param signal - this wait's cancellation. @returns a captured native receipt. */
  async invoke(value: HarnessResearchInvocationV1, signal: AbortSignal): Promise<unknown> {
    const request = parseHarnessResearchInvocationV1(value)
    return this.guarded(request.context, signal, async linked => {
      const execution = this.options.execution
      switch (request.operation) {
        case 'capabilities': return execution.capabilities(request.context, linked)
        case 'submit': {
          const signature = JSON.stringify(request.input)
          const old = this.operations.get(request.input.operationId)
          if (old) {
            if (old.signature !== signature || !sameContext(old.context, request.context)) throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT')
            return old.submitted
          }
          // Capture the intent before dispatch. A disconnected RPC only stops
          // its waiter; an admitted native turn keeps its original identity.
          const epoch = this.revocation.signal
          const submitted = Promise.resolve().then(() => this.guarded(request.context, epoch, scoped => execution.submit(request.context, request.input, scoped)))
          this.operations.set(request.input.operationId, { context: request.context, signature, submitted })
          return submitted
        }
        case 'inspect': return execution.inspect(request.context, request.input.runId, linked)
        case 'cancel': return execution.cancel(request.context, request.input.runId, linked)
        case 'answer': return execution.answer(request.context, request.input.interactionId, request.input.answer, linked)
      }
    })
  }

  /** @param value - captured context. @param listener - observed native events only. @returns the owned listener disposer. */
  subscribe(value: HarnessResearchContextV1, listener: (event: HarnessResearchEventV1) => void): () => void {
    const context = parseHarnessResearchContextV1(value)
    if (!this.current(context)) throw revoked()
    const epoch = this.revocation.signal
    const seen = new Set<string>()
    let active = true
    let unsubscribe: (() => void) | undefined
    let delivery = Promise.resolve()
    const dispose = () => { if (!active) return; active = false; unsubscribe?.(); this.subscriptions.delete(dispose) }
    this.subscriptions.add(dispose)
    void this.guarded(context, epoch, async () => {
      if (!active) return
      unsubscribe = this.options.execution.subscribe(context, event => {
        delivery = delivery.then(() => this.guarded(context, epoch, async () => {
          if (!active || event.projectId !== context.projectId || event.sessionRef !== context.sessionId || seen.has(event.eventId)) return
          seen.add(event.eventId)
          listener(event)
        })).catch(dispose)
      })
      if (!active) unsubscribe()
    }).catch(dispose)
    return dispose
  }
}
