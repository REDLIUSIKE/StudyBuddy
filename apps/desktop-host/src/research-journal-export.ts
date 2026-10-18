/** Bounded pages preserve canonical native Session events without excerpting payloads. */
import { createHash } from 'node:crypto'
import type { Session } from '@deepseek-ai/dsh-session'
export interface NativeJournalCursor { seq: number; offset: number }
export function nativeJournalPage(session: Pick<Session,'id'|'header'|'snapshotEvents'>, input: unknown): {
  nativeSessionId: string; endSeq: number; dataBase64: string; sha256: string; next?: NativeJournalCursor
} {
  const invalid = (): never => { throw Error('HARNESS_RESEARCH_EXPORT_INVALID') }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 || !('cursor' in input) || !('endSeq' in input)) return invalid()
  const cursor = input.cursor
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || Object.keys(cursor).length !== 2 || !('seq' in cursor) || !('offset' in cursor) ||
    !Number.isSafeInteger(cursor.seq) || Number(cursor.seq) < -1 || !Number.isSafeInteger(cursor.offset) || Number(cursor.offset) < 0) return invalid()
  const events = session.snapshotEvents(), latest = Number(events.at(-1)?.seq ?? -1)
  const endSeq = input.endSeq === null ? latest : input.endSeq
  if (!Number.isSafeInteger(endSeq) || Number(endSeq) < -1 || Number(endSeq) > latest || Number(cursor.seq) > Number(endSeq) + 1 || (Number(cursor.seq) === Number(endSeq) + 1 && Number(cursor.offset) !== 0)) return invalid()
  let seq = Number(cursor.seq), offset = Number(cursor.offset), remaining = 192 * 1024
  const chunks: Buffer[] = []
  while ((seq === -1 || seq <= Number(endSeq)) && remaining > 0) {
    const record = seq === -1 ? { type: 'native-session/header', schemaVersion: 1, nativeSessionId: session.id, header: session.header } : events[seq]
    if (!record || (seq >= 0 && !('seq' in record && Number(record.seq) === seq))) return invalid()
    const bytes = Buffer.from(JSON.stringify(record) + '\n', 'utf8'); if (offset >= bytes.length) return invalid()
    const count = Math.min(bytes.length - offset, remaining); chunks.push(bytes.subarray(offset, offset + count)); remaining -= count; offset += count
    if (offset === bytes.length) { ++seq; offset = 0 }
  }
  const bytes = Buffer.concat(chunks)
  return { nativeSessionId: session.id, endSeq: Number(endSeq), dataBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'),
    ...(seq <= Number(endSeq) ? { next: { seq, offset } } : {}) }
}
