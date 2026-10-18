/** Atomic additive native associations. Original Pi histories are never written by this store. */
import { randomUUID } from 'node:crypto'
import { link, lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { assertAigcPath } from './aigc-resources.ts'

export interface AigcLegacySource { file: string; sha256: string }
export interface AigcChat { sessionId: string; label: string; closed: boolean; legacy?: AigcLegacySource }
export interface AigcChats { schemaVersion: 1; directory: string; selectedSessionId: string; chats: AigcChat[] }
const session = (value: unknown): value is string => typeof value === 'string' && /^session-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
function source(value: unknown): AigcLegacySource {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2 || !('file' in value) || typeof value.file !== 'string' || !/^[\w-]{1,200}\.jsonl$/.test(value.file)
    || !('sha256' in value) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) throw Error('AIGC_HISTORY_INVALID')
  return { file: value.file, sha256: value.sha256 }
}
function parse(value: unknown, directory: string): AigcChats {
  if (!value || typeof value !== 'object' || !('directory' in value) || value.directory !== directory) throw Error('AIGC_BINDING_CONFLICT')
  if (Object.keys(value).length !== 4 || !('schemaVersion' in value) || value.schemaVersion !== 1 || !('selectedSessionId' in value) || !session(value.selectedSessionId)
    || !('chats' in value) || !Array.isArray(value.chats) || !value.chats.length || value.chats.length > 1024) throw Error('AIGC_BINDING_INVALID')
  const chats: AigcChat[] = value.chats.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['sessionId', 'label', 'closed', 'legacy'].includes(key)) || !session(row.sessionId)
      || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 200 || typeof row.closed !== 'boolean') throw Error('AIGC_BINDING_INVALID')
    return { sessionId: row.sessionId, label: row.label, closed: row.closed, ...(row.legacy === undefined ? {} : { legacy: source(row.legacy) }) }
  })
  if (new Set(chats.map(row => row.sessionId)).size !== chats.length || !chats.some(row => row.sessionId === value.selectedSessionId && !row.closed)
    || new Set(chats.flatMap(row => row.legacy ? [row.legacy.file] : [])).size !== chats.filter(row => row.legacy).length) throw Error('AIGC_BINDING_INVALID')
  return { schemaVersion: 1, directory, selectedSessionId: value.selectedSessionId, chats }
}

export class AigcChatStore {
  private readonly pending = new Map<string, Promise<unknown>>()
  constructor(private readonly current: () => boolean) {}
  private assert() { if (!this.current()) throw Error('AIGC_SCOPE_REVOKED') }
  private async root(directory: string): Promise<string> {
    this.assert(); if (!isAbsolute(directory)) throw Error('AIGC_PROJECT_INVALID')
    await assertAigcPath(directory); const root = await realpath(directory)
    if (!(await lstat(root)).isDirectory()) throw Error('AIGC_PROJECT_INVALID')
    this.assert(); return root
  }
  private async serial<T>(directory: string, run: (root: string) => Promise<T>): Promise<T> {
    const root = await this.root(directory), task = (this.pending.get(root) ?? Promise.resolve()).catch(() => {}).then(() => { this.assert(); return run(root) })
    this.pending.set(root, task)
    try { return await task } finally { if (this.pending.get(root) === task) this.pending.delete(root) }
  }
  private append(value: AigcChats, legacy?: AigcLegacySource): void {
    if (value.chats.length >= 1024) throw Error('AIGC_CHAT_LIMIT_REACHED')
    const chat: AigcChat = { sessionId: 'session-' + randomUUID(), label: legacy ? legacy.file.slice(0, -6) : `创作对话 ${value.chats.length + 1}`, closed: false,
      ...(legacy ? { legacy } : {}) }
    value.chats.push(chat); value.selectedSessionId = chat.sessionId
  }
  private async publish(directory: string, value: AigcChats, exclusive = false): Promise<void> {
    parse(value, directory); this.assert()
    const file = join(directory, '.studybuddy-native.json'), temporary = file + '.' + randomUUID() + '.tmp'
    await assertAigcPath(file); this.assert()
    try {
      await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 })
      await assertAigcPath(file); this.assert()
      if (exclusive) await link(temporary, file)
      else await rename(temporary, file)
      this.assert()
    } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }) }
  }
  private async read(directory: string): Promise<AigcChats> {
    const file = join(directory, '.studybuddy-native.json')
    this.assert(); await assertAigcPath(file)
    try {
      const stat = await lstat(file); if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('AIGC_BINDING_INVALID')
      const value = parse(JSON.parse(await readFile(file, 'utf8')), directory); this.assert(); return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const value: AigcChats = { schemaVersion: 1, directory, selectedSessionId: '', chats: [] }; this.append(value)
      try { await this.publish(directory, value, true); return value }
      catch (conflict) { if ((conflict as NodeJS.ErrnoException).code !== 'EEXIST') throw conflict; return this.read(directory) }
    }
  }
  get(directory: string): Promise<AigcChats> { return this.serial(directory, root => this.read(root)) }
  create(directory: string, legacy?: AigcLegacySource): Promise<AigcChats> {
    if (legacy) legacy = source(legacy)
    return this.serial(directory, async root => {
      const value = await this.read(root), previous = legacy && value.chats.find(row => row.legacy?.file === legacy.file)
      if (previous) {
        if (previous.legacy?.sha256 !== legacy!.sha256) throw Error('AIGC_HISTORY_CHANGED')
        previous.closed = false; value.selectedSessionId = previous.sessionId
      } else this.append(value, legacy)
      await this.publish(root, value); return value
    })
  }
  select(directory: string, sessionId: string): Promise<AigcChats> { return this.serial(directory, async root => {
    const value = await this.read(root), chat = value.chats.find(row => row.sessionId === sessionId)
    if (!chat) throw Error('AIGC_CHAT_NOT_FOUND')
    chat.closed = false; value.selectedSessionId = chat.sessionId; await this.publish(root, value); return value
  }) }
  rename(directory: string, sessionId: string, label: string): Promise<AigcChats> { return this.serial(directory, async root => {
    if (!label.trim() || label.length > 200) throw Error('AIGC_CHAT_NAME_INVALID')
    const value = await this.read(root), chat = value.chats.find(row => row.sessionId === sessionId)
    if (!chat) throw Error('AIGC_CHAT_NOT_FOUND')
    chat.label = label.trim(); await this.publish(root, value); return value
  }) }
  close(directory: string, sessionId: string): Promise<AigcChats> { return this.serial(directory, async root => {
    const value = await this.read(root), chat = value.chats.find(row => row.sessionId === sessionId && !row.closed)
    if (!chat) throw Error('AIGC_CHAT_NOT_FOUND')
    chat.closed = true
    if (value.selectedSessionId === sessionId) {
      const next = value.chats.find(row => !row.closed)
      if (next) value.selectedSessionId = next.sessionId; else this.append(value)
    }
    await this.publish(root, value); return value
  }) }
}
