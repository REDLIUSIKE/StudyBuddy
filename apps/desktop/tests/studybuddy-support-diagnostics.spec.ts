import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseClientLogEvent, type OwnedScope } from '@studybuddy/contracts'
import type { SupportDiagnostics, SupportDiagnosticsDeps } from '../src/studybuddy/support-diagnostics.ts'
const module = existsSync(fileURLToPath(new URL('../src/studybuddy/support-diagnostics.ts', import.meta.url)))
  ? await import('../src/studybuddy/support-diagnostics.ts') : {}
function create(deps: SupportDiagnosticsDeps): SupportDiagnostics {
  const factory: unknown = Reflect.get(module, 'createSupportDiagnostics')
  expect(factory, 'controlled diagnostic adapter must be installed').toBeTypeOf('function')
  if (typeof factory !== 'function') throw new Error('missing adapter')
  return Reflect.apply(factory, undefined, [deps])
}
const a: OwnedScope = { accountId: '123e4567-e89b-42d3-a456-426614174001', generation: 1 }
const b: OwnedScope = { accountId: '123e4567-e89b-42d3-a456-426614174002', generation: 2 }
const metadata = { appVersion: '0.1.32', buildNumber: 'dev', platform: 'windows', architecture: 'x64',
  sessionId: '123e4567-e89b-42d3-a456-426614174003' } as const
const event = { source: 'desktop_main', eventName: 'harness_authenticated', outcome: 'succeeded' } as const
describe('owned Harness diagnostics', () => {
  it('uses existing client-event fields and authoritative metadata, not another log format', async () => {
    const sent: unknown[] = []
    const diagnostics = create({ metadata, readScope: () => a, now: () => new Date('2026-10-12T00:00:00.000Z'),
      transport: async (scope, batch) => { expect(scope).toEqual(a); sent.push(batch); batch.events.forEach((row) => {
        const parsed = parseClientLogEvent(row); expect(parsed.sessionId).toBe(metadata.sessionId)
        expect(parsed.fields).toEqual({}); expect(parsed.occurredAt).toBe('2026-10-12T00:00:00.000Z')
      }); return { recorded: batch.events.length, duplicates: 0 } } })
    diagnostics.record(event); await diagnostics.flush(); expect(sent).toHaveLength(1)
    expect(diagnostics.coverage().find(row => row.source === 'desktop_main')?.state).toBe('present')
    expect(diagnostics.coverage().find(row => row.source === 'skills')?.state).toBe('unavailable')
  })
  it('does not upload unattributed events or accept mixed-owner source records', async () => {
    let owner: OwnedScope | undefined = undefined
    const sent: unknown[] = []
    const diagnostics = create({ metadata, readScope: () => owner, transport: async (_, batch) => {
      sent.push(batch); return { recorded: batch.events.length, duplicates: 0 }
    }, readers: { desktop_main: async () => [{ scope: a, event }, { scope: b, event }] } })
    diagnostics.record(event); await diagnostics.flush(); expect(sent).toEqual([])
    owner = a; await diagnostics.collect(); await diagnostics.flush(); expect(sent).toEqual([])
    expect(diagnostics.coverage().find(row => row.source === 'desktop_main')?.state).toBe('failed')
  })
  it.each(['message', 'prompt', 'path', 'accountId', 'apiKey'])('rejects extra %s in structured-source rows', async (field) => {
    const sent: unknown[] = []
    const diagnostics = create({ metadata, readScope: () => a, transport: async (_, batch) => {
      sent.push(batch); return { recorded: batch.events.length, duplicates: 0 }
    }, readers: { desktop_main: async () => [{ scope: a, event: { ...event, [field]: 'private sentinel' } }] } })
    await diagnostics.collect(); await diagnostics.flush(); expect(sent).toEqual([])
    expect(diagnostics.coverage().find(row => row.source === 'desktop_main')?.state).toBe('failed')
  })
  it('drops stale collection and transport completions after an owner changes', async () => {
    let owner = a; let release: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const diagnostics = create({ metadata, readScope: () => owner, transport: async (_, batch) => {
      await waiting; return { recorded: batch.events.length, duplicates: 0 }
    } })
    diagnostics.record(event); const flushing = diagnostics.flush(); owner = b; diagnostics.revoke(); release?.(); await flushing
    expect(diagnostics.coverage().every(row => row.state === 'unavailable')).toBe(true)
    diagnostics.dispose(); diagnostics.record(event); await diagnostics.flush()
  })
  it('deduplicates confirmed events and respects the existing bounded batch', async () => {
    const batches: number[] = []
    const diagnostics = create({ metadata, readScope: () => a, now: () => new Date('2026-10-12T00:00:00.000Z'),
      transport: async (_, batch) => { batches.push(batch.events.length); return { recorded: batch.events.length, duplicates: 0 } } })
    diagnostics.record(event); await diagnostics.flush(); diagnostics.record(event); await diagnostics.flush(); expect(batches).toEqual([1])
    for (let attempt = 0; attempt < 300; attempt++) diagnostics.record({ ...event, fields: { attempt } })
    await diagnostics.flush(); expect(batches.slice(1)).toEqual([256])
    expect(diagnostics.coverage().find(row => row.source === 'desktop_main')?.state).toBe('failed')
  })
})
