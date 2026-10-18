import { expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchIntentStore } from '../src/studybuddy/research-intents.ts'
it('retains a prepared workflow until the native composer acknowledges its exact identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-intents-'))
  try {
    const store = new ResearchIntentStore(root, () => true)
    const intent = await store.append('study', 'session-11111111-1111-4111-8111-111111111111', 'Review the supplied experiment.', ['study.csv'])
    expect(await new ResearchIntentStore(root, () => true).list('study', intent.sessionId)).toEqual([intent])
    await expect(store.acknowledge('22222222-2222-4222-8222-222222222222')).rejects.toThrow('RESEARCH_INTENT_NOT_FOUND')
    await store.acknowledge(intent.id); expect(await store.list('study', intent.sessionId)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('serializes pending workflow writes and fences revoked account data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-intents-')); let live = true
  try {
    const store = new ResearchIntentStore(root, () => live)
    await Promise.all([store.append('study', 'session-11111111-1111-4111-8111-111111111111', 'First', []), store.append('study', 'session-11111111-1111-4111-8111-111111111111', 'Second', [])])
    expect(await store.list('study', 'session-11111111-1111-4111-8111-111111111111')).toHaveLength(2)
    live = false; await expect(store.list('study', 'session-11111111-1111-4111-8111-111111111111')).rejects.toThrow('RESEARCH_SCOPE_REVOKED')
  } finally { await rm(root, { recursive: true, force: true }) }
})
