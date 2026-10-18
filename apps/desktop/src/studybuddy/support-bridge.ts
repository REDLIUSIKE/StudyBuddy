/** Closed authenticated-main-frame support IPC over the existing native owner. */
import { randomUUID } from 'node:crypto'
import { parseHarnessSupportRequest, parseHarnessSupportResult, parseSupportRequestId, type HarnessSupportEvent,
  type HarnessSupportMethod, type HarnessSupportOperationMap, type HarnessSupportOperationView, type OwnedScope } from '@studybuddy/contracts'
import type { MainSession } from './services.ts'
import type { SupportDiagnostics } from './support-diagnostics.ts'
import { BusinessFailure } from './business-api.ts'
import { SUPPORT_IPC } from './support-ipc.ts'
/** Electron supplies these sender facts, never renderer JSON. */
export interface SupportSender { id: number; mainFrame: boolean; url: string }
type Handler = (sender: SupportSender, args: readonly unknown[]) => Promise<unknown>
/** Native and IPC dependencies owned by the current authenticated main process. */
export interface SupportBridgeDependencies {
  readScope(): OwnedScope | undefined
  withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>
  isTrustedSender(sender: SupportSender): boolean
  register(channel: string, handler: Handler): () => void
  emit(sender: SupportSender, channel: string, payload: unknown): void
  pickScreenshots(sender: SupportSender): Promise<readonly string[]>
  native: {
    useSession(session: MainSession): void
    invokeSupport(scope: OwnedScope, method: HarnessSupportMethod, args: HarnessSupportOperationMap[HarnessSupportMethod]['args']): Promise<unknown>
    subscribeSupportEvents(scope: OwnedScope, listener: (event: HarnessSupportEvent) => void): () => void
  }
  diagnostics: SupportDiagnostics
}
const same = (a: OwnedScope | undefined, b: OwnedScope | undefined): boolean =>
  a?.accountId === b?.accountId && a?.generation === b?.generation
/** Install narrow handlers and revoke account-owned progress/results on session loss.
 * @param deps Trusted main/session services, the original companion and the native picker.
 * @returns Explicit owner invalidation and full IPC disposal.
 */
export function installSupportBridge(deps: SupportBridgeDependencies): { revoke(): void; dispose(): void } {
  let epoch = 0; let disposed = false; let owner: OwnedScope | undefined; let detach: (() => void) | undefined
  const subscribers = new Map<string, Map<number, SupportSender>>()
  const operations = new Map<string, { fingerprint: string; promise: Promise<unknown>; view?: HarnessSupportOperationView }>()
  const revoke = (): void => { epoch++; detach?.(); detach = undefined; owner = undefined
    subscribers.clear(); operations.clear(); deps.diagnostics.revoke() }
  const assert = (sender: SupportSender): OwnedScope => {
    const scope = deps.readScope()
    if (disposed || !deps.isTrustedSender(sender) || !scope) throw new BusinessFailure('BUSINESS_SENDER_DENIED')
    if (owner && !same(owner, scope)) revoke()
    owner = { ...scope }; return scope
  }
  const call = async <K extends HarnessSupportMethod>(session: MainSession, method: K, args: unknown) => {
    deps.native.useSession(session)
    if (!detach) detach = deps.native.subscribeSupportEvents(session.scope, (event) => {
      if (!same(owner, deps.readScope()) || disposed) return
      const operation = operations.get(event.requestId)
      if (operation) operation.view = event.operation
      for (const sender of subscribers.get(event.requestId)?.values() ?? []) {
        if (deps.isTrustedSender(sender)) deps.emit(sender, SUPPORT_IPC.progress, event)
      }
    })
    return parseHarnessSupportResult(method, await deps.native.invokeSupport(session.scope, method,
      parseHarnessSupportRequest(method, args)))
  }
  const handlers: Record<string, Handler> = {
    [SUPPORT_IPC.preview]: async (_sender, args) => deps.withSession(async (session) => {
      const range = parseHarnessSupportRequest('previewSupportLogs', args)
      await deps.diagnostics.collect(); await deps.diagnostics.flush()
      return { ...await call(session, 'previewSupportLogs', range), sources: deps.diagnostics.coverage() }
    }),
    [SUPPORT_IPC.exit]: async (_sender, args) => deps.withSession(session => call(session, 'readSupportPreviousExit', args)),
    [SUPPORT_IPC.screenshots]: async (sender, args) => {
      if (args.length) throw new BusinessFailure('HARNESS_SUPPORT_INVALID')
      const scope = assert(sender), generation = epoch, paths = await deps.pickScreenshots(sender)
      if (generation !== epoch || !same(scope, assert(sender))) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
      if (!paths.length) return []
      return deps.withSession(session => call(session, 'stageSupportScreenshots', [parseSupportRequestId(randomUUID()), paths]))
    },
    [SUPPORT_IPC.operation]: async (_sender, args) => {
      const [id] = parseHarnessSupportRequest('getSupportOperation', args)
      return operations.get(id)?.view ?? deps.withSession(session => call(session, 'getSupportOperation', [id]))
    },
    [SUPPORT_IPC.subscribe]: async (sender, args) => {
      const [id] = parseHarnessSupportRequest('getSupportOperation', args)
      if (!subscribers.has(id) && subscribers.size >= 128) throw new BusinessFailure('SUPPORT_OPERATION_LIMIT')
      const clients = subscribers.get(id) ?? new Map<number, SupportSender>(); clients.set(sender.id, sender); subscribers.set(id, clients)
      return await Promise.resolve(null)
    },
    [SUPPORT_IPC.unsubscribe]: async (sender, args) => {
      const [id] = parseHarnessSupportRequest('getSupportOperation', args); const clients = subscribers.get(id)
      clients?.delete(sender.id); if (!clients?.size) subscribers.delete(id); return await Promise.resolve(null)
    },
  }
  for (const [channel, method] of [[SUPPORT_IPC.upload, 'uploadSupportLogs'], [SUPPORT_IPC.report, 'submitSupportIssue']] as const) {
    handlers[channel] = async (_sender, args) => {
      const parsed = parseHarnessSupportRequest(method, args), id = parsed[0], fingerprint = JSON.stringify([method, parsed])
      const existing = operations.get(id)
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new BusinessFailure('SUPPORT_REQUEST_CHANGED')
        if (existing.view && existing.view.state !== 'running' && existing.view.state !== 'failed') return existing.view
        if (!existing.view || existing.view.state === 'running') return existing.promise
      }
      if (operations.size >= 128) throw new BusinessFailure('SUPPORT_OPERATION_LIMIT')
      const item: { fingerprint: string; promise: Promise<unknown>; view?: HarnessSupportOperationView } = {
        fingerprint, promise: Promise.resolve() }
      operations.set(id, item)
      item.promise = deps.withSession(async (session) => {
        deps.diagnostics.record({ source: 'desktop_main', eventName: 'harness_support_started', outcome: 'started' })
        await deps.diagnostics.collect(); await deps.diagnostics.flush()
        const view = await call(session, method, parsed); item.view = view
        deps.diagnostics.record({ source: 'desktop_main', eventName: view.state === 'available'
          ? 'harness_support_completed' : 'harness_support_failed', outcome: view.state === 'available' ? 'succeeded' : 'failed' })
        return view
      })
      return item.promise
    }
  }
  const disposers = Object.entries(handlers).map(([channel, handler]) => deps.register(channel, async (sender, args) => {
    try {
      const scope = assert(sender), generation = epoch; const data = await handler(sender, args)
      if (generation !== epoch || !same(scope, assert(sender))) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
      return { ok: true, data }
    } catch (_error) {
      const code = _error instanceof BusinessFailure ? _error.code
        : _error instanceof Error && ['AUTH_REQUIRED', 'ACCOUNT_SCOPE_CHANGED'].includes(_error.message)
          ? _error.message : 'HARNESS_SUPPORT_INVALID'
      return { ok: false, error: { code } }
    }
  }))
  return { revoke, dispose() { disposed = true; revoke(); disposers.forEach((dispose) => { dispose() }) } }
}
