/** Main's closed source/model/question binding, without conversational workflow state. */
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import type { SkillSafetyPreparedOperation } from '@deepseek-ai/dsh-skill-safety-assistant/provider'
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyReport, SkillSafetyReportId, SkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import type { SkillSafetySources } from './skill-safety-sources.ts'
import type { SkillSafetyScanner } from './skill-safety-scanner.ts'
import type { SkillSafetyInstaller } from './skill-safety-install.ts'
import type { SkillScannerDownload } from './skill-safety-download.ts'
import type { SkillScannerRelease } from './skill-safety-release.ts'
import { createHash, randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'
import { SkillSafetyJournal } from './skill-safety-journal.ts'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Real Main owners; only external boundaries are injected by unit tests. */
export interface SkillSafetyControllerOptions {
  readonly sources: Pick<SkillSafetySources, 'findSkillSources' | 'snapshotSkillSource' | 'readSkillArtifact'>
  readonly scanner: Pick<SkillSafetyScanner, 'runSkillScan'>
  readonly installer: Pick<SkillSafetyInstaller, 'installCheckedSkill'>
  readonly resources: SkillScannerDownload
  readonly release: SkillScannerRelease
  isCurrent(actor: SkillSafetyActor): boolean
  model(actor: SkillSafetyActor): Promise<{ identity: string; label: string; funding: string }>
  readReport(actor: SkillSafetyActor, reportId: SkillSafetyReportId): Promise<SkillSafetyReport>
  saveReport(actor: SkillSafetyActor, report: SkillSafetyReport): Promise<void>
  journalRoot: string
  maxIntents?: number
}
interface Intent { actor: SkillSafetyActor; command: SkillSafetyCommand; prepared: SkillSafetyPreparedOperation; artifactId?: SkillSafetyArtifactId; artifactDigest?: string; modelIdentity?: string; approve?: string; used: boolean }
/** One private controller; Native answers and current authority, not model JSON, grant effects. */
export class SkillSafetyController {
  private readonly intents = new Map<SkillSafetyIntentId, Intent>()
  private readonly journal: SkillSafetyJournal
  constructor(private readonly options: SkillSafetyControllerOptions) { this.journal = new SkillSafetyJournal({ root: options.journalRoot, isCurrentScope: options.isCurrent }) }
  /** Bind a validated request and actual source/authority before showing its native question.
   * @param actor - Private live Host account/session.
   * @param command - Strictly decoded closed operation.
   * @param signal - The calling native turn.
   * @returns A keyless per-call intent; no target body or credential. */
  async preflight(actor: SkillSafetyActor, command: SkillSafetyCommand, signal: AbortSignal): Promise<SkillSafetyPreparedOperation> {
    this.current(actor, signal)
    if (this.intents.size >= (this.options.maxIntents ?? 256)) throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT')
    const snapshot = structuredClone(command), intentId = brandString<SkillSafetyIntentId>(randomUUID())
    const prepared: SkillSafetyPreparedOperation = { intentId, requestId: snapshot.requestId, argumentDigest: digest(snapshot) }
    const row: Intent = { actor: { ...actor }, command: snapshot, prepared, used: false }
    if (snapshot.kind === 'scan') {
      const artifact = await this.options.sources.snapshotSkillSource(actor, snapshot.jobId, snapshot.candidateId, signal); this.current(actor, signal)
      const model = await this.options.model(actor); this.current(actor, signal)
      row.artifactId = artifact.artifactId; row.artifactDigest = artifact.digest; row.modelIdentity = model.identity; row.approve = '继续检查'
      Object.assign(prepared, { question: { id: intentId, header: '确认检查', question: `使用${model.label}检查此技能？内容会发送给当前模型，由${model.funding}承担本次模型费用。`,
        options: [{ label: row.approve }, { label: '取消' }] } })
    } else if (snapshot.kind === 'install') {
      const report = await this.options.readReport(actor, snapshot.reportId); this.current(actor, signal)
      if (report.reportId !== snapshot.reportId || report.status !== 'complete' || !report.eligible || ['high', 'critical'].includes(report.maxSeverity) || report.findings.some(value => ['high', 'critical'].includes(value.severity))) throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED')
      const artifact = await this.options.sources.readSkillArtifact(actor, report.artifactId); this.current(actor, signal)
      if (artifact.source.kind !== 'github' || artifact.view.sourceKind !== 'github') throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED')
      if (artifact.view.digest !== report.artifactDigest) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED')
      row.artifactId = artifact.view.artifactId; row.artifactDigest = artifact.view.digest
      row.approve = report.reviewRequired || report.maxSeverity === 'medium' ? '了解风险，确认安装' : '确认安装'
      Object.assign(prepared, { question: { id: intentId, header: '确认安装', question: row.approve === '确认安装' ? '将检查过的原始文件安装为一个新技能？同名技能不会被替换。' : '此技能存在中风险发现，请阅读上面的检查结果。了解风险后仍要安装为新技能吗？', options: [{ label: row.approve }, { label: '取消' }] } })
    }
    this.current(actor, signal); this.intents.set(intentId, row)
    return structuredClone(prepared)
  }
  /** Execute the still-bound command with the actual native answer.
   * @param actor - Same live owner as preflight.
   * @param prepared - Private immutable intent projection.
   * @param answer - Result of native UserQuestions, never a tool field.
   * @param signal - Turn lifetime.
   * @returns Only the actual operation result. */
  async execute(actor: SkillSafetyActor, prepared: SkillSafetyPreparedOperation, answer: AskUserQuestionAnswer | undefined, signal: AbortSignal): Promise<SkillSafetyResult> {
    this.current(actor, signal)
    const row = this.intents.get(prepared.intentId)
    if (!row || row.used) throw new SkillSafetyError('SKILL_SAFETY_INVALID_STATE')
    if (digest(row.actor) !== digest(actor) || row.prepared.argumentDigest !== prepared.argumentDigest || row.prepared.requestId !== prepared.requestId) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
    if (row.approve) {
      const response = answer?.answers[0]
      if (!response || answer?.answers.length !== 1 || response.id !== row.prepared.question?.id || response.selected.length !== 1 || response.selected[0] !== row.approve || response.custom !== undefined) throw new SkillSafetyError('SKILL_SAFETY_CONFIRMATION_REQUIRED')
    } else if (answer !== undefined) throw new SkillSafetyError('SKILL_SAFETY_CONFIRMATION_REQUIRED')
    if (row.artifactId) {
      const artifact = await this.options.sources.readSkillArtifact(actor, row.artifactId); this.current(actor, signal)
      if (artifact.view.digest !== row.artifactDigest) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED')
    }
    if (row.modelIdentity && (await this.options.model(actor)).identity !== row.modelIdentity) throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED')
    this.current(actor, signal); row.used = true
    const command = row.command
    if (command.kind === 'find') return { kind: 'candidates', value: await this.options.sources.findSkillSources(actor, command.requestId, command.query, signal) }
    if (command.kind === 'prepare-scanner') {
      // Ready is a statement about current bytes, never permission derived from a stored ready result.
      await this.options.resources.prepare(signal); this.current(actor, signal)
      return { kind: 'scanner-ready', value: { status: 'ready', target: this.options.release.target, scannerVersion: this.options.release.scannerVersion, manifestSha256: this.options.release.manifestSha256 } }
    }
    const argumentDigest = digest([command, row.artifactDigest, row.modelIdentity ?? null])
    const prior = await this.journal.read(actor, command.requestId)
    if (prior && (prior.operation !== command.kind || prior.argumentDigest !== argumentDigest)) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
    if (command.kind === 'install') {
      // Installer reads back its durable directory identity on uncertain/settled retries, without new writes.
      if (!prior) await this.journal.reserve(actor, command.requestId, command.kind, argumentDigest)
      const value = await this.options.installer.installCheckedSkill(actor, command.requestId, command.reportId, signal); this.current(actor, signal)
      const result: SkillSafetyResult = { kind: 'receipt', value }
      if (value.status !== 'unknown') await this.journal.settle(actor, command.requestId, result)
      else await this.journal.markUnknown(actor, command.requestId)
      return result
    }
    const record = await this.journal.reserve(actor, command.requestId, command.kind, argumentDigest)
    if (record.status === 'done') {
      if (record.result?.kind !== 'report') throw new SkillSafetyError('SKILL_SAFETY_INVALID_STATE')
      return record.result
    }
    try {
      await this.options.resources.prepare(signal); this.current(actor, signal)
      if ((await this.options.model(actor)).identity !== row.modelIdentity) throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED')
      this.current(actor, signal)
      const value = await this.options.scanner.runSkillScan(actor, row.artifactId!, signal, row.modelIdentity)
      this.current(actor, signal); await this.options.saveReport(actor, value)
      const result: SkillSafetyResult = { kind: 'report', value }
      await this.journal.settle(actor, command.requestId, result); return result
    } catch (error) { await this.journal.markUnknown(actor, command.requestId).catch(() => {}); throw error }
  }
  /** Release one actor-bound native-question intent. @param actor - Private owner. @param prepared - Its projection. */
  release(actor: SkillSafetyActor, prepared: SkillSafetyPreparedOperation): void {
    const row = this.intents.get(prepared.intentId)
    if (row && digest(row.actor) === digest(actor) && row.prepared.argumentDigest === prepared.argumentDigest) this.intents.delete(prepared.intentId)
  }
  private current(actor: SkillSafetyActor, signal: AbortSignal): void { if (signal.aborted) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED'); if (!this.options.isCurrent(actor)) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE') }
}
