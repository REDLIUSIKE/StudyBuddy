import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SkillSafetyArtifactId, SkillSafetyJobId, SkillSafetyReport, SkillSafetyReportId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import type { SkillSafetyPrivateArtifact } from '../src/studybuddy/skill-safety-artifacts.ts'
import { SkillSafetyInstaller, type SkillSafetyInstallOptions } from '../src/studybuddy/skill-safety-install.ts'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'checked-skill-install-')); roots.push(root)
  const stage = join(root, 'snapshot'), userRoot = join(root, 'profile/skills'), privateRoot = join(root, 'private')
  await mkdir(stage); await mkdir(userRoot, { recursive: true })
  const source = Buffer.from('---\nname: checked-fixture\ndescription: An inert checked Skill\n---\nOnly read the supplied list.\n')
  await writeFile(join(stage, 'SKILL.md'), source)
  const files = [{ relativePath: 'SKILL.md', sha256: sha(source), byteLength: source.length }], digest = sha(JSON.stringify(files))
  const actor = { accountId: 'original-owner', generation: 1, sessionId: SessionId('native-safety-session') }
  const artifact: SkillSafetyPrivateArtifact = { directory: stage, files,
    source: { kind: 'github', owner: 'fixture', repository: 'safe', revision: 'a'.repeat(40), path: '', files: [] },
    view: { artifactId: brandString<SkillSafetyArtifactId>('artifact'), jobId: brandString<SkillSafetyJobId>('job'), sourceKind: 'github', revision: 'a'.repeat(40), digest, fileCount: 1, byteLength: source.length } }
  const report: SkillSafetyReport = { reportId: brandString<SkillSafetyReportId>('report'), artifactId: artifact.view.artifactId, artifactDigest: digest,
    configDigest: 'b'.repeat(64), scannerIdentity: 'cisco@2.2.2', modelIdentity: 'current-qualified-model', status: 'complete', findings: [], maxSeverity: 'none', eligible: true, reviewRequired: false }
  let current = true, registryReady = true, registryCalls = 0
  const options: SkillSafetyInstallOptions = { userRoot, privateRoot, isCurrent: () => current,
    readReport: async () => report, readArtifact: async () => artifact,
    registryReadback: async (_actor, name, directory, actual) => { registryCalls++; expect(name).toBe('checked-fixture'); expect(directory).toBe(join(userRoot, name)); expect(actual).toBe(digest); return registryReady },
  }
  return { root, stage, userRoot, privateRoot, actor, report, artifact, source, options, requestId: brandString<SkillSafetyRequestId>('install-one'),
    revoke: () => { current = false }, registry: (value: boolean) => { registryReady = value }, registryCalls: () => registryCalls }
}
it('installs exactly the scanned source without changing its original bytes or running hooks', async () => {
  const h = await fixture(), installer = new SkillSafetyInstaller(h.options)
  const result = await installer.installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)
  expect(result).toMatchObject({ status: 'installed', writesManifestDigest: h.artifact.view.digest, readbackDigest: h.artifact.view.digest })
  expect(await readFile(join(h.userRoot, 'checked-fixture/SKILL.md'))).toEqual(h.source)
  expect(await readFile(join(h.stage, 'SKILL.md'))).toEqual(h.source); expect(h.registryCalls()).toBe(1)
})
it('conflict_keeps_original and writes no replacement', async () => {
  const h = await fixture(); await mkdir(join(h.userRoot, 'checked-fixture')); await writeFile(join(h.userRoot, 'checked-fixture/SKILL.md'), 'original user data')
  const result = await new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)
  expect(result.status).toBe('conflict'); expect(await readFile(join(h.userRoot, 'checked-fixture/SKILL.md'), 'utf8')).toBe('original user data')
  expect(h.registryCalls()).toBe(0)
})
it.each(['high', 'partial', 'installed-source', 'changed-bytes'])('ineligible source never writes: %s', async reason => {
  const h = await fixture()
  if (reason === 'high') { Object.assign(h.report, { maxSeverity: 'high', eligible: true }) }
  if (reason === 'partial') { Object.assign(h.report, { status: 'partial', eligible: true }) }
  if (reason === 'installed-source') { Object.assign(h.artifact.view, { sourceKind: 'installed' }); Object.assign(h.artifact, { source: { kind: 'installed', instanceId: 'already-there', revision: 'one', sourceDigest: h.artifact.view.digest } }) }
  if (reason === 'changed-bytes') await writeFile(join(h.stage, 'SKILL.md'), 'changed after scanning')
  await expect(new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)).rejects.toThrow(reason === 'changed-bytes' ? 'SKILL_SAFETY_SOURCE_CHANGED' : 'SKILL_SAFETY_INSTALL_NOT_ALLOWED')
  expect(await readdir(h.userRoot)).toEqual([]); expect(h.registryCalls()).toBe(0)
})
it('lost_install_reply_reads_back without writing a second copy', async () => {
  const h = await fixture(), first = await new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)
  const second = await new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)
  expect(second.operationId).toBe(first.operationId); expect(second.status).toBe('installed'); expect(await readdir(h.userRoot)).toEqual(['checked-fixture'])
})
it('unconfirmed registry readback is unknown, not installed', async () => {
  const h = await fixture(); h.registry(false)
  const result = await new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)
  expect(result.status).toBe('unknown')
  h.registry(true)
  expect((await new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)).status).toBe('installed')
})
it('cancelled or revoked actors never create an active skill', async () => {
  const h = await fixture(), signal = new AbortController(); signal.abort(); h.revoke()
  await expect(new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, signal.signal)).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  expect(await readdir(h.userRoot)).toEqual([])
})
it('a forged copy manifest cannot write outside private staging', async () => {
  const h = await fixture()
  Object.assign(h.artifact, { files: [{ ...h.artifact.files[0], relativePath: '../escape' }] })
  await expect(new SkillSafetyInstaller(h.options).installCheckedSkill(h.actor, h.requestId, h.report.reportId, new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_SOURCE_UNSAFE')
  expect(await readdir(h.userRoot)).toEqual([])
  expect(await readdir(h.privateRoot).catch(() => [])).not.toContain('escape')
})
