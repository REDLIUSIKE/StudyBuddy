import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { toNamespacedPath } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SkillSafetyArtifactId, SkillSafetyJobId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import { SkillSafetyScanner } from '../src/studybuddy/skill-safety-scanner.ts'
import type { SkillSafetyPrivateArtifact } from '../src/studybuddy/skill-safety-artifacts.ts'

const actor = { accountId: 'owner', generation: 1, sessionId: brandString<SessionId>('session') }
const artifact: SkillSafetyPrivateArtifact = { directory: 'C:/private/stage', source: { kind: 'github', owner: 'fixture', repository: 'inert', revision: 'a'.repeat(40), path: '', files: [] }, files: [],
  view: { artifactId: brandString<SkillSafetyArtifactId>('artifact'), jobId: brandString<SkillSafetyJobId>('job'), sourceKind: 'github', revision: 'a'.repeat(40), digest: 'b'.repeat(64), byteLength: 20, fileCount: 1 } }
const original = { id: 'id1', rule_id: 'rule1', category: 'prompt_injection', severity: 'HIGH', title: 'Original', description: 'Description', snippet: 'Evidence', file_path: 'SKILL.md', line_number: 2, remediation: 'Read the source', analyzer: 'static', metadata: { cisco: 'preserved' } }
function scanner(raw: object, extra: Partial<ConstructorParameters<typeof SkillSafetyScanner>[0]> = {}) {
  return new SkillSafetyScanner({ readArtifact: async () => artifact, verifyResources: async () => ({ identity: 'cisco@2.2.2', configDigest: 'c'.repeat(64), executable: 'verified-python', args: ['verified-worker'], cwd: 'verified-resources' }),
    isCurrent: () => true, modelIdentity: async () => 'exact-model:user_api', judge: async () => ({ content: 'recorded', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }), worker: async () => raw, ...extra })
}
it('upstream_findings_are_preserved without changing high severity into a crash', async () => {
  const report = await scanner({ findings: [original], analyzers_used: ['static_analyzer', 'llm_analyzer'], analyzers_failed: [] }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)
  expect(report.status).toBe('complete'); expect(report.maxSeverity).toBe('high'); expect(report.eligible).toBe(false)
  expect(report.findings[0]).toMatchObject({ ruleId: original.rule_id, originalSeverity: 'HIGH', original })
})
it.each([
  { findings: [{ ...original, rule_id: 'LLM_CONTEXT_BUDGET_EXCEEDED', severity: 'INFO' }], analyzers_used: ['static_analyzer', 'llm_analyzer'], analyzers_failed: [] },
  { findings: [], analyzers_used: ['static_analyzer', 'llm_analyzer'], analyzers_failed: [{ analyzer: 'llm_analyzer', error: 'required judge failed' }] },
  { findings: [], analyzers_used: ['static_analyzer'], analyzers_failed: [] },
])('failed_or_budget_partial_judge_is_not_eligible', async (raw) => {
  const report = await scanner(raw).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)
  expect(report.status).not.toBe('complete'); expect(report.eligible).toBe(false)
})
it('complete medium findings require visible review', async () => {
  const report = await scanner({ findings: [{ ...original, severity: 'MEDIUM' }], analyzers_used: ['static_analyzer', 'llm_analyzer'] }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)
  expect(report.status).toBe('complete'); expect(report.eligible).toBe(true); expect(report.reviewRequired).toBe(true)
})
it.skipIf(process.platform !== 'win32')('Windows namespaced finding paths retain only the snapshot label', async () => {
  const report = await scanner({ findings: [{ ...original, file_path: toNamespacedPath(artifact.directory) + '\\SKILL.md' }], analyzers_used: ['static_analyzer', 'llm_analyzer'] }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)
  expect(report.findings[0]?.relativePath).toBe('[snapshot]\\SKILL.md')
})
it('resource_tamper_blocks_start', async () => {
  let starts = 0
  await expect(scanner({}, { verifyResources: async () => { throw Error('SKILL_SAFETY_RESOURCE_INVALID') }, worker: async () => { starts++; return {} } }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
  expect(starts).toBe(0)
})
it('changing authority during resource verification prevents any worker or paid judge', async () => {
  let model = 'confirmed:platform', starts = 0
  const current = scanner({}, { modelIdentity: async () => model,
    verifyResources: async () => { model = 'changed:user_api'; return { identity: 'cisco@2.2.2', configDigest: 'c'.repeat(64), executable: 'verified', args: [], cwd: 'verified' } },
    worker: async () => { starts++; return {} } })
  await expect(current.runSkillScan(actor, artifact.view.artifactId, new AbortController().signal, 'confirmed:platform')).rejects.toMatchObject({ code: 'SKILL_SAFETY_MODEL_CHANGED' })
  expect(starts).toBe(0)
})
it('source_changed_during_scan_is_not_current', async () => {
  let reads = 0
  await expect(scanner({ findings: [], analyzers_used: ['static_analyzer', 'llm_analyzer'] }, { readArtifact: async () => { if (++reads > 1) throw Error('SKILL_SAFETY_SOURCE_CHANGED'); return artifact } }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_SOURCE_CHANGED')
})
it('cancelled scan has a structured code before starting a worker', async () => {
  let starts = 0
  await expect(scanner({}, { worker: async () => { starts++; return {} } }).runSkillScan(actor, artifact.view.artifactId, AbortSignal.abort())).rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' })
  expect(starts).toBe(0)
})
it('malformed worker output is a structured response failure, not a scanner verdict', async () => {
  await expect(scanner({ findings: [], analyzers_used: 1 }).runSkillScan(actor, artifact.view.artifactId, new AbortController().signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_RESPONSE_INVALID' })
})
