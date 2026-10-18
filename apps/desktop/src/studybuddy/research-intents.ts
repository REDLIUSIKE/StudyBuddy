/** Prepared prompts survive transport loss and existing native drafts. No acknowledgement executes a prompt. */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertResearchPath } from './research-resources.ts'
import { isResearchReference } from './research-actions.ts'
export interface ResearchIntent { id: string; projectId: string; sessionId: string; text: string; references: string[]; createdAt: string }
function valid(value: unknown): value is ResearchIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as ResearchIntent
  return Object.keys(value).length === 6 && typeof row.id === 'string' && /^[a-f0-9-]{36}$/.test(row.id) && typeof row.projectId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.projectId) &&
    typeof row.sessionId === 'string' && /^session-[a-f0-9-]{36}$/.test(row.sessionId) && typeof row.text === 'string' && !!row.text.trim() && row.text.length <= 131072 &&
    Array.isArray(row.references) && row.references.length <= 24 && row.references.every(isResearchReference) && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
}
/** Serialized account-owned storage; acknowledgement identifies one native intake. */
export class ResearchIntentStore {
  private chain: Promise<unknown> = Promise.resolve()
  private readonly file: string
  constructor(private readonly root: string, private readonly current: () => boolean) { this.file = join(root, 'prepared-prompts.json') }
  private assert(): void { if (!this.current()) throw Error('RESEARCH_SCOPE_REVOKED') }
  private serial<T>(run: () => Promise<T>): Promise<T> { const next = this.chain.catch(() => undefined).then(run); this.chain = next; return next }
  private async read(): Promise<ResearchIntent[]> {
    this.assert(); await assertResearchPath(this.file); this.assert()
    try {
      const stat = await lstat(this.file); if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('RESEARCH_INTENT_STORAGE_INVALID')
      const value: unknown = JSON.parse(await readFile(this.file, 'utf8')); this.assert()
      if (!Array.isArray(value) || value.length > 64 || !value.every(valid) || new Set(value.map(row => row.id)).size !== value.length) throw Error('RESEARCH_INTENT_STORAGE_INVALID')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return [] }
  }
  private async write(rows: ResearchIntent[]): Promise<void> {
    this.assert(); await assertResearchPath(this.root); await mkdir(this.root, { recursive: true }); this.assert()
    const content = JSON.stringify(rows) + '\n'; if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw Error('RESEARCH_INTENT_LIMIT_REACHED')
    const temporary = this.file + '.' + randomUUID() + '.tmp'
    try { await writeFile(temporary, content, { flag: 'wx', mode: 0o600 }); await assertResearchPath(this.file); this.assert(); await rename(temporary, this.file); this.assert() }
    finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }) }
  }
  /** Persist one explicit prepared prompt before notifying the native UI. */
  append(projectId: string, sessionId: string, text: string, references: string[]): Promise<ResearchIntent> { return this.serial(async () => {
    const intent = { id: randomUUID(), projectId, sessionId, text, references: [...references], createdAt: new Date().toISOString() }
    if (!valid(intent)) throw Error('RESEARCH_ACTION_INVALID')
    const rows = await this.read(); if (rows.length >= 64) throw Error('RESEARCH_INTENT_LIMIT_REACHED')
    rows.push(intent); await this.write(rows); return intent
  }) }
  /** Restore only prompts for one exact owned project and native Session. */
  list(projectId: string, sessionId: string): Promise<ResearchIntent[]> { return this.serial(async () => (await this.read()).filter(row => row.projectId === projectId && row.sessionId === sessionId)) }
  /** Remove an acknowledged intake; unknown identities cannot change storage. */
  acknowledge(id: string): Promise<void> { return this.serial(async () => {
    const rows = await this.read(); if (!rows.some(row => row.id === id)) throw Error('RESEARCH_INTENT_NOT_FOUND')
    await this.write(rows.filter(row => row.id !== id))
  }) }
}
