import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

export interface PromptRecord {
  id: string; title: string; body: string; revision: number; createdAt: string; updatedAt: string;
  owned: boolean; sourceId: string | null
}
export interface PromptHost { invoke(method: 'mine' | 'square' | 'save' | 'publish', args: readonly unknown[]): Promise<unknown> }
export interface PromptSnapshot {
  scope: string | null; items: readonly PromptRecord[]; publicItems: readonly PromptRecord[];
  busy: readonly string[]; error: string | null; failureKind: 'mine' | 'square' | 'save' | 'publish' | null; hasMore: boolean; squarePage: number; squareQuery: string
}
function empty(scope: string | null): PromptSnapshot { return { scope, items: [], publicItems: [], busy: [], error: null, failureKind: null, hasMore: false, squarePage: 0, squareQuery: '' } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
function parseRecord(value: unknown, privateRecord: boolean): PromptRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROMPT_RESPONSE_INVALID')
  const row = value as PromptRecord
  if (typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120 || typeof row.body !== 'string' || !row.body.trim() || new TextEncoder().encode(row.body).length > 65536 || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.owned !== 'boolean' || (row.sourceId !== null && (typeof row.sourceId !== 'string' || !uuid.test(row.sourceId))) || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt)) || (privateRecord && (!row.owned || row.sourceId !== row.id)) || (!row.owned && row.sourceId !== null)) throw new Error('PROMPT_RESPONSE_INVALID')
  return { id: row.id, title: row.title, body: row.body, revision: row.revision, owned: row.owned, sourceId: row.sourceId, createdAt: row.createdAt, updatedAt: row.updatedAt }
}
function parseRows(value: unknown, privateRecords: boolean): PromptRecord[] {
  if (!Array.isArray(value) || value.length > (privateRecords ? 500 : 50)) throw new Error('PROMPT_RESPONSE_INVALID')
  return value.map(row => parseRecord(row, privateRecords))
}

/** React-free projection; account generations own all pending responses and retry identities. */
export class PromptController {
  private readonly state = createSnapshotStore<PromptSnapshot>(empty(null))
  private generation = 0
  private squareGeneration = 0
  private privateRevision = 0
  private publicRevision = 0
  private readonly retries = new Map<string, string>()
  readonly getSnapshot = this.state.getSnapshot
  readonly subscribe = this.state.subscribe
  constructor(private readonly host: PromptHost | undefined) {}
  setScope(scope: string | null): void {
    if (this.getSnapshot().scope === scope) return
    ++this.generation; ++this.squareGeneration; this.retries.clear(); this.state.set(empty(scope))
  }
  async loadMine(): Promise<void> {
    const revision = this.privateRevision
    await this.run('mine', async () => {
      const rows = parseRows(await this.host!.invoke('mine', []), true)
      return () => { if (revision === this.privateRevision) this.update({ items: rows }) }
    })
  }
  async loadSquare(query = '', page = 1): Promise<void> {
    const sequence = ++this.squareGeneration
    const revision = this.publicRevision
    if (query !== this.getSnapshot().squareQuery) this.update({ squareQuery: query, squarePage: 0, hasMore: false, publicItems: [] })
    await this.run('square:' + sequence, async () => {
      const rows = parseRows(await this.host!.invoke('square', [query, page]), false)
      return () => {
        if (sequence !== this.squareGeneration || revision !== this.publicRevision) return
        const next = page === 1 ? rows : [...this.getSnapshot().publicItems.filter(row => !rows.some(item => item.id === row.id)), ...rows]
        this.update({ publicItems: next, hasMore: rows.length === 50, squarePage: page, squareQuery: query })
      }
    })
  }
  async save(input: { id: string; title: string; body: string; expectedRevision: number }): Promise<PromptRecord> {
    let result!: PromptRecord
    const key = 'save:' + JSON.stringify(input)
    const committed = await this.run('save', async () => {
      result = parseRecord(await this.host!.invoke('save', [{ ...input, requestId: this.requestId(key) }]), true)
      return () => { ++this.privateRevision; this.retries.delete(key); this.update({ items: [result, ...this.getSnapshot().items.filter(row => row.id !== result.id)] }) }
    })
    if (!committed) throw new Error('ACCOUNT_SCOPE_CHANGED')
    return result
  }
  async publish(row: PromptRecord): Promise<PromptRecord> {
    if (!row.owned || row.sourceId === null) throw new Error('PROMPT_NOT_FOUND')
    let result!: PromptRecord
    const key = 'publish:' + row.sourceId + ':' + row.revision
    const committed = await this.run('publish:' + row.sourceId, async () => {
      result = parseRecord(await this.host!.invoke('publish', [{ id: row.sourceId, expectedRevision: row.revision, requestId: this.requestId(key) }]), false)
      if (!result.owned || result.sourceId !== row.sourceId) throw new Error('PROMPT_RESPONSE_INVALID')
      return () => { ++this.publicRevision; this.retries.delete(key); this.update({ publicItems: [result, ...this.getSnapshot().publicItems.filter(item => item.id !== result.id)] }) }
    })
    if (!committed) throw new Error('ACCOUNT_SCOPE_CHANGED')
    return result
  }
  dispose(): void { this.setScope(null) }
  private requestId(key: string): string {
    let id = this.retries.get(key)
    if (!id) { id = randomUUID(); this.retries.set(key, id) }
    return id
  }
  private update(patch: Partial<PromptSnapshot>): void { this.state.set({ ...this.getSnapshot(), ...patch }) }
  private async run(key: string, operation: () => Promise<() => void>): Promise<boolean> {
    if (!this.host || !this.getSnapshot().scope) throw new Error('AUTH_REQUIRED')
    if (this.getSnapshot().busy.includes(key)) throw new Error('PROMPT_BUSY')
    const generation = this.generation
    this.update({ busy: [...this.getSnapshot().busy, key], error: null, failureKind: null })
    try {
      const commit = await operation()
      if (generation !== this.generation) return false
      commit()
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      const failureKind = key === 'mine' ? 'mine' : key === 'save' ? 'save' : key.startsWith('publish:') ? 'publish' : 'square'
      this.update({ error: error instanceof Error ? error.message : 'PROMPT_REQUEST_FAILED', failureKind })
      throw error
    } finally {
      if (generation === this.generation) this.update({ busy: this.getSnapshot().busy.filter(item => item !== key) })
    }
  }
}
