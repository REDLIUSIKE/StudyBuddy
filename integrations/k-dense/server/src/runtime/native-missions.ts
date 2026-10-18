/** Original non-model mission manager, confined to the admitted account's project. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
// pi-subagents 0.74.0 has no public mission-manager export. Reuse its exact,
// lock-pinned non-model implementation; the resource pack verifies these bytes.
import { handleMissionAction, type MissionAction } from '../../node_modules/pi-subagents/src/missions/actions.js';
import { listMissions, readMission, resolveMissionStoreLocation } from '../../node_modules/pi-subagents/src/missions/store.js';
import type { NativeResearchGoals } from './native-goals.ts';
import { resolvePaths } from '../projects.ts';
import { assertResearchPath } from './project-storage.ts';

const ACTIONS = ['mission.create', 'mission.list', 'mission.show', 'mission.update', 'mission.resolve-decision', 'mission.attach-run', 'mission.close'] as const;
export const NativeMissionSchema = {
  type: 'object', additionalProperties: false,
  description: 'Manage authored research missions. Enable continuous Goal mode only for an explicit human request with an authored cumulative Token budget. Ordinary tasks and model-authored plans do not grant Goal authority.',
  properties: { action: { type: 'string', enum: ACTIONS }, missionId: { type: 'string' }, mission: { type: 'object' }, missionUpdate: { type: 'object' }, missionStatus: { type: 'string', enum: ['completed', 'failed', 'cancelled'] }, id: { type: 'string' }, summary: { type: 'string' }, operationId: { type: 'string' } },
  required: ['action'],
};
interface Owner {
  current(): boolean;
  inspect(projectId: string, sessionId: string, callId: string, input: unknown): Promise<unknown>;
  goals?: NativeResearchGoals;
}
const keys: Record<string, string[]> = {
  'mission.create': ['action', 'mission'], 'mission.list': ['action'], 'mission.show': ['action', 'missionId'],
  'mission.update': ['action', 'missionId', 'missionUpdate'], 'mission.resolve-decision': ['action', 'missionId', 'id', 'summary'],
  'mission.attach-run': ['action', 'missionId', 'operationId'], 'mission.close': ['action', 'missionId', 'missionStatus', 'summary'],
};
/** Missions are authored workflow records, not proof of external execution or billing. */
export class NativeResearchMissions {
  private readonly pending = new Map<string, { signature: string; value: Promise<unknown> }>();
  constructor(private readonly owner: Owner) {}
  private current() { if (!this.owner.current()) throw Error('RESEARCH_CONTEXT_REVOKED'); }
  private location(projectId: string) {
    this.current();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId)) throw Error('RESEARCH_PROJECT_INVALID');
    const paths = resolvePaths(projectId);
    const directory = path.join(paths.kadyDir, 'native-missions');
    assertResearchPath(directory);
    if (fs.existsSync(directory)) {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      if (entries.length > 1000) throw Error('RESEARCH_MISSION_STORE_LIMIT');
      for (const entry of entries) {
        const file = path.join(directory, entry.name); assertResearchPath(file);
        if (!entry.isFile() || fs.statSync(file).size > 1048576) throw Error('RESEARCH_MISSION_STORE_INVALID');
      }
    }
    return { paths, location: resolveMissionStoreLocation({ projectRoot: paths.sandbox, config: { directory, globalIndex: false } }) };
  }
  list(projectId: string) {
    const { location } = this.location(projectId), listed = listMissions(location);
    if (listed.warnings.length) throw Error('RESEARCH_MISSION_STORE_INVALID');
    return listed.records.map(record => this.owner.goals?.project(projectId, record) ?? record);
  }
  /** Refresh original mission counters from the native driver; reading never rearms a Goal. */
  async refresh(projectId: string) {
    this.current();
    for (const mission of this.list(projectId)) await this.owner.goals?.refresh(projectId, mission);
    this.current(); return this.list(projectId);
  }
  close(projectId: string, sessionId: string, callId: string, missionId: string, status: string, summary: string) {
    return this.invoke(projectId, sessionId, callId, { action: 'mission.close', missionId, missionStatus: status, summary });
  }
  async invoke(projectId: string, sessionId: string, callId: string, input: unknown): Promise<unknown> {
    this.current();
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof sessionId !== 'string' || !sessionId || typeof callId !== 'string' || !callId) throw Error('RESEARCH_MISSION_INPUT_INVALID');
    const row = structuredClone(input) as Record<string, unknown>, action = row.action;
    const allowed = typeof action === 'string' ? keys[action] : undefined;
    if (!allowed || Object.keys(row).some(key => !allowed.includes(key)) || JSON.stringify(row).length > 65536) throw Error('RESEARCH_MISSION_INPUT_INVALID');
    // The native adapter owns execution and trusted usage; the original Pi
    // mission manager continues to own records and authored transitions.
    const goalInput = row.action === 'mission.create' ? row.mission : row.action === 'mission.update' ? row.missionUpdate : undefined;
    if (!this.owner.goals && goalInput && typeof goalInput === 'object' && 'goal' in goalInput && (goalInput as { goal?: unknown }).goal !== false) throw Error('RESEARCH_MISSION_GOAL_USAGE_UNAVAILABLE');
    const { paths } = this.location(projectId);
    const signature = JSON.stringify([sessionId, row]);
    const id = createHash('sha256').update(JSON.stringify([projectId, sessionId, callId])).digest('hex');
    const previous = this.pending.get(id);
    if (previous) { if (previous.signature !== signature) throw Error('RESEARCH_MISSION_OPERATION_CONFLICT'); return previous.value; }
    const promise = this.execute(projectId, sessionId, callId, row, signature, path.join(paths.kadyDir, 'native-mission-actions', id + '.json'));
    this.pending.set(id, { signature, value: promise });
    try { return await promise; } finally { if (this.pending.get(id)?.value === promise) this.pending.delete(id); }
  }
  private async execute(projectId: string, sessionId: string, callId: string, input: Record<string, unknown>, signature: string, receiptFile: string) {
    assertResearchPath(receiptFile);
    try {
      if (fs.statSync(receiptFile).size > 1048576) throw Error('RESEARCH_MISSION_RECEIPT_INVALID');
      const saved = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      if (saved.signature !== signature) throw Error('RESEARCH_MISSION_OPERATION_CONFLICT');
      if (saved.state !== 'completed') throw Error('RESEARCH_MISSION_OUTCOME_UNCONFIRMED');
      return saved.result;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const params = { ...input } as Record<string, unknown>;
    if (input.action === 'mission.attach-run') {
      if (typeof input.operationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.operationId)) throw Error('RESEARCH_MISSION_INPUT_INVALID');
      const observed = await this.owner.inspect(projectId, sessionId, callId, { action: 'inspect', operationId: input.operationId }) as Record<string, unknown>;
      this.current();
      if (observed.operationId !== input.operationId || observed.parentSessionId !== sessionId || typeof observed.nativeSessionId !== 'string' || !['admitting', 'running', 'completed', 'failed', 'unknown'].includes(String(observed.state))) throw Error('RESEARCH_MISSION_RUN_DENIED');
      Object.assign(params, { runId: observed.nativeSessionId, runMode: 'single', runStatus: observed.state });
      delete params.operationId;
    }
    const { paths } = this.location(projectId);
    this.current(); assertResearchPath(path.dirname(receiptFile)); fs.mkdirSync(path.dirname(receiptFile), { recursive: true }); assertResearchPath(receiptFile);
    fs.writeFileSync(receiptFile, JSON.stringify({ schemaVersion: 1, signature, state: 'admitting' }) + '\n', { flag: 'wx', mode: 0o600 });
    if (input.action === 'mission.list' && this.owner.goals) await this.refresh(projectId);
    const result = handleMissionAction(input.action as MissionAction, params, { cwd: paths.sandbox, currentSessionId: sessionId, config: { directory: path.join(paths.kadyDir, 'native-missions'), globalIndex: false } });
    if (input.action === 'mission.list' && result.details?.missions) Object.assign(result.details.missions, { records: this.list(projectId) });
    if (this.owner.goals && result.details?.missionId) {
      const { location } = this.location(projectId), record = readMission(location, result.details.missionId);
      const authored = input.action === 'mission.create' ? input.mission : input.action === 'mission.update' ? input.missionUpdate : undefined;
      const explicit = authored !== null && typeof authored === 'object' && ('goal' in authored && authored.goal !== false || 'budget' in authored || 'objective' in authored);
      const disabled = authored !== null && typeof authored === 'object' && 'goal' in authored && authored.goal === false;
      const nativeGoal = input.action === 'mission.show' ? await this.owner.goals.refresh(projectId, record) : await this.owner.goals.sync(projectId, callId, record, explicit, disabled);
      this.current(); result.details.mission = readMission(location, record.id);
      if (nativeGoal) Object.assign(result.details, { nativeGoal });
    }
    this.current(); this.location(projectId); assertResearchPath(receiptFile);
    const temporary = receiptFile + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, signature, state: 'completed', result }) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, receiptFile);
    return result;
  }
}
