/** Private immutable reports and paid-call receipts, never a conversation/workflow store. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, link, unlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import type { SkillSafetyActor, SkillSafetyReport, SkillSafetyReportId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'
import { parseSkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/wire'
import type { SkillSafetyCallStore, SkillSafetyCallRecord } from './skill-safety-text-consumer.ts'
import type { SkillScannerLlmResponse } from './skill-safety-transport.ts'
import { verifySkillScannerDirectoryPath } from './skill-safety-resources.ts'
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const responseSchema = z.object({ content: z.string().min(1).max(4 * 1024 * 1024), usage: z.object({ input_tokens: count, output_tokens: count, total_tokens: count }).strict() }).strict()
const callSchema = z.object({ requestId: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), modelIdentity: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
/** Atomic once-only records outside project/skill discovery; actor identity stays private. */
export class SkillSafetyRecords implements SkillSafetyCallStore {
  constructor(private readonly root: string, private readonly current: (actor: SkillSafetyActor) => boolean) {
    if (!isAbsolute(root)) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
  }
  private path(actor: SkillSafetyActor, kind: string, id: string): string { return join(this.root, createHash('sha256').update(JSON.stringify([actor, kind, id])).digest('hex') + '.json') }
  private check(actor: SkillSafetyActor): void { if (!this.current(actor)) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE') }
  private async readValue(actor: SkillSafetyActor, kind: string, id: string): Promise<unknown | undefined> {
    this.check(actor); await verifySkillScannerDirectoryPath(this.root, true)
    const path = this.path(actor, kind, id)
    let handle
    try {
      const before = await lstat(path)
      if (!before.isFile() || before.isSymbolicLink() || before.size > 8 * 1024 * 1024) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID')
      handle = await open(path, 'r'); const actual = await handle.stat()
      if (!actual.isFile() || actual.ino !== before.ino || actual.dev !== before.dev || actual.size !== before.size) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID')
      const value: unknown = JSON.parse(await handle.readFile('utf8')); this.check(actor); return value
    } catch (error) {
      this.check(actor)
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      if (error instanceof SkillSafetyError) throw error
      throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID', { cause: error })
    } finally { await handle?.close() }
  }
  private async writeOnce(actor: SkillSafetyActor, kind: string, id: string, value: unknown): Promise<boolean> {
    this.check(actor); await verifySkillScannerDirectoryPath(this.root, true); await mkdir(this.root, { recursive: true }); await verifySkillScannerDirectoryPath(this.root)
    const bytes = Buffer.from(JSON.stringify(value)), temporary = join(this.root, '.' + randomUUID() + '.tmp')
    if (bytes.length > 8 * 1024 * 1024) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
    const handle = await open(temporary, 'wx', 0o600)
    try {
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      this.check(actor)
      try { await link(temporary, this.path(actor, kind, id)) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false; throw error }
      this.check(actor); return true
    } finally { await unlink(temporary) }
  }
  /** Read a settled claim; an uncompleted claim remains an unknown charged outcome. */
  async read(actor: SkillSafetyActor, id: string): Promise<SkillSafetyCallRecord | undefined> {
    const value = await this.readValue(actor, 'call', id); if (value === undefined) return undefined
    const record = callSchema.parse(value), result = await this.readValue(actor, 'call-result', id)
    return { ...record, ...(result === undefined ? {} : { result: responseSchema.parse(result) }) }
  }
  /** Claim exactly once using an exclusive filesystem publication, including across Main restarts. */
  async claim(actor: SkillSafetyActor, id: string, value: SkillSafetyCallRecord): Promise<SkillSafetyCallRecord> {
    const record = callSchema.parse(value)
    await this.writeOnce(actor, 'call', id, record)
    const actual = await this.read(actor, id); if (!actual) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID')
    if (actual.fingerprint !== record.fingerprint || actual.modelIdentity !== record.modelIdentity) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
    return actual
  }
  /** Retain only a real terminal response; never recreate a lost model verdict. */
  async settle(actor: SkillSafetyActor, id: string, result: SkillScannerLlmResponse): Promise<void> {
    if (!await this.read(actor, id)) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID')
    const actual = responseSchema.parse(result)
    if (!await this.writeOnce(actor, 'call-result', id, actual) && JSON.stringify(await this.readValue(actor, 'call-result', id)) !== JSON.stringify(actual)) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
  }
  /** Persist the scanner's inert checked report, not assistant prose or a permission grant. */
  async saveReport(actor: SkillSafetyActor, value: SkillSafetyReport): Promise<void> {
    const parsed = parseSkillSafetyResult({ kind: 'report', value })
    if (!await this.writeOnce(actor, 'report', value.reportId, parsed)) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
  }
  /** Read the exact private report for its original live actor. */
  async readReport(actor: SkillSafetyActor, id: SkillSafetyReportId): Promise<SkillSafetyReport> {
    const value = parseSkillSafetyResult(await this.readValue(actor, 'report', id))
    if (value.kind !== 'report' || value.value.reportId !== id) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID')
    return value.value
  }
  /** Keep keyless source/model/terminal evidence in the private feedback-log plane. */
  async audit(actor: SkillSafetyActor, value: Readonly<Record<string, unknown>>): Promise<void> { await this.writeOnce(actor, 'audit', randomUUID(), value) }
}
