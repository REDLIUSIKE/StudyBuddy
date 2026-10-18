/** Research Automation targets use the existing durable Schedule timer and native delegation. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ScheduleId, resolveEveryOccurrence, type ScheduleRecord } from '@deepseek-ai/dsh-schedule'
import type { UserMessage, ContextFormed } from '@deepseek-ai/dsh-llm'
import { parseHarnessResearchContextV1, type HarnessResearchContextV1 } from '@studybuddy/contracts'
// The native Schedule runtime already owns this source; its public declaration does not import runtime.ts.
declare module '@deepseek-ai/dsh-llm' { interface MessageSourceMap { schedule: { kind: 'schedule' } & ContextFormed } }

/** Creation-time native model, saved specialist definitions and capability ceiling. */
export interface FrozenResearchScheduleTarget { model: string; workflowScript: string; target: unknown }
/** Private owner hooks; freeze performs reads only and dispatch starts the already frozen target once. */
export interface ResearchScheduleOptions {
  current(context: HarnessResearchContextV1): boolean
  directory(context: HarnessResearchContextV1): string
  freeze(context: HarnessResearchContextV1, target: unknown): Promise<FrozenResearchScheduleTarget>
  dispatch(context: HarnessResearchContextV1, target: unknown, operationId: string): Promise<unknown>
  inspect(context: HarnessResearchContextV1, operationId: string): Promise<unknown>
  budget(context: HarnessResearchContextV1): Promise<{ paused: boolean }>
  contextForSession?(sessionId: string): HarnessResearchContextV1 | undefined
  budgetCheckSeconds?: number
}
type Trigger = { kind: 'once'; at: string } | { kind: 'interval'; every: string; everyMs: number; anchorAt: string }
interface Owner { accountId: string; projectId: string; workspaceId: string; sessionId: string }
interface Run { id: string; operationId: string; plannedAt: string; dueReason: 'timer' | 'run-due' | 'manual'; state: 'admitting' | 'running' | 'skipped' | 'missed' | 'completed' | 'failed_launch' | 'failed_run' | 'unknown'; startedAt?: string; completedAt?: string; asyncId?: string; summary?: string; error?: string }
interface Delivery { nativeId: string; scheduledAt: string; deliveredAt: string; messageId: string; prompt?: string }
interface Row {
  schemaVersion: 1; id: string; alias?: string; owner: Owner; signature: string; name: string; trigger: Trigger; frozen: FrozenResearchScheduleTarget
  quiet: boolean; sessionOnly: boolean; catchUp: 'none' | 'latest'; timeoutMs: number | null; paused: boolean; heldByBudget: boolean; suspended: boolean
  createdAt: string; updatedAt: string; nextRunAt: string | null; timer?: { nativeId?: string; at: string; prompt: string; kind: 'due' | 'budget' }
  runs: Run[]; deliveries: Delivery[]; earlierDeliveriesUnavailable: boolean
}
interface Stored { row: Row; file: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const scheduleId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const markerPrefix = 'studybuddy-research-schedule-v1:'
const invalid = () => { throw Error('HARNESS_RESEARCH_SCHEDULE_INPUT_INVALID') }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown> }
function instant(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value }
function identity(value: string): string { const hex = createHash('sha256').update(value).digest('hex').slice(0, 32); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}` }
function owner(context: HarnessResearchContextV1): Owner { return { accountId: context.scope.accountId, projectId: context.projectId, workspaceId: context.workspaceId, sessionId: context.sessionId } }
function sameProject(a: Owner, b: Owner): boolean { return a.accountId === b.accountId && a.projectId === b.projectId && a.workspaceId === b.workspaceId }
function frozen(value: unknown): FrozenResearchScheduleTarget { const row = record(value); if (Object.keys(row).sort().join(',') !== 'model,target,workflowScript' || typeof row.model !== 'string' || !row.model || row.model.length > 768 || typeof row.workflowScript !== 'string' || !row.workflowScript.trim() || row.workflowScript.length > 65536 || JSON.stringify(row.target).length > 131072) throw Error('HARNESS_RESEARCH_SCHEDULE_FROZEN_INVALID'); return { model: row.model, workflowScript: row.workflowScript, target: structuredClone(row.target) } }

/** Install before native Schedule startup can restore a Session. Unbound private deliveries never start a parent model.
 * @param ctx - Original Host context before its reminder runtime activates. @returns Effect-owned guard disposer. */
export function installResearchScheduleSafetyGuard(ctx: Context): () => void {
  return ctx.on('agent/pre-step', async ({ messages }, next) => {
    const privateMessages = messages.filter(message => message.source.kind === 'schedule' && message.content.some(part => part.type === 'text' && part.text.includes(markerPrefix)))
    const decision = await next()
    if (!privateMessages.length || decision.kind === 'reject') return decision
    const accepted = decision.messages.filter(message => !privateMessages.some(privateMessage => privateMessage.id === message.id))
    return accepted.some(message => messages.some(original => original.id === message.id && !privateMessages.includes(original))) ? { ...decision, messages: accepted } : { kind: 'reject' }
  }, { global: true })
}

/** Account/project-owned mapping keeps target outcomes distinct from Schedule inbox receipts. */
export class NativeResearchSchedules {
  private readonly rows = new Map<string, Stored>()
  private readonly contexts = new Map<string, HarnessResearchContextV1>()
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly startedAt = Date.now()
  private readonly disposeGuard: () => void
  private readonly budgetCheckSeconds: number
  private closed = false
  private readonly suspending = new Set<string>()
  /** @param ctx - Running native Host. @param options - Existing admission, dispatch and budget owners. */
  constructor(private readonly ctx: Context, private readonly options: ResearchScheduleOptions) {
    this.budgetCheckSeconds = options.budgetCheckSeconds ?? 60
    if (!Number.isSafeInteger(this.budgetCheckSeconds) || this.budgetCheckSeconds < 1) throw Error('HARNESS_RESEARCH_SCHEDULE_CONFIG_INVALID')
    this.disposeGuard = ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      const decision = await next()
      const privateMessages = messages.filter(message => message.source.kind === 'schedule' && this.text(message).includes(markerPrefix))
      if (!privateMessages.length) return decision
      for (const message of privateMessages) {
        try {
          const context = [...this.contexts.values()].find(candidate => candidate.sessionId === agent.id && this.options.current(candidate)) ?? this.options.contextForSession?.(agent.id)
          if (!context || this.closed || this.suspending.has('*') || this.suspending.has(context.projectId) || !this.options.current(context)) continue
          if (!await this.ctx.sessions.flush(agent.session)) throw Error('HARNESS_RESEARCH_SCHEDULE_DELIVERY_UNCONFIRMED')
          for (const delivery of this.markers(message)) await this.serial(context, () => this.deliver(context, delivery))
        } catch (error) { ctx.logger.warn(`research schedule: delivery remains unconfirmed: ${String(error)}`) }
      }
      if (decision.kind === 'reject') return decision
      const accepted = decision.messages.filter(message => !privateMessages.some(privateMessage => privateMessage.id === message.id))
      return accepted.some(message => messages.some(original => original.id === message.id && !privateMessages.includes(original))) ? { ...decision, messages: accepted } : { kind: 'reject' }
    }, { global: true })
  }
  private text(message: UserMessage): string { return message.content.map(part => part.type === 'text' ? part.text : '').join('\n') }
  private markers(message: UserMessage): { id: string; nativeId: string; prompt: string; at: string; messageId: string }[] {
    const text = this.text(message), native = text.match(/^schedule_id_json: (.+)$/m), at = text.match(/^occurrence_at: (.+)$/m), prompt = text.match(/^reminder_prompt_json: (.+)$/m)
    if (!native || !at || !prompt || !instant(at[1])) throw Error('HARNESS_RESEARCH_SCHEDULE_DELIVERY_INVALID')
    const nativeId: unknown = JSON.parse(native[1]!), value: unknown = JSON.parse(prompt[1]!)
    if (typeof nativeId !== 'string' || typeof value !== 'string' || !value.startsWith(markerPrefix)) throw Error('HARNESS_RESEARCH_SCHEDULE_DELIVERY_INVALID')
    const id = value.slice(markerPrefix.length).split(':')[0]!
    if (!uuid.test(id)) throw Error('HARNESS_RESEARCH_SCHEDULE_DELIVERY_INVALID')
    return [{ id, nativeId, prompt: value, at: at[1], messageId: message.id }]
  }
  private assert(context: HarnessResearchContextV1): void { if (this.closed || this.suspending.has('*') || this.suspending.has(context.projectId) || !this.options.current(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED') }
  private actor(context: HarnessResearchContextV1): void {
    this.assert(context); const actor = this.ctx.agents.get(SessionId(context.sessionId))
    if (!actor || actor.session.header.parentSession !== undefined || actor.session.header.cwd !== this.options.directory(context)) throw Error('HARNESS_RESEARCH_SCHEDULE_OWNER_DENIED')
  }
  private serial<T>(context: HarnessResearchContextV1, work: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([context.scope.accountId, context.projectId, context.workspaceId]), previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(work); this.queues.set(key, next)
    void next.finally(() => { if (this.queues.get(key) === next) this.queues.delete(key) }).catch(() => undefined)
    return next
  }
  private directory(context: HarnessResearchContextV1): string {
    this.assert(context); const root = this.options.directory(context)
    if (!path.isAbsolute(root) || fs.realpathSync(root) !== root || fs.lstatSync(root).isSymbolicLink()) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    for (const directory of [path.join(root, '.studybuddy'), path.join(root, '.studybuddy', 'native-schedules')]) {
      if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 })
      if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    }
    return path.join(root, '.studybuddy', 'native-schedules')
  }
  private read(context: HarnessResearchContextV1): Stored[] {
    const directory = this.directory(context), entries = fs.readdirSync(directory, { withFileTypes: true })
    if (entries.length > 1000) throw Error('HARNESS_RESEARCH_SCHEDULE_STORE_LIMIT')
    const saved: Stored[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || !uuid.test(entry.name.slice(0, -5))) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID')
      const file = path.join(directory, entry.name), stat = fs.lstatSync(file)
      if (stat.isSymbolicLink() || stat.size > 4194304 || fs.realpathSync(file) !== file) throw Error('HARNESS_RESEARCH_PATH_DENIED')
      const row = this.decode(JSON.parse(fs.readFileSync(file, 'utf8')))
      if (row.id !== entry.name.slice(0, -5)) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID')
      if (!sameProject(row.owner, owner(context))) continue
      const prior = this.rows.get(row.id)
      if (prior && prior.file === file) saved.push(prior)
      else { const value = { row, file }; this.rows.set(row.id, value); saved.push(value) }
      if (row.owner.sessionId === context.sessionId) this.contexts.set(row.id, structuredClone(context))
    }
    return saved
  }
  private decode(value: unknown): Row {
    const row = record(value), savedOwner = record(row.owner), trigger = record(row.trigger)
    if (row.schemaVersion !== 1 || typeof row.id !== 'string' || !uuid.test(row.id) || ['accountId', 'projectId', 'workspaceId', 'sessionId'].some(key => typeof savedOwner[key] !== 'string' || !savedOwner[key]) || typeof row.signature !== 'string' || row.signature.length > 262144 || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120 || !instant(row.createdAt) || !instant(row.updatedAt) || !(row.nextRunAt === null || instant(row.nextRunAt)) || ['quiet', 'sessionOnly', 'paused', 'heldByBudget', 'suspended', 'earlierDeliveriesUnavailable'].some(key => typeof row[key] !== 'boolean') || !['none', 'latest'].includes(String(row.catchUp)) || !(row.timeoutMs === null || Number.isSafeInteger(row.timeoutMs) && Number(row.timeoutMs) > 0) || !Array.isArray(row.runs) || row.runs.length > 100 || !Array.isArray(row.deliveries) || row.deliveries.length > 200) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID')
    if (trigger.kind === 'once' ? !instant(trigger.at) : trigger.kind !== 'interval' || typeof trigger.every !== 'string' || !Number.isSafeInteger(trigger.everyMs) || Number(trigger.everyMs) < 60000 || !instant(trigger.anchorAt)) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID')
    frozen(row.frozen)
    if (row.alias !== undefined && (typeof row.alias !== 'string' || !scheduleId.test(row.alias) || row.alias.length > 64)) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID')
    if (row.timer !== undefined) { const timer = record(row.timer); if (!instant(timer.at) || typeof timer.prompt !== 'string' || !timer.prompt.startsWith(markerPrefix + row.id + ':') || !['due', 'budget'].includes(String(timer.kind)) || timer.nativeId !== undefined && typeof timer.nativeId !== 'string') throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID') }
    for (const raw of row.runs) { const run = record(raw); if (typeof run.id !== 'string' || !uuid.test(run.id) || run.operationId !== run.id || !instant(run.plannedAt) || !['timer', 'run-due', 'manual'].includes(String(run.dueReason)) || !['admitting', 'running', 'skipped', 'missed', 'completed', 'failed_launch', 'failed_run', 'unknown'].includes(String(run.state)) || run.summary !== undefined && (typeof run.summary !== 'string' || run.summary.length > 8192) || run.error !== undefined && (typeof run.error !== 'string' || run.error.length > 512)) throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID'); if (run.state === 'admitting' || run.state === 'running') { run.state = 'unknown'; run.error = 'HARNESS_RESEARCH_SCHEDULE_OUTCOME_UNCONFIRMED' } }
    for (const raw of row.deliveries) { const delivery = record(raw); if (typeof delivery.nativeId !== 'string' || typeof delivery.messageId !== 'string' || !instant(delivery.scheduledAt) || !instant(delivery.deliveredAt) || delivery.prompt !== undefined && typeof delivery.prompt !== 'string') throw Error('HARNESS_RESEARCH_SCHEDULE_DOCUMENT_INVALID') }
    return value as Row
  }
  private save(stored: Stored): void {
    const directory = path.dirname(stored.file)
    if (fs.realpathSync(directory) !== directory || fs.lstatSync(directory).isSymbolicLink() || fs.existsSync(stored.file) && (fs.lstatSync(stored.file).isSymbolicLink() || fs.realpathSync(stored.file) !== stored.file)) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    stored.row.updatedAt = new Date(Date.now()).toISOString(); const text = JSON.stringify(stored.row) + '\n'
    if (Buffer.byteLength(text) > 4194304) throw Error('HARNESS_RESEARCH_SCHEDULE_STORE_LIMIT')
    const temporary = stored.file + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, stored.file)
  }
  private owned(context: HarnessResearchContextV1, id: string): Stored {
    const stored = this.read(context).find(candidate => candidate.row.id === id || candidate.row.alias === id)
    if (!stored) throw Error('HARNESS_RESEARCH_SCHEDULE_NOT_FOUND')
    if (stored.row.owner.sessionId !== context.sessionId) throw Error('HARNESS_RESEARCH_SCHEDULE_OWNER_DENIED')
    this.actor(context); return stored
  }
  /** @param context - Current privately bound account/project Session. @param value - Closed schedule control payload. @returns Panel view or real child outcome. */
  async command(context: HarnessResearchContextV1, value: unknown) {
    parseHarnessResearchContextV1(context); this.assert(context); const request = record(value)
    const action = String(request.action), keys: Record<string, string[]> = { create: ['action', 'operationId', 'name', 'trigger', 'catchUp', 'quiet', 'sessionOnly', 'timeoutMs', 'target'], list: ['action'], show: ['action', 'id'], history: ['action', 'id'], pause: ['action', 'id'], resume: ['action', 'id'], run: ['action', 'id', 'operationId'], delete: ['action', 'id'], 'run-due': ['action'], 'ensure-host': ['action'] }
    const allowed = keys[action] ? [...keys[action]!, ...(action === 'create' && request.alias !== undefined ? ['alias'] : [])] : undefined
    if (!allowed || Object.keys(request).sort().join(',') !== allowed.sort().join(',') || request.id !== undefined && (typeof request.id !== 'string' || !scheduleId.test(request.id))) return Promise.reject(Error('HARNESS_RESEARCH_SCHEDULE_INPUT_INVALID'))
    return this.serial(context, async () => {
      this.assert(context)
      if (action === 'create') return this.create(context, request)
      if (action === 'list') return this.list(context)
      if (action === 'ensure-host' || action === 'run-due') {
        this.actor(context)
        for (const stored of this.read(context).filter(row => row.row.owner.sessionId === context.sessionId)) { await this.refresh(context, stored); if (stored.row.heldByBudget && !(await this.options.budget(context)).paused) { stored.row.heldByBudget = false; stored.row.paused = false } if (!stored.row.paused || stored.row.heldByBudget) { stored.row.suspended = false; this.save(stored); await this.armOrDue(context, stored, 'run-due') } }
        return { ok: true, sessionId: context.sessionId, ...(await this.list(context)) }
      }
      const stored = this.owned(context, String(request.id)), row = stored.row; await this.refresh(context, stored)
      if (action === 'show') return this.view(row)
      if (action === 'history') return { id: row.alias ?? row.id, runs: structuredClone(row.runs), runHistoryLimit: 100, deliveries: structuredClone(row.deliveries), earlierDeliveriesUnavailable: row.earlierDeliveriesUnavailable }
      if (action === 'pause') { row.paused = true; row.heldByBudget = false; this.save(stored); await this.stopTimer(stored) }
      if (action === 'resume') { if ((await this.options.budget(context)).paused) throw Error('HARNESS_RESEARCH_BUDGET_REACHED'); row.paused = false; row.heldByBudget = false; row.suspended = false; this.save(stored); await this.armOrDue(context, stored, 'run-due') }
      if (action === 'run') {
        if (typeof request.operationId !== 'string' || !uuid.test(request.operationId)) return invalid()
        const runId = identity(JSON.stringify([row.owner, row.id, request.operationId, 'manual']))
        if (!row.runs.some(run => run.id === runId)) {
          if ((await this.options.budget(context)).paused) throw Error('HARNESS_RESEARCH_BUDGET_REACHED')
          const run = await this.launch(context, stored, runId, new Date(Date.now()).toISOString(), 'manual')
          if (run.state === 'running' || run.state === 'completed' || run.state === 'failed_run') { row.nextRunAt = row.trigger.kind === 'interval' ? new Date(Date.now() + row.trigger.everyMs).toISOString() : null; await this.stopTimer(stored); this.save(stored); if (!row.paused) await this.arm(context, stored) }
        }
      }
      if (action === 'delete') { if (row.runs.some(run => ['admitting', 'running', 'unknown'].includes(run.state))) throw Error('HARNESS_RESEARCH_SCHEDULE_ACTIVE_RUN'); row.paused = true; this.save(stored); await this.stopTimer(stored); fs.unlinkSync(stored.file); this.rows.delete(row.id); this.contexts.delete(row.id) }
      return { ok: true, message: `Schedule ${action} accepted.`, ...(await this.list(context)) }
    })
  }
  private async create(context: HarnessResearchContextV1, request: Record<string, unknown>) {
    this.actor(context)
    const id = request.operationId, trigger = record(request.trigger), now = Date.now()
    if (typeof id !== 'string' || !uuid.test(id) || request.alias !== undefined && (typeof request.alias !== 'string' || !scheduleId.test(request.alias) || request.alias.length > 64) || typeof request.name !== 'string' || !request.name.trim() || request.name.trim().length > 120 || !['none', 'latest'].includes(String(request.catchUp)) || typeof request.quiet !== 'boolean' || typeof request.sessionOnly !== 'boolean' || !(request.timeoutMs === null || Number.isSafeInteger(request.timeoutMs) && Number(request.timeoutMs) > 0)) return invalid()
    if (trigger.kind === 'once' ? Object.keys(trigger).sort().join(',') !== 'at,kind' || !instant(trigger.at) || Date.parse(trigger.at) <= now : trigger.kind !== 'interval' || Object.keys(trigger).sort().join(',') !== 'every,everyMs,kind' || typeof trigger.every !== 'string' || !/^\d+[mhdw]$/.test(trigger.every) || !Number.isSafeInteger(trigger.everyMs) || Number(trigger.everyMs) < 60000) return invalid()
    if (trigger.kind === 'interval') { const match = /^(\d+)([mhdw])$/.exec(String(trigger.every))!, units: Record<string, number> = { m: 60000, h: 3600000, d: 86400000, w: 604800000 }; if (Number(match[1]) * units[match[2]!]! !== trigger.everyMs) return invalid() }
    const signature = JSON.stringify(request), previous = this.read(context).find(stored => stored.row.id === id)
    if (previous) { if (previous.row.owner.sessionId !== context.sessionId || previous.row.signature !== signature) throw Error('HARNESS_RESEARCH_SCHEDULE_OPERATION_CONFLICT'); await this.recoverTimer(context, previous); return this.view(previous.row) }
    if (request.alias !== undefined && this.read(context).some(stored => stored.row.alias === request.alias || stored.row.id === request.alias)) throw Error('HARNESS_RESEARCH_SCHEDULE_OPERATION_CONFLICT')
    const target = frozen(await this.options.freeze(context, request.target)); this.actor(context)
    const timestamp = new Date(now).toISOString(), next = trigger.kind === 'once' ? String(trigger.at) : new Date(now + Number(trigger.everyMs)).toISOString()
    const row: Row = { schemaVersion: 1, id, owner: owner(context), signature, name: request.name.trim(), trigger: trigger.kind === 'once' ? { kind: 'once', at: String(trigger.at) } : { kind: 'interval', every: String(trigger.every), everyMs: Number(trigger.everyMs), anchorAt: timestamp }, frozen: target, quiet: request.quiet, sessionOnly: request.sessionOnly, catchUp: request.catchUp as 'none' | 'latest', timeoutMs: request.timeoutMs as number | null, paused: false, heldByBudget: false, suspended: false, createdAt: timestamp, updatedAt: timestamp, nextRunAt: next, runs: [], deliveries: [], earlierDeliveriesUnavailable: false }
    if (typeof request.alias === 'string') row.alias = request.alias
    const stored = { row, file: path.join(this.directory(context), id + '.json') }; if (fs.existsSync(stored.file)) throw Error('HARNESS_RESEARCH_SCHEDULE_OPERATION_CONFLICT')
    fs.writeFileSync(stored.file, JSON.stringify(row) + '\n', { flag: 'wx', mode: 0o600 }); this.rows.set(id, stored); this.contexts.set(id, structuredClone(context)); await this.arm(context, stored); return this.view(row)
  }
  private async list(context: HarnessResearchContextV1) { const rows = this.read(context); for (const stored of rows.filter(stored => stored.row.owner.sessionId === context.sessionId)) await this.refresh(context, stored); const schedules = rows.map(stored => this.view(stored.row)).sort((a, b) => a.name.localeCompare(b.name)); const result = { schedules, heldByBudget: rows.filter(stored => stored.row.heldByBudget).map(stored => stored.row.alias ?? stored.row.id), schedulerSessionId: rows.length ? context.sessionId : null }; if (Buffer.byteLength(JSON.stringify(result)) > 900000) throw Error('HARNESS_RESEARCH_SCHEDULE_RESULT_LIMIT'); return result }
  private view(row: Row) { const active = row.runs.find(run => ['admitting', 'running', 'unknown'].includes(run.state)); return { id: row.alias ?? row.id, nativeScheduleId: row.id, name: row.name, ownerSessionId: row.owner.sessionId, sessionOnly: row.sessionOnly, trigger: { ...row.trigger, ...(row.nextRunAt === null ? {} : { nextRunAt: row.nextRunAt }) }, workflowScript: row.frozen.workflowScript, model: row.frozen.model, quiet: row.quiet, paused: row.paused, heldByBudget: row.heldByBudget, catchUp: row.catchUp, ...(row.timeoutMs === null ? {} : { timeoutMs: row.timeoutMs }), createdAt: row.createdAt, updatedAt: row.updatedAt, ...(active ? { activeRunId: active.id } : {}), ...(row.runs[0] ? { lastRun: structuredClone(row.runs[0]) } : {}), runs: structuredClone(row.runs.slice(0, 20)), nativeDeliveryHistory: structuredClone(row.deliveries), earlierDeliveriesUnavailable: row.earlierDeliveriesUnavailable } }
  private async refresh(context: HarnessResearchContextV1, stored: Stored): Promise<void> {
    for (const run of stored.row.runs.filter(run => ['running', 'admitting', 'unknown'].includes(run.state))) {
      try { const observed = await this.options.inspect(context, run.operationId); this.assert(context); this.outcome(stored, run, observed) }
      catch (error) { this.assert(context); if (run.state !== 'unknown') { run.state = 'unknown'; run.error = 'HARNESS_RESEARCH_SCHEDULE_OUTCOME_UNCONFIRMED'; this.save(stored) } }
    }
    await this.capture(stored)
  }
  private outcome(stored: Stored, run: Run, value: unknown): void { const receipt = record(value); if (receipt.operationId !== run.operationId || !['admitting', 'running', 'completed', 'failed', 'unknown'].includes(String(receipt.state)) || receipt.parentSessionId !== undefined && receipt.parentSessionId !== stored.row.owner.sessionId) throw Error('HARNESS_RESEARCH_SCHEDULE_OUTCOME_INVALID'); run.state = receipt.state === 'failed' ? 'failed_run' : receipt.state as 'admitting' | 'running' | 'completed' | 'unknown'; if (typeof receipt.nativeSessionId === 'string') run.asyncId = receipt.nativeSessionId; if (typeof receipt.text === 'string') run.summary = receipt.text.slice(0, 8192); if (typeof receipt.summary === 'string') run.summary = receipt.summary.slice(0, 8192); if (typeof receipt.error === 'string') run.error = receipt.error.slice(0, 512); if (run.state === 'completed' || run.state === 'failed_run') run.completedAt = new Date(Date.now()).toISOString(); this.save(stored) }
  private retainDelivery(row: Row, delivery: Delivery): void { if (row.deliveries.some(item => item.nativeId === delivery.nativeId && item.messageId === delivery.messageId)) return; row.deliveries.push(delivery); if (row.deliveries.length > 200) { row.earlierDeliveriesUnavailable = true; row.deliveries = row.deliveries.slice(-200) } }
  private async capture(stored: Stored): Promise<void> { const timer = stored.row.timer; if (!timer?.nativeId) return; const history = await this.ctx.schedule.history({ sessionId: SessionId(stored.row.owner.sessionId), id: ScheduleId(timer.nativeId), limit: 100 }); if ('records' in history) { for (const receipt of history.records) this.retainDelivery(stored.row, { nativeId: timer.nativeId, ...receipt }); stored.row.earlierDeliveriesUnavailable ||= history.earlierRecordsUnavailable || history.earlierRecordsPruned || history.nextBefore !== undefined; this.save(stored) } }
  private async recoverTimer(context: HarnessResearchContextV1, stored: Stored): Promise<void> { const timer = stored.row.timer; if (!timer) return; const catalog = await this.ctx.schedule.catalog(); const matches = catalog.filter(row => row.sessionId === context.sessionId && row.prompt === timer.prompt); if (matches.length > 1) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_CONFLICT'); if (matches[0]) { timer.nativeId = matches[0].id; this.save(stored) } else if (!timer.nativeId) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_UNCONFIRMED') }
  private async arm(context: HarnessResearchContextV1, stored: Stored, budget = false): Promise<void> {
    this.actor(context); const row = stored.row, at = budget ? new Date(Date.now() + this.budgetCheckSeconds * 1000).toISOString() : row.nextRunAt
    if (at === null || !budget && (row.paused || row.suspended)) return
    if (row.timer) { await this.recoverTimer(context, stored); const active = await this.ctx.schedule.list({ sessionId: SessionId(context.sessionId) }), existing = active.find(candidate => candidate.id === row.timer?.nativeId); if (existing) { if (row.timer.at === at && row.timer.kind === (budget ? 'budget' : 'due')) return; const expected: ScheduleRecord = existing; const updated = await this.ctx.schedule.update({ sessionId: SessionId(context.sessionId), id: existing.id, expected, change: { kind: 'at', at } }); if (!('record' in updated)) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_CONFLICT'); row.timer.at = at; row.timer.kind = budget ? 'budget' : 'due'; this.save(stored); return } await this.stopTimer(stored) }
    row.timer = { at, kind: budget ? 'budget' : 'due', prompt: markerPrefix + row.id + ':' + randomUUID() }; this.save(stored)
    const created = await this.ctx.schedule.create(SessionId(context.sessionId), { title: row.name, prompt: row.timer.prompt, at }); this.assert(context); row.timer.nativeId = created.id; this.save(stored)
  }
  private async stopTimer(stored: Stored): Promise<void> { const timer = stored.row.timer; if (!timer) return; const catalog = await this.ctx.schedule.catalog(); const existing = catalog.filter(row => row.sessionId === stored.row.owner.sessionId && row.prompt === timer.prompt); if (existing.length > 1) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_CONFLICT'); if (existing[0]) { timer.nativeId = existing[0].id; await this.capture(stored); const removed = await this.ctx.schedule.delete({ sessionId: SessionId(stored.row.owner.sessionId), id: existing[0].id }); if (!removed.deleted) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_CONFLICT') } else if (!timer.nativeId) throw Error('HARNESS_RESEARCH_SCHEDULE_TIMER_UNCONFIRMED'); delete stored.row.timer; this.save(stored) }
  private async deliver(context: HarnessResearchContextV1, delivery: { id: string; nativeId: string; prompt: string; at: string; messageId: string }): Promise<void> { const stored = this.owned(context, delivery.id), row = stored.row; if (row.timer?.nativeId !== delivery.nativeId || row.timer.prompt !== delivery.prompt || row.timer.at !== delivery.at) return; await this.capture(stored); this.retainDelivery(row, { nativeId: delivery.nativeId, scheduledAt: delivery.at, deliveredAt: new Date(Date.now()).toISOString(), messageId: delivery.messageId, prompt: delivery.prompt }); this.save(stored); if (row.timer.kind === 'budget') { await this.stopTimer(stored); if ((await this.options.budget(context)).paused) { await this.arm(context, stored, true); return } row.heldByBudget = false; row.paused = false; this.save(stored) } else if (row.paused || row.suspended) return; await this.armOrDue(context, stored, 'timer') }
  private async armOrDue(context: HarnessResearchContextV1, stored: Stored, reason: 'timer' | 'run-due'): Promise<void> {
    const row = stored.row; this.actor(context)
    if (row.heldByBudget) { await this.arm(context, stored, true); return }
    if (row.paused || row.nextRunAt === null) return
    const now = Date.now(); if (Date.parse(row.nextRunAt) > now) { await this.arm(context, stored); return }
    const originalAt = row.nextRunAt, occurrence = row.trigger.kind === 'interval' ? resolveEveryOccurrence({ everySeconds: row.trigger.everyMs / 1000, scheduledAt: originalAt }, now) : { occurrenceAt: originalAt, nextScheduledAt: undefined }
    const plannedAt = occurrence.occurrenceAt, runId = identity(JSON.stringify([row.owner, row.id, plannedAt, 'timer']))
    if ((await this.options.budget(context)).paused) { row.heldByBudget = true; row.paused = true; this.save(stored); await this.stopTimer(stored); await this.arm(context, stored, true); return }
    row.nextRunAt = occurrence.nextScheduledAt ?? null; this.save(stored); await this.stopTimer(stored)
    if (row.catchUp === 'none' && (reason === 'run-due' || Date.parse(originalAt) < this.startedAt)) { if (!row.runs.some(run => run.id === runId)) { row.runs.unshift({ id: runId, operationId: runId, plannedAt, dueReason: reason, state: 'missed', completedAt: new Date(now).toISOString() }); row.runs = row.runs.slice(0, 100); this.save(stored) } }
    else await this.launch(context, stored, runId, plannedAt, reason)
    await this.arm(context, stored)
  }
  private async launch(context: HarnessResearchContextV1, stored: Stored, id: string, plannedAt: string, reason: Run['dueReason']): Promise<Run> {
    const row = stored.row, prior = row.runs.find(run => run.id === id); if (prior) return prior
    await this.refresh(context, stored)
    const active = row.runs.find(run => ['admitting', 'running', 'unknown'].includes(run.state)), run: Run = { id, operationId: id, plannedAt, dueReason: reason, state: active ? 'skipped' : 'admitting', ...(active ? { error: 'HARNESS_RESEARCH_SCHEDULE_OVERLAP_SKIPPED' } : { startedAt: new Date(Date.now()).toISOString() }) }
    row.runs.unshift(run); row.runs = row.runs.slice(0, 100); this.save(stored)
    if (active) return run
    try { const result = await this.options.dispatch(context, structuredClone(row.frozen.target), id); this.assert(context); this.outcome(stored, run, result) }
    catch (error) { run.state = 'unknown'; run.error = (error instanceof Error ? error.message : String(error)).slice(0, 512); this.save(stored) }
    return run
  }
  /** Suspend native timers across account/project revocation; a later ensure-host restores owned mappings.
   * @param projectId - Optional closed project; omission suspends all bound projects. @returns Quiescent cleanup. */
  async suspend(projectId?: string): Promise<void> {
    const key = projectId ?? '*'; this.suspending.add(key)
    try { for (const pending of [...this.queues.values()]) await pending.catch(() => undefined); for (const stored of this.rows.values()) if (projectId === undefined || stored.row.owner.projectId === projectId) { stored.row.suspended = true; this.save(stored); await this.stopTimer(stored); this.contexts.delete(stored.row.id); this.rows.delete(stored.row.id) } }
    finally { this.suspending.delete(key) }
  }
  /** Permanently close the owner after suspending timers; guard disposal belongs to final Host shutdown.
   * @returns Quiescent cleanup with durable mapping bytes retained. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; await this.suspend(); this.disposeGuard() }
}
