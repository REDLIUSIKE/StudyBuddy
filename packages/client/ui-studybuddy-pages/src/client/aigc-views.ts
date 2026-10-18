/** Native Session references belong to project identity; guest rectangles never own a Conversation. */
import type { OwnedScope } from '@studybuddy/contracts'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives'
interface Rect { x: number; y: number; width: number; height: number }
export interface AigcView { projectId: string; workspaceId: string; sessionId: string; reference: SessionReference; selected: boolean }
interface AigcReference { id: string; sessionId: string; text: string }
export interface AigcViewSnapshot { views: readonly AigcView[]; geometry: SurfaceProjection; errorCode?: string; interactionSessionId?: string; interactionId?: string; references: readonly AigcReference[] }
const same = (a: OwnedScope | null, b: OwnedScope | null) => a?.accountId === b?.accountId && a?.generation === b?.generation
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function rect(value: unknown): value is Rect {
  return object(value) && Object.keys(value).length === 4 && ['x', 'y', 'width', 'height'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 16384)
}
export class AigcViews {
  private scope: OwnedScope | null = null
  private lease: string | null = null
  private frame: Rect | null = null
  private surface: { rect: Rect; visible: boolean; sessionId: string } | null = null
  private revision = 0
  private readonly interactions = new Map<string, string>()
  private readonly references = new Map<string, AigcReference>()
  private readonly views = new Map<string, AigcView>()
  private readonly listeners = new Set<() => void>()
  private snapshot: AigcViewSnapshot = { views: [], geometry: { bounds: null, visible: false }, references: [] }
  constructor(private readonly retain: (id: string) => SessionReference) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(errorCode?: string) {
    const selected = [...this.views.values()].find(row => row.selected), source = this.surface, frame = this.frame
    let geometry: SurfaceProjection = { bounds: null, visible: false }
    if (this.lease && frame && source?.visible && source.sessionId === selected?.sessionId) {
      const width = Math.max(0, Math.min(source.rect.width, frame.width - source.rect.x)), height = Math.max(0, Math.min(source.rect.height, frame.height - source.rect.y))
      geometry = { bounds: { x: frame.x + source.rect.x, y: frame.y + source.rect.y, width, height }, visible: width > 0 && height > 0 }
    }
    const interaction = [...this.interactions].at(-1)
    this.snapshot = { views: [...this.views.values()], geometry, references: [...this.references.values()], ...(errorCode ? { errorCode } : {}), ...(interaction ? { interactionId: interaction[0], interactionSessionId: interaction[1] } : {}) }
    for (const listener of this.listeners) listener()
  }
  setFrame(value: Rect | null): void { this.frame = value; this.publish(this.snapshot.errorCode) }
  acknowledgeReference(id: string): void { this.references.delete(id); this.publish(this.snapshot.errorCode) }
  setScope(scope: OwnedScope | null, lease: string | null): void {
    if (!same(this.scope, scope)) {
      const old = [...this.views.values()]; this.views.clear(); this.interactions.clear(); this.references.clear(); this.revision = 0; this.surface = null
      this.scope = scope ? { ...scope } : null; this.lease = lease; this.publish()
      for (const view of old) view.reference.release()
    } else { if (this.lease !== lease) { this.surface = null; this.revision = 0; this.interactions.clear() }; this.lease = lease; this.publish(this.snapshot.errorCode) }
  }
  accept(value: unknown): boolean {
    if (!object(value) || !this.scope || !this.lease || value.lease !== this.lease || !object(value.scope) || value.scope.accountId !== this.scope.accountId || value.scope.generation !== this.scope.generation || !object(value.data)) return false
    const data = value.data
    if (value.kind === 'interaction') {
      if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.id) || typeof data.active !== 'boolean' || typeof data.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(data.sessionId) ||
        typeof data.projectId !== 'string' || !/^aigc-[a-f0-9]{48}$/.test(data.projectId) || typeof data.workspaceId !== 'string') return false
      const existing = this.views.get(data.sessionId)
      if (existing && (existing.projectId !== data.projectId || existing.workspaceId !== data.workspaceId)) return false
      if (data.active) {
        if ((!existing && this.views.size >= 128) || this.interactions.size >= 32) return false
        if (!existing) this.views.set(data.sessionId, { projectId: data.projectId, workspaceId: data.workspaceId, sessionId: data.sessionId, reference: this.retain(data.sessionId), selected: false })
        this.interactions.set(data.id, data.sessionId)
      } else this.interactions.delete(data.id)
      this.publish(this.snapshot.errorCode); return true
    }
    if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < this.revision) return false
    if (value.kind === 'reference') {
      if (value.revision !== this.revision || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.id) || typeof data.sessionId !== 'string' || !this.views.get(data.sessionId)?.selected || typeof data.text !== 'string' || data.text.length > 4 * 1024 * 1024 || this.references.size >= 32) return false
      if ([...this.references.values()].reduce((total, row) => total + row.text.length, 0) + data.text.length > 8 * 1024 * 1024) return false
      this.references.set(data.id, { id: data.id, sessionId: data.sessionId, text: data.text }); this.publish(this.snapshot.errorCode); return true
    }
    if (value.kind === 'surface') {
      if (value.revision !== this.revision || typeof data.sessionId !== 'string' || typeof data.visible !== 'boolean' || !rect(data.rect)) return false
      this.surface = { sessionId: data.sessionId, visible: data.visible, rect: data.rect }; this.publish(this.snapshot.errorCode); return true
    }
    if (value.kind === 'hide' || value.kind === 'selection-error') {
      this.revision = value.revision; this.surface = null
      for (const [key, row] of this.views) this.views.set(key, { ...row, selected: false })
      this.publish(value.kind === 'selection-error' ? 'AIGC_NATIVE_SESSION_UNAVAILABLE' : undefined); return true
    }
    if (value.kind !== 'selection' || typeof data.projectId !== 'string' || !/^aigc-[a-f0-9]{48}$/.test(data.projectId) || typeof data.workspaceId !== 'string' ||
      typeof data.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(data.sessionId)) return false
    const existing = this.views.get(data.sessionId)
    if (existing && (existing.projectId !== data.projectId || existing.workspaceId !== data.workspaceId)) return false
    if (!existing && this.views.size >= 128) { this.publish('AIGC_NATIVE_VIEW_LIMIT'); return false }
    this.revision = value.revision; this.surface = null
    const row: AigcView = existing ?? { projectId: data.projectId, workspaceId: data.workspaceId, sessionId: data.sessionId, reference: this.retain(data.sessionId), selected: true }
    this.views.set(row.sessionId, row)
    for (const [key, view] of this.views) this.views.set(key, { ...view, selected: key === row.sessionId })
    this.publish(); return true
  }
  dispose(): void { this.setScope(null, null); this.listeners.clear() }
}
