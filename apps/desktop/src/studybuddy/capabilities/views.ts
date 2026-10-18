import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target } from '@studybuddy/contracts'
export interface CanvasController {
  readonly id: string
  readonly owned?: boolean
  ready(): Promise<void>
  state(): Promise<{ canvasId: string; revision: number }>
  flush(): Promise<void>
  command?(name:'generationStatus'|'cancelGeneration',args:Record<string,string>,signal:AbortSignal):Promise<unknown>
  close(): Promise<void>
}
export interface CanvasLease {
  readonly controller: CanvasController
  state(): ReturnType<CanvasController['state']>
  release(): Promise<void>
}
interface Options { assert(caller: Caller): void; find(caller: Caller, target: Target): Promise<CanvasController | null>; create(caller: Caller, target: Target): Promise<CanvasController> }
interface Row { controller: Promise<CanvasController>; refs: number; drains: Set<() => void>; handoff?: Promise<void> }
const key = (caller: Caller, target: Target) => JSON.stringify([caller.scope, caller.hostGeneration, target])
/** One controller per account/document. Releases preserve common pages until an explicit handoff or logout. */
export class CapabilityCanvasViews {
  private readonly rows = new Map<string, Row>()
  private closing: Promise<void> | undefined
  constructor(private readonly options: Options) {}
  private assert(caller: Caller): void { if (this.closing) throw Error('CAPABILITY_VIEWS_CLOSED'); this.options.assert(caller) }
  async acquire(caller: Caller, target: Target): Promise<CanvasLease> {
    this.assert(caller)
    const id = key(caller, target)
    let row = this.rows.get(id)
    if (row?.handoff) { await row.handoff; return this.acquire(caller, target) }
    if (!row) {
      row = { controller: Promise.resolve(null as unknown as CanvasController), refs: 0, drains: new Set() }
      const owned = row
      row.controller = Promise.resolve().then(async () => {
        let controller:CanvasController|undefined
        try { controller = await this.options.find(caller, target) ?? await this.options.create(caller, target);await controller.ready(); this.assert(caller); return controller }
        catch (error) { try{await controller?.close()}finally{if (this.rows.get(id) === owned) this.rows.delete(id)}throw error }
      })
      this.rows.set(id, row)
    }
    row.refs++
    let released = false
    const release = async () => { if (released) return; released = true; if (--row!.refs === 0) { for (const done of row!.drains) done(); row!.drains.clear() } }
    try {
      const controller = await row.controller; this.assert(caller)
      return { controller, state: async () => { this.assert(caller); if (released) throw Error('CAPABILITY_CANVAS_LEASE_RELEASED'); const value = await controller.state(); this.assert(caller); return value }, release }
    } catch (error) { await release(); throw error }
  }
  async handoff(caller: Caller, target: Target, successorRef?: string): Promise<void> {
    this.assert(caller)
    const id = key(caller, target), row = this.rows.get(id)
    if (!row) return
    if (!row.handoff) row.handoff = Promise.resolve().then(async () => {
      const controller = await row.controller
      if(controller.owned===false){if(controller.id===successorRef)return;throw Error('AIGC_CANVAS_ALREADY_OPEN')}
      if (row.refs) await new Promise<void>(resolve => row.drains.add(resolve))
      try{this.assert(caller); await controller.flush(); this.assert(caller)}finally{await controller.close();if (this.rows.get(id) === row) this.rows.delete(id)}
    }).finally(()=>{delete row.handoff})
    return row.handoff
  }
  close(): Promise<void> {
    return this.closing ??= Promise.resolve().then(async () => {
      const rows = [...this.rows.values()]; this.rows.clear()
      await Promise.allSettled(rows.map(async row => { const controller = await row.controller; await controller.close() }))
    })
  }
  async revoke(): Promise<void> { const rows=[...this.rows.values()];this.rows.clear();await Promise.allSettled(rows.map(async row=>{const controller=await row.controller;await controller.close()})) }
}
