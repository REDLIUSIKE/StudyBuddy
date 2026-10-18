import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchChatStore } from '../src/studybuddy/research-chat-store.ts'
it('migrates the existing single Session without replacing its history identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  const original = 'session-11111111-1111-4111-8111-111111111111'
  try {
    await writeFile(file, JSON.stringify({ schemaVersion: 1, sessionId: original }))
    const store = new ResearchChatStore(() => true)
    expect((await store.get(file)).selectedSessionId).toBe(original)
    const created = await store.create(file)
    expect(created.chats.map(chat => chat.sessionId)).toContain(original)
    expect(created.selectedSessionId).not.toBe(original)
    const reopen = await new ResearchChatStore(() => true).get(file)
    expect(reopen).toEqual(created)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('serializes concurrent chat creation and rejects foreign selections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  try {
    const store = new ResearchChatStore(() => true)
    await store.get(file); await Promise.all([store.create(file), store.create(file)])
    const current = await store.get(file)
    expect(current.chats).toHaveLength(3); expect(new Set(current.chats.map(chat => chat.sessionId)).size).toBe(3)
    await expect(store.select(file, 'session-99999999-9999-4999-8999-999999999999')).rejects.toThrow('RESEARCH_CHAT_NOT_FOUND')
    expect(await store.get(file)).toEqual(current)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('closing the last tab leaves no selection or replacement and preserves history after reopening the store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  try {
    const store = new ResearchChatStore(() => true), first = await store.get(file), next = await store.close(file, first.selectedSessionId!)
    expect(next.chats).toEqual([{ sessionId: first.selectedSessionId, label: '研究对话 1', closed: true }])
    expect(next.selectedSessionId).toBeNull()
    expect(await new ResearchChatStore(() => true).get(file)).toEqual(next)
    const reopened = await store.select(file, first.selectedSessionId!)
    expect(reopened.chats).toEqual(first.chats); expect(reopened.selectedSessionId).toBe(first.selectedSessionId)
    await store.close(file, first.selectedSessionId!)
    const created = await store.create(file)
    expect(created.chats).toHaveLength(2); expect(created.chats[1]?.label).toBe('研究对话 2')
    expect(created.chats[1]?.sessionId).not.toBe(first.selectedSessionId)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('closing a background tab preserves selection, and closing the active tab selects an existing open tab', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  try {
    const store = new ResearchChatStore(() => true), first = await store.get(file), second = await store.create(file), third = await store.create(file)
    const background = await store.close(file, second.selectedSessionId!)
    expect(background.selectedSessionId).toBe(third.selectedSessionId); expect(background.chats).toHaveLength(3)
    const active = await store.close(file, third.selectedSessionId!)
    expect(active.selectedSessionId).toBe(first.selectedSessionId); expect(active.chats).toHaveLength(3)
    const last = await store.close(file, first.selectedSessionId!)
    expect(last.selectedSessionId).toBeNull(); expect(last.chats).toHaveLength(3)
    expect(last.chats.every(chat => chat.closed)).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('reads existing version-two tabs without rewriting them, then persists the empty selection as version three', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  const id = 'session-11111111-1111-4111-8111-111111111111', old = JSON.stringify({ schemaVersion: 2, selectedSessionId: id, chats: [{ sessionId: id, label: 'Original title', closed: false }] })
  try {
    await writeFile(file, old); const store = new ResearchChatStore(() => true)
    expect((await store.get(file)).selectedSessionId).toBe(id); expect(await readFile(file, 'utf8')).toBe(old)
    const closed = await store.close(file, id)
    expect(closed).toEqual({ schemaVersion: 3, selectedSessionId: null, chats: [{ sessionId: id, label: 'Original title', closed: true }] })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(closed)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it.each([
  { schemaVersion: 2, selectedSessionId: null, closed: true },
  { schemaVersion: '3', selectedSessionId: null, closed: true },
  { schemaVersion: 3, selectedSessionId: null, closed: false },
  { schemaVersion: 3, selectedSessionId: 'session-11111111-1111-4111-8111-111111111111', closed: true },
])('rejects inconsistent tab selection without changing its stored bytes: %j', async input => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  const bytes = JSON.stringify({ schemaVersion: input.schemaVersion, selectedSessionId: input.selectedSessionId, chats: [{ sessionId: 'session-11111111-1111-4111-8111-111111111111', label: 'Original title', closed: input.closed }] })
  try {
    await writeFile(file, bytes); await expect(new ResearchChatStore(() => true).get(file)).rejects.toThrow('RESEARCH_BINDING_INVALID')
    expect(await readFile(file, 'utf8')).toBe(bytes)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('refuses a revoked owner without writing a session manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-chats-')), file = join(root, '.studybuddy-native.json')
  try { await expect(new ResearchChatStore(() => false).get(file)).rejects.toThrow('RESEARCH_SCOPE_REVOKED'); await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' }) }
  finally { await rm(root, { recursive: true, force: true }) }
})
