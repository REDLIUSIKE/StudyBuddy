/** Original schedule tool actions relay to the existing account-owned native Schedule service. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolvePaths } from '../projects.ts';
import { assertResearchPath } from './project-storage.ts';
import type { NativeChannel } from './native-channel.ts';

/** Native-only research schedule schema retains the pinned workflow-based action vocabulary. */
export const NativeScheduleSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['schedule.create', 'schedule.list', 'schedule.show', 'schedule.history', 'schedule.pause', 'schedule.resume', 'schedule.run', 'schedule.run-due', 'schedule.delete'] },
    id: { type: 'string' }, name: { type: 'string', maxLength: 120 }, at: { type: 'string' }, every: { type: 'string' },
    workflow: { anyOf: [{ type: 'boolean' }, { type: 'string' }] }, args: { type: 'object', maxProperties: 16, additionalProperties: true },
    model: { type: 'string' }, baseRef: { type: 'string' }, context: { type: 'string', enum: ['fresh', 'profile'] }, async: { type: 'boolean' },
    quiet: { type: 'boolean' }, sessionOnly: { type: 'boolean' }, overlap: { type: 'string', enum: ['skip'] }, catchUp: { type: 'string', enum: ['none', 'latest'] }, timeoutMs: { type: 'integer', minimum: 1 },
  }, required: ['action'],
};
interface Owner {
  channel: Pick<NativeChannel, 'current' | 'request'>;
  freeze(projectId: string, sessionId: string, toolCallId: string, params: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface NativeScheduleView extends Record<string, unknown> { id: string; ownerSessionId: string; sessionOnly?: boolean }
export interface NativeSchedulesResponse { schedules: NativeScheduleView[]; heldByBudget: string[]; schedulerSessionId: string | null }
interface Intent { schemaVersion: 1; sessionId: string; signature: string; input: Record<string, unknown>; state: 'admitting' | 'accepted'; result?: unknown }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const session = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const scheduleId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); return value as Record<string, unknown>; }
function identity(projectId: string, sessionId: string, callId: string): string { const hex = createHash('sha256').update(JSON.stringify([projectId, sessionId, callId])).digest('hex').slice(0, 32); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`; }
function interval(value: string): number { const match = /^(\d+)(m|h|d|w)$/.exec(value.trim()), units: Record<string, number> = { m: 60000, h: 3600000, d: 86400000, w: 604800000 }; if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); const result = Number(match[1]) * units[match[2]!]!; if (!Number.isSafeInteger(result)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); return result; }
function at(value: string): string {
  const now = Date.now(), relative = /^\+(\d+)(s|m|h|d)$/.exec(value.trim()), units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  let result: number;
  if (relative) { if (!Number.isSafeInteger(Number(relative[1])) || Number(relative[1]) < 1) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); result = now + Number(relative[1]) * units[relative[2]!]!; }
  else {
    const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
    if (!iso) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]), offset = iso[7]!;
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(iso[4]) > 23 || Number(iso[5]) > 59 || Number(iso[6] ?? 0) > 59 || offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); result = Date.parse(value.trim());
  }
  if (!Number.isSafeInteger(result) || result <= now) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); return new Date(result).toISOString();
}

/** Persisted creation intents observe uncertain starts; they never submit a second native create. */
export class NativeResearchSchedules {
  private readonly pending = new Map<string, { signature: string; value: Promise<unknown> }>();
  /** @param owner - Private channel and the original workflow definition freezer. */
  constructor(private readonly owner: Owner) {}
  private current(): void { if (!this.owner.channel.current()) throw Error('RESEARCH_CONTEXT_REVOKED'); }
  private assert(projectId: string, sessionId: string): void { this.current(); if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId) || !session.test(sessionId)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID'); }
  private async request(projectId: string, sessionId: string, input: unknown): Promise<unknown> { this.assert(projectId, sessionId); const result = await this.owner.channel.request(projectId, 'schedules', input, new AbortController().signal, sessionId); this.current(); return result; }
  /** @param projectId - Admitted active project. @param sessionId - Native project root used only for read authorization. @returns Owned schedule views. */
  async list(projectId: string, sessionId: string): Promise<NativeSchedulesResponse> {
    const raw = record(await this.request(projectId, sessionId, { action: 'list' }));
    if (!Array.isArray(raw.schedules) || raw.schedules.length > 1000 || !Array.isArray(raw.heldByBudget) || raw.heldByBudget.some(id => typeof id !== 'string' || !scheduleId.test(id)) || !(raw.schedulerSessionId === null || typeof raw.schedulerSessionId === 'string' && session.test(raw.schedulerSessionId))) throw Error('RESEARCH_SCHEDULE_VIEW_INVALID');
    const schedules = raw.schedules.map(value => { const row = record(value); if (typeof row.id !== 'string' || !scheduleId.test(row.id) || typeof row.ownerSessionId !== 'string' || !session.test(row.ownerSessionId)) throw Error('RESEARCH_SCHEDULE_VIEW_INVALID'); return structuredClone(row) as NativeScheduleView; });
    if (new Set(schedules.map(row => row.id)).size !== schedules.length || raw.heldByBudget.some(id => !schedules.some(row => row.id === id))) throw Error('RESEARCH_SCHEDULE_VIEW_INVALID');
    return { schedules, heldByBudget: raw.heldByBudget as string[], schedulerSessionId: raw.schedulerSessionId as string | null };
  }
  /** @param projectId - Active account project. @param sessionId - Requesting native root. @param callId - Stable control identity. @param action - Original panel verb. @param id - Exact owned schedule id. @returns Native control result. */
  async control(projectId: string, sessionId: string, callId: string, action: string, id: string): Promise<unknown> {
    if (!['pause', 'resume', 'run', 'delete', 'show', 'history'].includes(action) || !scheduleId.test(id)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
    const rows = (await this.list(projectId, sessionId)).schedules, exact = rows.find(row => row.id === id), matches = exact ? [exact] : rows.filter(row => row.id.startsWith(id));
    if (matches.length > 1) throw Error('RESEARCH_SCHEDULE_ID_AMBIGUOUS'); const found = matches[0];
    if (!found) throw Error('RESEARCH_SCHEDULE_NOT_FOUND');
    if (found.sessionOnly === true && found.ownerSessionId !== sessionId) throw Error('RESEARCH_SCHEDULE_OWNER_DENIED');
    return this.request(projectId, found.ownerSessionId, { action, id: found.id, ...(action === 'run' ? { operationId: identity(projectId, sessionId, callId) } : {}) });
  }
  /** @param projectId - Current project. @param sessionId - Its admitted native root. @returns Native timer recovery acknowledgment; no Pi resident Session is opened. */
  ensureHost(projectId: string, sessionId: string): Promise<unknown> { return this.request(projectId, sessionId, { action: 'ensure-host' }); }
  /** @param projectId - Current account project. @param sessionId - Authorized tool caller. @param callId - Persisted native tool-call id. @param value - Original schedule.* tool JSON. @returns Tool content and retained native metadata. */
  async invoke(projectId: string, sessionId: string, callId: string, value: unknown) {
    this.assert(projectId, sessionId); if (typeof callId !== 'string' || !callId || callId.length > 256) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
    const params = record(value), action = String(params.action), all = ['action', 'id', 'name', 'at', 'every', 'workflow', 'args', 'model', 'baseRef', 'context', 'async', 'quiet', 'sessionOnly', 'overlap', 'catchUp', 'timeoutMs'];
    if (Object.keys(params).some(key => !all.includes(key)) || !NativeScheduleSchema.properties.action.enum.includes(action)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
    let result: unknown;
    if (action === 'schedule.create') {
      if (params.workflow !== true && !(typeof params.workflow === 'string' && params.workflow.trim()) || (typeof params.at === 'string') === (typeof params.every === 'string') || params.name !== undefined && (typeof params.name !== 'string' || !params.name.trim() || params.name.trim().length > 120) || params.model !== undefined && (typeof params.model !== 'string' || !params.model || params.model.length > 768) || params.baseRef !== undefined && (typeof params.baseRef !== 'string' || !params.baseRef || params.baseRef.length > 256) || params.context !== undefined && !['fresh', 'profile'].includes(String(params.context)) || params.async !== undefined && params.async !== true || params.quiet !== undefined && typeof params.quiet !== 'boolean' || params.sessionOnly !== undefined && typeof params.sessionOnly !== 'boolean' || params.overlap !== undefined && params.overlap !== 'skip' || params.catchUp !== undefined && !['none', 'latest'].includes(String(params.catchUp)) || params.timeoutMs !== undefined && (!Number.isSafeInteger(params.timeoutMs) || Number(params.timeoutMs) < 1) || typeof params.at === 'string' && params.quiet === true || params.id !== undefined && (typeof params.id !== 'string' || !scheduleId.test(params.id) || params.id.length > 64)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
      if (params.args !== undefined && (Object.keys(record(params.args)).length > 16 || Buffer.byteLength(JSON.stringify(params.args)) > 65536)) throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
      const id = identity(projectId, sessionId, callId), signature = JSON.stringify(params), prior = this.pending.get(id);
      if (prior && prior.signature !== signature) throw Error('RESEARCH_SCHEDULE_OPERATION_CONFLICT');
      const promise = prior?.value ?? this.create(projectId, sessionId, callId, id, signature, params);
      if (!prior) { this.pending.set(id, { signature, value: promise }); void promise.finally(() => { if (this.pending.get(id)?.value === promise) this.pending.delete(id); }).catch(() => undefined); }
      result = await promise;
    } else {
      const fields = ['schedule.list', 'schedule.run-due'].includes(action) ? ['action'] : action === 'schedule.run' ? ['action', 'id', 'quiet'] : ['action', 'id'];
      if (Object.keys(params).some(key => !fields.includes(key)) || params.quiet !== undefined && typeof params.quiet !== 'boolean') throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
      if (action === 'schedule.list') result = await this.list(projectId, sessionId);
      else if (action === 'schedule.run-due') result = await this.request(projectId, sessionId, { action: 'run-due' });
      else if (typeof params.id !== 'string') throw Error('RESEARCH_SCHEDULE_INPUT_INVALID');
      else result = await this.control(projectId, sessionId, callId, action.slice('schedule.'.length), params.id);
    }
    this.current(); return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
  }
  private file(projectId: string, id: string): string {
    const directory = path.join(resolvePaths(projectId).kadyDir, 'native-schedule-intents'); assertResearchPath(directory); fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); const file = path.join(directory, id + '.json'); assertResearchPath(file);
    if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 1048576)) throw Error('RESEARCH_SCHEDULE_INTENT_INVALID'); return file;
  }
  private save(file: string, intent: Intent): void { this.current(); assertResearchPath(file); const temporary = file + '.' + randomUUID() + '.tmp', encoded = JSON.stringify(intent) + '\n'; if (Buffer.byteLength(encoded) > 1048576) throw Error('RESEARCH_SCHEDULE_INTENT_LIMIT'); fs.writeFileSync(temporary, encoded, { flag: 'wx', mode: 0o600 }); assertResearchPath(file); this.current(); fs.renameSync(temporary, file); }
  private async create(projectId: string, sessionId: string, callId: string, id: string, signature: string, params: Record<string, unknown>) {
    const file = this.file(projectId, id);
    if (fs.existsSync(file)) {
      const saved = record(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (saved.schemaVersion !== 1 || !['admitting', 'accepted'].includes(String(saved.state)) || saved.sessionId !== sessionId || saved.signature !== signature || record(saved.input).operationId !== id) throw Error('RESEARCH_SCHEDULE_OPERATION_CONFLICT');
      if (saved.state === 'accepted') { const result = saved.result; if (!result || typeof result !== 'object' || Array.isArray(result) || !('id' in result) || result.id !== (params.id ?? id) || !('ownerSessionId' in result) || result.ownerSessionId !== sessionId || 'nativeScheduleId' in result && result.nativeScheduleId !== id) throw Error('RESEARCH_SCHEDULE_INTENT_INVALID'); this.current(); return result; }
      // Recovery observes the durable Host mapping; an uncertain create is never sent again.
      let result: unknown;
      try { result = await this.request(projectId, sessionId, { action: 'show', id }); } catch { throw Error('RESEARCH_SCHEDULE_OUTCOME_UNCONFIRMED'); }
      const observed = record(result); if (observed.id !== (params.id ?? id) || observed.ownerSessionId !== sessionId) throw Error('RESEARCH_SCHEDULE_VIEW_INVALID');
      this.save(file, { schemaVersion: 1, sessionId, signature, input: record(saved.input), state: 'accepted', result }); return result;
    }
    const trigger = typeof params.at === 'string' ? { kind: 'once', at: at(params.at) } : { kind: 'interval', every: String(params.every).trim(), everyMs: interval(String(params.every)) };
    // The pinned schedule execution overrides every child's ambient context and always runs asynchronously.
    const target = await this.owner.freeze(projectId, sessionId, callId, { ...structuredClone(params), context: 'fresh', async: true }); this.current();
    if (target === undefined || target === null || Buffer.byteLength(JSON.stringify(target)) > 131072) throw Error('RESEARCH_SCHEDULE_TARGET_INVALID');
    const input = { action: 'create', operationId: id, ...(typeof params.id === 'string' ? { alias: params.id } : {}), name: params.name ?? params.id ?? id, trigger, catchUp: params.catchUp ?? 'latest', quiet: params.quiet ?? false, sessionOnly: params.sessionOnly ?? false, timeoutMs: params.timeoutMs ?? null, target };
    const intent: Intent = { schemaVersion: 1, sessionId, signature, input, state: 'admitting' }; fs.writeFileSync(file, JSON.stringify(intent) + '\n', { flag: 'wx', mode: 0o600 });
    const result = await this.request(projectId, sessionId, input), observed = record(result); if (observed.id !== (params.id ?? id) || observed.ownerSessionId !== sessionId) throw Error('RESEARCH_SCHEDULE_VIEW_INVALID');
    this.save(file, { ...intent, state: 'accepted', result }); return result;
  }
}
