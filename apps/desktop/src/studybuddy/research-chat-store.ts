/** Account-owned tab metadata references actual native Sessions; it stores no model credentials or transcripts. */
import { randomUUID } from 'node:crypto'
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { assertResearchPath } from './research-resources.ts'
export interface ResearchChat { sessionId: string; label: string; closed: boolean }
export interface ResearchChats { schemaVersion: 3; selectedSessionId: string | null; chats: ResearchChat[] }
const session = (value: unknown): value is string => typeof value === 'string' && /^session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
function parse(value: unknown): ResearchChats {
  if (!value || typeof value !== 'object') throw Error('RESEARCH_BINDING_INVALID')
  if ('schemaVersion' in value && value.schemaVersion === 1 && Object.keys(value).length === 2 && 'sessionId' in value && session(value.sessionId)) return parse({ schemaVersion: 2, selectedSessionId: value.sessionId, chats: [{ sessionId: value.sessionId, label: '研究对话 1', closed: false }] })
  if (!('schemaVersion' in value) || value.schemaVersion !== 2 && value.schemaVersion !== 3 || Object.keys(value).length !== 3 || !('selectedSessionId' in value) || !(session(value.selectedSessionId) || value.schemaVersion === 3 && value.selectedSessionId === null) || !('chats' in value) || !Array.isArray(value.chats) || !value.chats.length || value.chats.length > 1024) throw Error('RESEARCH_BINDING_INVALID')
  const chats: ResearchChat[] = value.chats.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 3 || !session(row.sessionId) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120 || typeof row.closed !== 'boolean') throw Error('RESEARCH_BINDING_INVALID')
    return { sessionId: row.sessionId, label: row.label, closed: row.closed }
  })
  if (new Set(chats.map(chat => chat.sessionId)).size !== chats.length || (value.selectedSessionId === null ? chats.some(chat => !chat.closed) : !chats.some(chat => chat.sessionId === value.selectedSessionId && !chat.closed))) throw Error('RESEARCH_BINDING_INVALID')
  return { schemaVersion: 3, selectedSessionId: value.selectedSessionId, chats }
}
/** Serialize mutations per manifest and fence every commit with the original account generation. */
export class ResearchChatStore {
  private readonly pending = new Map<string, Promise<unknown>>()
  constructor(private readonly current: () => boolean) {}
  private assert(): void { if (!this.current()) throw Error('RESEARCH_SCOPE_REVOKED') }
  private serial<T>(file: string, run: () => Promise<T>): Promise<T> {
    const task = (this.pending.get(file) ?? Promise.resolve()).catch(() => undefined).then(run)
    this.pending.set(file, task); void task.finally(() => { if (this.pending.get(file) === task) this.pending.delete(file) }).catch(() => {})
    return task
  }
  private async read(file: string): Promise<ResearchChats> {
    this.assert(); await assertResearchPath(file); this.assert()
    try {
      const stat = await lstat(file); if (!stat.isFile() || stat.size > 256 * 1024) throw Error('RESEARCH_BINDING_INVALID')
      const value = parse(JSON.parse(await readFile(file, 'utf8'))); this.assert(); return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const sessionId = 'session-' + randomUUID(); this.assert()
      try { await writeFile(file, JSON.stringify({ schemaVersion: 1, sessionId }) + '\n', { flag: 'wx', mode: 0o600 }) }
      catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError; return this.read(file) }
      this.assert(); return parse({ schemaVersion: 1, sessionId })
    }
  }
  private async write(file: string, value: ResearchChats): Promise<void> {
    parse(value); this.assert(); await assertResearchPath(file); this.assert()
    const temporary = file + '.' + randomUUID() + '.tmp'
    try { await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); await assertResearchPath(file); this.assert(); await rename(temporary, file); this.assert() }
    finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }) }
  }
  /** Get the persistent selected identity, creating the first manifest only when absent. */
  get(file: string): Promise<ResearchChats> { return this.serial(file, () => this.read(file)) }
  private append(value: ResearchChats): void {
    if (value.chats.length >= 1024) throw Error('RESEARCH_CHAT_LIMIT_REACHED')
    const chat = { sessionId: 'session-' + randomUUID(), label: `研究对话 ${value.chats.length + 1}`, closed: false }
    value.chats.push(chat); value.selectedSessionId = chat.sessionId
  }
  /** Create a new tab identity, without prompting or changing a model selection. */
  create(file: string): Promise<ResearchChats> { return this.serial(file, async () => { const value = await this.read(file); this.append(value); await this.write(file, value); return value }) }
  /** Select only a Session already recorded in this project's owned manifest. */
  select(file: string, sessionId: string): Promise<ResearchChats> { return this.serial(file, async () => {
    const value = await this.read(file), chat = value.chats.find(chat => chat.sessionId === sessionId)
    if (!chat) throw Error('RESEARCH_CHAT_NOT_FOUND')
    chat.closed = false; value.selectedSessionId = sessionId; await this.write(file, value); return value
  }) }
  /** Hide a tab and retain its history; the last close leaves no active Session. */
  close(file: string, sessionId: string): Promise<ResearchChats> { return this.serial(file, async () => {
    const value = await this.read(file), chat = value.chats.find(row => row.sessionId === sessionId && !row.closed)
    if (!chat) throw Error('RESEARCH_CHAT_NOT_FOUND'); chat.closed = true
    if (sessionId === value.selectedSessionId) value.selectedSessionId = value.chats.find(row => !row.closed)?.sessionId ?? null
    await this.write(file, value); return value
  }) }
}
