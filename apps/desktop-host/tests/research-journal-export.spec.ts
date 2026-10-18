import { expect, it } from 'vitest'
import { nativeJournalPage } from '../src/research-journal-export.ts'
const events = [{ seq: 0, time: 10, type: 'user/message', data: { text: '研究😀'.repeat(40000) } }, { seq: 1, time: 11, type: 'assistant/message', data: { text: 'Recorded response' } }]
const session = { id: 'session-a', header: { cwd: 'C:/admitted-project', version: 1 }, snapshotEvents: () => events }
it('exports complete Unicode journal bytes in bounded pages under one snapshot watermark', () => {
  const chunks: Buffer[] = []; let cursor = { seq: -1, offset: 0 }; let endSeq: number | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const page = nativeJournalPage(session as never, { cursor, endSeq }); endSeq = page.endSeq
    const bytes = Buffer.from(page.dataBase64, 'base64'); chunks.push(bytes); expect(bytes.length).toBeLessThanOrEqual(192 * 1024)
    if (!page.next) break; cursor = page.next
  }
  const lines = Buffer.concat(chunks).toString('utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(lines[0]).toMatchObject({ type: 'native-session/header', nativeSessionId: 'session-a' })
  expect(lines.slice(1)).toEqual(events)
})
it('does not extend a continued export when new events arrive and rejects malformed cursors', () => {
  const first = nativeJournalPage(session as never, { cursor: { seq: -1, offset: 0 }, endSeq: null })
  events.push({ seq: 2, time: 12, type: 'user/message', data: { text: 'Later message' } })
  const next = nativeJournalPage(session as never, { cursor: first.next!, endSeq: first.endSeq })
  expect(next.endSeq).toBe(1)
  expect(() => nativeJournalPage(session as never, { cursor: { seq: 99, offset: 0 }, endSeq: 1 })).toThrow('HARNESS_RESEARCH_EXPORT_INVALID')
})
