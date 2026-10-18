/** Independent native references remain retained while only project selection changes. */
import { EmbeddedPageController } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EmbeddedPageHost } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { OwnedScope } from '@studybuddy/contracts'
export interface ResearchViewIntent { id: string; text: string; references: readonly string[] }
export interface ResearchView { projectId: string; sessionId: string; reference: SessionReference; selected: boolean; intents: readonly ResearchViewIntent[] }
export interface ResearchViewSnapshot { views: readonly ResearchView[]; selectionError?: { projectId: string } }
const same = (a: OwnedScope | null, b: OwnedScope) => a?.accountId === b.accountId && a.generation === b.generation
/** Page admission and native view retention share the authenticated generation. */
export class ResearchPageController {
  readonly page: EmbeddedPageController<'research'>
  private views = new Map<string, ResearchView>()
  private snapshot: ResearchViewSnapshot = { views: [] }
  private listeners = new Set<() => void>()
  private revision = 0
  private selectionError: { projectId: string } | undefined
  constructor(host: EmbeddedPageHost<'research'> | undefined, private readonly retain: (id: string) => SessionReference) {
    this.page = new EmbeddedPageController('research', host)
  }
  getSnapshot = (): ResearchViewSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(): void {
    this.snapshot = { views: [...this.views.values()], ...(this.selectionError ? { selectionError: this.selectionError } : {}) }
    for (const listener of this.listeners) { try { listener() } catch { console.error('Research view observer failed') } }
  }
  setScope(scope: OwnedScope | null): void {
    const current = this.page.getSnapshot().scope
    if (scope ? same(current, scope) : current === null) return
    const old = [...this.views.values()]; this.views.clear(); this.revision = 0; this.selectionError = undefined; this.publish()
    for (const row of old) row.reference.release()
    this.page.setScope(scope)
  }
  accept(value: unknown): boolean {
    const page = this.page.getSnapshot()
    if (!value || typeof value !== 'object' || !('lease' in value) || value.lease !== page.lease?.lease || !('scope' in value) || !value.scope || typeof value.scope !== 'object' ||
      !('accountId' in value.scope) || !('generation' in value.scope) || !same(page.scope, value.scope as OwnedScope) || !('action' in value) || !value.action || typeof value.action !== 'object' || !('kind' in value.action)) return false
    if (value.action.kind === 'show-models') return true
    if ('errorCode' in value) {
      if (value.errorCode !== 'RESEARCH_NATIVE_SESSION_UNAVAILABLE' || !['open-project','new-chat','select-chat','close-chat'].includes(String(value.action.kind)) ||
        !('projectId' in value.action) || typeof value.action.projectId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.action.projectId) ||
        !('revision' in value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < this.revision) return false
      this.revision = Number(value.revision); this.selectionError = { projectId: value.action.projectId }
      for (const [key, view] of this.views) this.views.set(key, { ...view, selected: false })
      this.publish(); return true
    }
    if (value.action.kind === 'show-projects') {
      if ('revision' in value) { if (!Number.isSafeInteger(value.revision) || Number(value.revision) < this.revision) return false; this.revision = Number(value.revision) }
      this.selectionError = undefined
      for (const [key, view] of this.views) this.views.set(key, { ...view, selected: false }); this.publish(); return true
    }
    if (!['open-project', 'new-chat', 'select-chat', 'close-chat', 'reference', 'draft'].includes(String(value.action.kind)) || !('data' in value) || !value.data || typeof value.data !== 'object' ||
      !('projectId' in value.data) || typeof value.data.projectId !== 'string' || !('sessionId' in value.data) || !('projectId' in value.action) || value.action.projectId !== value.data.projectId) return false
    const id = value.data.sessionId
    if (id !== null) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(id)) return false
    } else if (!['open-project', 'close-chat'].includes(String(value.action.kind)) || !('chats' in value.data) || !Array.isArray(value.data.chats) || value.data.chats.some(chat => !chat || typeof chat !== 'object' || chat.closed !== true)) return false
    const select = value.action.kind !== 'reference' && value.action.kind !== 'draft'
    if (select && 'revision' in value) {
      if (!Number.isSafeInteger(value.revision) || Number(value.revision) < this.revision) return false
      this.revision = Number(value.revision)
    }
    if (id === null) {
      this.selectionError = undefined
      for (const [key, view] of this.views) this.views.set(key, { ...view, selected: false })
      this.publish(); return true
    }
    const existing = this.views.get(id)
    if (existing && existing.projectId !== value.data.projectId) return false
    const row = existing ?? { projectId: value.data.projectId, sessionId: id, reference: this.retain(id), selected: select, intents: [] }
    if ('intents' in value.data && Array.isArray(value.data.intents)) {
      row.intents = value.data.intents.filter(item => item && typeof item === 'object' && item.projectId === row.projectId && item.sessionId === row.sessionId && typeof item.id === 'string' && /^[a-f0-9-]{36}$/.test(item.id) &&
        typeof item.text === 'string' && item.text.length <= 131072 && Array.isArray(item.references) && item.references.length <= 24 && item.references.every((path: unknown) => typeof path === 'string')).map(item => ({ id: item.id, text: item.text, references: [...item.references] }))
    }
    this.views.set(id, row)
    if (select) for (const [key, view] of this.views) this.views.set(key, { ...view, selected: key === id })
    if (select) this.selectionError = undefined
    this.publish(); return true
  }
  /** Remove only an intake acknowledged by the original native composer. */
  acknowledgeIntent(id: string): void {
    for (const [key, row] of this.views) this.views.set(key, { ...row, intents: row.intents.filter(intent => intent.id !== id) })
    this.publish()
  }
  dispose(): void { this.setScope(null); this.page.dispose(); this.listeners.clear() }
}
