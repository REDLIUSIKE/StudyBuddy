import type { CapabilityAdapter } from './types.ts'

/** Contributions are explicit module adapters; removal invalidates all consumers. */
export class CapabilityRegistry {
  private readonly entries = new Map<string, { adapter: CapabilityAdapter; revision: string }>()
  private readonly listeners = new Set<(id: string) => void | Promise<void>>()
  register(adapter: CapabilityAdapter): () => Promise<void> {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(adapter.id) || !/^[a-f0-9]{64}$/.test(adapter.revision)
      || ['describe', 'listProjects', 'bind', 'tools', 'execute', 'status', 'cancel', 'release'].some(key => typeof Reflect.get(adapter, key) !== 'function')) throw Error('CAPABILITY_MODULE_INVALID')
    if (this.entries.has(adapter.id)) throw Error('CAPABILITY_MODULE_CONFLICT')
    const id = adapter.id, entry = { adapter, revision: adapter.revision }
    this.entries.set(id, entry)
    return async () => {
      if (this.entries.get(id) !== entry) return
      this.entries.delete(id)
      const pending:Promise<void>[]=[]
      for (const listener of this.listeners)try{pending.push(Promise.resolve(listener(id)))}catch(error){pending.push(Promise.reject(error))}
      const results=await Promise.allSettled(pending),failed=results.find(row=>row.status==='rejected');if(failed?.status==='rejected')throw failed.reason
    }
  }
  get(id: string, revision?: string): CapabilityAdapter {
    const entry = this.entries.get(id)
    if (!entry) throw Error('CAPABILITY_MODULE_UNAVAILABLE')
    if (entry.adapter.id !== id || entry.adapter.revision !== entry.revision || revision !== undefined && entry.revision !== revision) throw Error('CAPABILITY_MODULE_CHANGED')
    return entry.adapter
  }
  ids(): readonly string[] { return [...this.entries.keys()] }
  onRemove(listener: (id: string) => void | Promise<void>): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
}
