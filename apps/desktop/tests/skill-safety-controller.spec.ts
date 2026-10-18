import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SkillSafetyController, type SkillSafetyControllerOptions } from '../src/studybuddy/skill-safety-controller.ts'
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyCandidateId, SkillSafetyCommand, SkillSafetyJobId, SkillSafetyOperationId, SkillSafetyReport, SkillSafetyReportId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'safety-admission-')); onTestFinished(() => rm(root, { recursive: true, force: true }))
  const actor: SkillSafetyActor = { accountId: 'original-owner', generation: 1, sessionId: SessionId('root') }
  const view = { artifactId: brandString<SkillSafetyArtifactId>('artifact'), jobId: brandString<SkillSafetyJobId>('job'), sourceKind: 'github' as const, revision: 'a'.repeat(40), digest: 'b'.repeat(64), fileCount: 1, byteLength: 80 }
  const report: SkillSafetyReport = { reportId: brandString<SkillSafetyReportId>('report'), artifactId: view.artifactId, artifactDigest: view.digest, configDigest: 'c'.repeat(64), scannerIdentity: 'cisco@2.2.2', modelIdentity: 'current:platform', status: 'complete', findings: [], maxSeverity: 'none', reviewRequired: false, eligible: true }
  let model = 'current:platform', current = true, scans = 0, installs = 0, preparations = 0
  const options: SkillSafetyControllerOptions = { journalRoot: join(root, 'journal'), isCurrent: scope => current && scope.accountId === actor.accountId && scope.generation === actor.generation && scope.sessionId === actor.sessionId,
    model: async () => ({ identity: model, label: '当前模型', funding: '平台余额' }), readReport: async () => report, saveReport: async () => {},
    sources: { findSkillSources: async () => ({ jobId: view.jobId, status: 'no-match', candidates: [] }), snapshotSkillSource: async () => view,
      readSkillArtifact: async () => ({ directory: join(root, 'private-source'), source: { kind: 'github', owner: 'fixture', repository: 'safe', revision: view.revision, path: '', files: [] }, files: [], view }) },
    scanner: { runSkillScan: async () => { scans++; return report } },
    installer: { installCheckedSkill: async () => { installs++; return { operationId: brandString<SkillSafetyOperationId>('operation'), jobId: view.jobId, status: 'installed', writesManifestDigest: view.digest, readbackDigest: view.digest } } },
    resources: { status: async () => ({ state: 'missing', scannerVersion: '2.2.2', receivedBytes: 0, totalBytes: 100 }), dispose: async () => {}, prepare: async () => { preparations++; return { directory: 'private', runtimeDirectory: 'private-runtime', manifest: { schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14', upstream: { repository: 'https://github.com/cisco-ai-defense/skill-scanner', version: '2.2.2', commit: 'ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a' }, configDigest: 'c'.repeat(64), lockDigest: 'd'.repeat(64), files: [], runtimeFiles: [] } } } },
    release: { schemaVersion: 1, target: 'win32-x64', scannerVersion: '2.2.2', pythonVersion: '3.12.14', archiveSha256: 'e'.repeat(64), manifestSha256: 'f'.repeat(64), archiveUrl: 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/' + 'e'.repeat(64) + '.zip', archiveSizeBytes: 100, extractedSizeBytes: 200, fileCount: 4 },
  }
  return { actor, options, report, view, controller: new SkillSafetyController(options), changeModel: () => { model = 'other:user_api' }, revoke: () => { current = false }, scans: () => scans, installs: () => installs, preparations: () => preparations }
}
function scan(h: Awaited<ReturnType<typeof fixture>>): SkillSafetyCommand { return { kind: 'scan', requestId: brandString<SkillSafetyRequestId>('scan-one'), jobId: h.view.jobId, candidateId: brandString<SkillSafetyCandidateId>('candidate') } }
it('source analysis is bound to a native question before a scan', async () => {
  const h = await fixture(), signal = new AbortController().signal, prepared = await h.controller.preflight(h.actor, scan(h), signal)
  expect(prepared.question?.question).toContain('当前模型'); expect(h.scans()).toBe(0)
  await h.controller.execute(h.actor, prepared, { answers: [{ id: prepared.question!.id, selected: ['继续检查'] }] }, signal)
  expect(h.scans()).toBe(1)
})
it('selection_changed_after_notice_cancels_operation before any paid scan', async () => {
  const h = await fixture(), signal = new AbortController().signal, prepared = await h.controller.preflight(h.actor, scan(h), signal); h.changeModel()
  await expect(h.controller.execute(h.actor, prepared, { answers: [{ id: prepared.question!.id, selected: ['继续检查'] }] }, signal)).rejects.toThrow('SKILL_SAFETY_MODEL_CHANGED')
  expect(h.scans()).toBe(0)
})
it('forged, absent or another question answer never installs', async () => {
  const h = await fixture(), signal = new AbortController().signal
  const prepared = await h.controller.preflight(h.actor, { kind: 'install', requestId: brandString<SkillSafetyRequestId>('install-one'), reportId: h.report.reportId }, signal)
  await expect(h.controller.execute(h.actor, prepared, { answers: [{ id: 'unrelated', selected: ['确认安装'] }] }, signal)).rejects.toThrow('SKILL_SAFETY_CONFIRMATION_REQUIRED')
  expect(h.installs()).toBe(0)
})
it('medium findings are visible in the native installation question', async () => {
  const h = await fixture(); Object.assign(h.report, { maxSeverity: 'medium', reviewRequired: true })
  const prepared = await h.controller.preflight(h.actor, { kind: 'install', requestId: brandString<SkillSafetyRequestId>('install-one'), reportId: h.report.reportId }, new AbortController().signal)
  expect(prepared.question?.question).toContain('中风险'); expect(prepared.question?.options?.map(value => value.label)).toContain('了解风险，确认安装')
})
it('fixed preparation is path-free, has no question and makes no model/installation call', async () => {
  const h = await fixture(), signal = new AbortController().signal
  const prepared = await h.controller.preflight(h.actor, { kind: 'prepare-scanner', requestId: brandString<SkillSafetyRequestId>('prepare-one') }, signal)
  expect(prepared.question).toBeUndefined()
  expect(await h.controller.execute(h.actor, prepared, undefined, signal)).toEqual({ kind: 'scanner-ready', value: { status: 'ready', target: 'win32-x64', scannerVersion: '2.2.2', manifestSha256: 'f'.repeat(64) } })
  expect(h.preparations()).toBe(1); expect(h.scans()).toBe(0); expect(h.installs()).toBe(0)
})
it('released, changed or stale intents cannot execute later', async () => {
  const h = await fixture(), signal = new AbortController().signal
  const prepared = await h.controller.preflight(h.actor, scan(h), signal); h.controller.release(h.actor, prepared)
  await expect(h.controller.execute(h.actor, prepared, { answers: [{ id: prepared.question!.id, selected: ['继续检查'] }] }, signal)).rejects.toThrow('SKILL_SAFETY_INVALID_STATE')
  expect(h.scans()).toBe(0)
})
