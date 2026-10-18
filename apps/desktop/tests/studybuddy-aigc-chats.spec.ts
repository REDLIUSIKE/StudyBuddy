import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { AigcChatStore } from '../src/studybuddy/aigc-chat-store.ts'

it('creates one durable native identity on concurrent project open and reuses an attributed legacy import', async () => {
  const project = await mkdtemp(join(tmpdir(), 'aigc-chats-'))
  const original = '{"type":"session","id":"old"}\n{"type":"message","message":{"role":"user","content":"original"}}\n'
  try {
    await mkdir(join(project, '.agent/sessions'), { recursive: true })
    await writeFile(join(project, '.agent/sessions/old.jsonl'), original)
    const first = new AigcChatStore(() => true), second = new AigcChatStore(() => true)
    const [a, b] = await Promise.all([first.get(project), second.get(project)])
    expect(a.selectedSessionId).toBe(b.selectedSessionId)
    const legacy = { file: 'old.jsonl', sha256: createHash('sha256').update(original).digest('hex') }
    const imported = await first.create(project, legacy)
    const reopened = await new AigcChatStore(() => true).create(project, legacy)
    expect(reopened.selectedSessionId).toBe(imported.selectedSessionId)
    expect(reopened.chats).toHaveLength(2)
    await expect(first.create(project, { ...legacy, sha256: 'b'.repeat(64) })).rejects.toThrow('AIGC_HISTORY_CHANGED')
    expect(await readFile(join(project, '.agent/sessions/old.jsonl'), 'utf8')).toBe(original)
    const changed = await first.create(project)
    expect(changed.chats).toHaveLength(3)
    await first.select(project, imported.selectedSessionId)
    expect((await new AigcChatStore(() => true).get(project)).selectedSessionId).toBe(imported.selectedSessionId)
  } finally { await rm(project, { recursive: true, force: true }) }
})

it('rejects revoked ownership and foreign project bindings without rewriting metadata', async () => {
  const project = await mkdtemp(join(tmpdir(), 'aigc-chats-fence-'))
  try {
    let current = true
    const store = new AigcChatStore(() => current)
    await store.get(project)
    const file = join(project, '.studybuddy-native.json'), before = await readFile(file, 'utf8')
    current = false
    await expect(store.create(project)).rejects.toThrow('AIGC_SCOPE_REVOKED')
    expect(await readFile(file, 'utf8')).toBe(before)
    const value = JSON.parse(before); value.directory = join(project, 'foreign')
    await writeFile(file, JSON.stringify(value))
    await expect(new AigcChatStore(() => true).get(project)).rejects.toThrow('AIGC_BINDING_CONFLICT')
  } finally { await rm(project, { recursive: true, force: true }) }
})
