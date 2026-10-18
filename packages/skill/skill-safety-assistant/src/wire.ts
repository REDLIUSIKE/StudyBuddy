/** Closed, bounded private Host–Main messages; no live Agent, path or credential. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyRequestId, SkillSafetyJobId, SkillSafetyCandidateId, SkillSafetyReportId, SkillSafetyArtifactId, SkillSafetyOperationId, SkillSafetyResult } from './types.ts'
import type { SkillSafetyPreparedOperation } from './provider.ts'
import { SkillSafetyError } from './errors.ts'
const id = z.string().min(1).max(256).regex(/^[^\p{Cc}]+$/u)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const requestId = id.transform(value => brandString<SkillSafetyRequestId>(value))
const intentId = id.transform(value => brandString<SkillSafetyIntentId>(value))
const actor = z.object({ accountId: id, generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), sessionId: id.transform(value => brandString<SessionId>(value)) }).strict()
const command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('find'), requestId, query: z.string().trim().min(1).max(2048) }).strict(),
  z.object({ kind: z.literal('prepare-scanner'), requestId }).strict(),
  z.object({ kind: z.literal('scan'), requestId, jobId: id.transform(value => brandString<SkillSafetyJobId>(value)), candidateId: id.transform(value => brandString<SkillSafetyCandidateId>(value)) }).strict(),
  z.object({ kind: z.literal('install'), requestId, reportId: id.transform(value => brandString<SkillSafetyReportId>(value)) }).strict(),
])
const question = z.object({ id, header: z.string().max(64).optional(), question: z.string().min(1).max(4096),
  options: z.array(z.object({ label: z.string().min(1).max(128) }).strict()).min(2).max(2),
}).strict()
const prepared = z.object({ intentId, requestId, argumentDigest: digest, question: question.optional() }).strict()
const answer = z.object({ answers: z.array(z.object({ id, selected: z.array(z.string().max(128)).max(2), custom: z.string().max(4096).optional() }).strict()).max(1) }).strict()
const context = z.object({ hostGeneration: id, actor }).strict()
const operation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preflight'), command }).strict(),
  z.object({ kind: z.literal('execute'), prepared, answer: answer.optional() }).strict(),
  z.object({ kind: z.literal('release'), prepared }).strict(),
])
const invocation = z.object({ rpcId: z.string().uuid(), context, operation }).strict()
const severity = z.enum(['none', 'info', 'low', 'medium', 'high', 'critical'])
const failure = z.object({ code: id, action: z.enum(['retry', 'choose-source', 'choose-model', 'cancel', 'contact-support']) }).strict()
/** One strict decoder for durable records and private process results. */
export const skillSafetyResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scanner-ready'), value: z.object({ status: z.literal('ready'), target: z.literal('win32-x64'), scannerVersion: z.literal('2.2.2'), manifestSha256: digest }).strict() }).strict(),
  z.object({ kind: z.literal('candidates'), value: z.object({ jobId: id.transform(value => brandString<SkillSafetyJobId>(value)), status: z.enum(['matches', 'no-match', 'incomplete', 'failed']),
    candidates: z.array(z.object({ candidateId: id.transform(value => brandString<SkillSafetyCandidateId>(value)), kind: z.enum(['installed', 'github']), displayName: id, purpose: z.string().max(2048), sourceLabel: id, sourceUrl: z.string().max(2048).optional() }).strict()).max(1000), failure: failure.optional() }).strict() }).strict(),
  z.object({ kind: z.literal('report'), value: z.object({ reportId: id.transform(value => brandString<SkillSafetyReportId>(value)), artifactId: id.transform(value => brandString<SkillSafetyArtifactId>(value)), artifactDigest: digest, configDigest: digest,
    scannerIdentity: id, modelIdentity: id, status: z.enum(['complete', 'partial', 'failed', 'cancelled']), findings: z.array(z.object({ ruleId: id, severity, originalSeverity: id, title: z.string().max(8192), evidence: z.string().max(1024 * 1024), relativePath: z.string().max(32768).optional(), original: z.record(z.string(), z.unknown()).optional() }).strict()).max(10000), maxSeverity: severity, eligible: z.boolean(), reviewRequired: z.boolean(), failure: failure.optional() }).strict() }).strict(),
  z.object({ kind: z.literal('receipt'), value: z.object({ operationId: id.transform(value => brandString<SkillSafetyOperationId>(value)), jobId: id.transform(value => brandString<SkillSafetyJobId>(value)), status: z.enum(['installed', 'conflict', 'unknown']), writesManifestDigest: digest, readbackDigest: digest.optional() }).strict() }).strict(),
])
/** Exact private invocation projection. */
export type SkillSafetyWireInvocation = z.infer<typeof invocation>
/** Private admitted actor and current native Host generation. */
export type SkillSafetyWireContext = z.infer<typeof context>
/** Operations accepted only from the private live Host. */
export type SkillSafetyWireOperation = z.infer<typeof operation>
function decode<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID')
  return parsed.data
}
/** Decode the private native actor, never model arguments. @param value - Bounded IPC value. */
export function parseSkillSafetyActor(value: unknown): SkillSafetyActor { return decode(actor, value) }
/** Decode one closed command. @param value - Tool/IPC data with no extra fields. */
export function parseSkillSafetyCommand(value: unknown): SkillSafetyCommand { return decode(command, value) }
/** Decode the private prepared projection. @param value - Main reply. */
export function parseSkillSafetyPrepared(value: unknown): SkillSafetyPreparedOperation {
  const parsed = decode(prepared, value)
  const notice = parsed.question
  return { intentId: parsed.intentId, requestId: parsed.requestId, argumentDigest: parsed.argumentDigest,
    ...(notice === undefined ? {} : { question: { id: notice.id, question: notice.question, options: notice.options, ...(notice.header === undefined ? {} : { header: notice.header }) } }) }
}
/** Decode one private Host message. @param value - Native child IPC data. */
export function parseSkillSafetyInvocation(value: unknown): SkillSafetyWireInvocation { return decode(invocation, value) }
/** Decode a scope-bound cancellation context. @param value - Native child IPC data. */
export function parseSkillSafetyContext(value: unknown): SkillSafetyWireContext { return decode(context, value) }
/** Decode actual effects without unknown extra fields. @param value - Main result. */
export function parseSkillSafetyResult(value: unknown): SkillSafetyResult { return decode(skillSafetyResultSchema, value) }
