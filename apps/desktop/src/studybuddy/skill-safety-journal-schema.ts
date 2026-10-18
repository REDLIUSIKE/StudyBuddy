/** Strict private effect records, without conversational workflow state. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SkillSafetyArtifactId, SkillSafetyCandidateId, SkillSafetyJobId, SkillSafetyOperationId, SkillSafetyReportId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'

const id = z.string().min(1).max(256)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const jobId = id.transform(value => brandString<SkillSafetyJobId>(value))
const requestId = id.transform(value => brandString<SkillSafetyRequestId>(value))
const sessionId = id.transform(value => brandString<SessionId>(value))
const severity = z.enum(['none', 'info', 'low', 'medium', 'high', 'critical'])
const failure = z.object({ code: id, action: z.enum(['retry', 'choose-source', 'choose-model', 'cancel', 'contact-support']) }).strict()
const candidate = z.object({
  candidateId: id.transform(value => brandString<SkillSafetyCandidateId>(value)),
  kind: z.enum(['installed', 'github']), displayName: id, purpose: z.string().max(2048), sourceLabel: id, sourceUrl: z.string().max(2048).optional(),
}).strict()
/** Bounded keyless operation outcomes decoded at durable/process boundaries. */
export const skillSafetyResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scanner-ready'), value: z.object({ status: z.literal('ready'), target: z.literal('win32-x64'), scannerVersion: z.literal('2.2.2'), manifestSha256: digest }).strict() }).strict(),
  z.object({ kind: z.literal('candidates'), value: z.object({ jobId, status: z.enum(['matches', 'no-match', 'incomplete', 'failed']), candidates: z.array(candidate).max(1000), failure: failure.optional() }).strict() }).strict(),
  z.object({ kind: z.literal('report'), value: z.object({
    reportId: id.transform(value => brandString<SkillSafetyReportId>(value)),
    artifactId: id.transform(value => brandString<SkillSafetyArtifactId>(value)), artifactDigest: digest, configDigest: digest,
    scannerIdentity: id, modelIdentity: id, status: z.enum(['complete', 'partial', 'failed', 'cancelled']),
    findings: z.array(z.object({ ruleId: id, severity, originalSeverity: id, title: z.string().max(8192), evidence: z.string().max(1024 * 1024), relativePath: z.string().max(32768).optional(), original: z.record(z.string(), z.unknown()).optional() }).strict()).max(10000),
    maxSeverity: severity, eligible: z.boolean(), reviewRequired: z.boolean(), failure: failure.optional(),
  }).strict() }).strict(),
  z.object({ kind: z.literal('receipt'), value: z.object({
    operationId: id.transform(value => brandString<SkillSafetyOperationId>(value)), jobId,
    status: z.enum(['installed', 'conflict', 'unknown']), writesManifestDigest: digest, readbackDigest: digest.optional(),
  }).strict() }).strict(),
])
const record = z.object({
  generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  requestId, operation: z.enum(['find', 'prepare-scanner', 'scan', 'install']), argumentDigest: digest,
  status: z.enum(['pending', 'done', 'unknown']), result: skillSafetyResultSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.status === 'done') !== (value.result !== undefined)) ctx.addIssue({ code: 'custom', message: 'settlement mismatch' })
  if (value.result !== undefined && value.result.kind !== ({ find: 'candidates', 'prepare-scanner': 'scanner-ready', scan: 'report', install: 'receipt' }[value.operation])) ctx.addIssue({ code: 'custom', message: 'operation result mismatch' })
})
/** Version two is used only in the feature's private root, never Session data. */
export const skillSafetyJournalSchema = z.object({
  version: z.literal(2), accountId: id, sessionId, requests: z.record(requestId, record),
}).strict().superRefine((document, ctx) => {
  for (const [key, value] of Object.entries(document.requests)) if (key !== value.requestId) ctx.addIssue({ code: 'custom', message: 'request identity mismatch' })
})
/** Fully validated private document. */
export type SkillSafetyJournalDocument = z.infer<typeof skillSafetyJournalSchema>
