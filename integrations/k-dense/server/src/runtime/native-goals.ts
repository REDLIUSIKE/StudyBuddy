/** Project-owned projections of the native Goal driver's terminal Token accounting. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolvePaths } from '../projects.ts';
import { assertResearchPath } from './project-storage.ts';
import type { NativeChannel } from './native-channel.ts';
import type { MissionRecord } from '../../node_modules/pi-subagents/src/missions/types.js';
import { resolveMissionStoreLocation, updateMission } from '../../node_modules/pi-subagents/src/missions/store.js';

/** Host-observed cumulative usage; unknown request identities remain visible. */
export interface NativeMissionGoalState {
  missionId: string; nativeSessionId: string; goalSessionId: string; goalId: string | null;
  state: 'active' | 'paused' | 'budget-exhausted' | 'complete' | 'cancelled' | 'disabled' | 'unknown';
  tokenBudget: number; tokensUsed: number; unknownRequests: string[]; activation: 'armed' | 'disarmed';
  sessions: { sessionId: string; parentSessionId: string | null; tokensUsed: number }[];
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nativeSession = /^session-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function parse(value: unknown, mission: MissionRecord): NativeMissionGoalState {
  const row = object(value);
  if (!row || row.missionId !== mission.id || row.nativeSessionId !== mission.ownerSessionId || typeof row.goalSessionId !== 'string' || !nativeSession.test(row.goalSessionId) || row.goalSessionId === row.nativeSessionId || !(row.goalId === null || typeof row.goalId === 'string' && row.goalId.startsWith('goal-')) || typeof row.state !== 'string' || !['active', 'paused', 'budget-exhausted', 'complete', 'cancelled', 'disabled', 'unknown'].includes(row.state) || !integer(row.tokenBudget) || row.tokenBudget < 1 || !integer(row.tokensUsed) || !['armed', 'disarmed'].includes(String(row.activation)) || !Array.isArray(row.unknownRequests) || row.unknownRequests.length > 1000 || row.unknownRequests.some(id => typeof id !== 'string') || new Set(row.unknownRequests).size !== row.unknownRequests.length || !Array.isArray(row.sessions) || !row.sessions.length || row.sessions.length > 1000) throw Error('RESEARCH_GOAL_OBSERVATION_INVALID');
  const sessions = row.sessions.map((value: unknown) => {
    const member = object(value);
    if (!member || typeof member.sessionId !== 'string' || !nativeSession.test(member.sessionId) || member.sessionId === mission.ownerSessionId || typeof member.parentSessionId !== 'string' || !integer(member.tokensUsed)) throw Error('RESEARCH_GOAL_OBSERVATION_INVALID');
    return { sessionId: member.sessionId, parentSessionId: member.parentSessionId, tokensUsed: member.tokensUsed };
  });
  if (sessions[0]!.sessionId !== row.goalSessionId || sessions[0]!.parentSessionId !== mission.ownerSessionId || new Set(sessions.map(member => member.sessionId)).size !== sessions.length || sessions.some((member, index) => index > 0 && !sessions.slice(0, index).some(parent => parent.sessionId === member.parentSessionId)) || sessions.reduce((sum, member) => sum + member.tokensUsed, 0) !== row.tokensUsed) throw Error('RESEARCH_GOAL_OBSERVATION_INVALID');
  return { missionId: mission.id, nativeSessionId: String(row.nativeSessionId), goalSessionId: row.goalSessionId, goalId: row.goalId as string | null, state: row.state as NativeMissionGoalState['state'], tokenBudget: row.tokenBudget, tokensUsed: row.tokensUsed, unknownRequests: row.unknownRequests as string[], activation: row.activation as NativeMissionGoalState['activation'], sessions };
}
/** Model execution remains in Harness; this adapter never starts a Pi goal loop. */
export class NativeResearchGoals {
  constructor(private readonly channel: NativeChannel) {}
  private current(): void { if (!this.channel.current()) throw Error('RESEARCH_CONTEXT_REVOKED'); }
  private file(projectId: string, missionId: string): string {
    this.current(); if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId) || !/^[a-f0-9-]{36}$/.test(missionId)) throw Error('RESEARCH_GOAL_INPUT_INVALID');
    const file = path.join(resolvePaths(projectId).kadyDir, 'native-goals', missionId + '.json'); assertResearchPath(file); return file;
  }
  private saved(projectId: string, mission: MissionRecord): NativeMissionGoalState | undefined {
    const file = this.file(projectId, mission.id);
    try { const stat = fs.statSync(file); if (stat.size > 1048576 || !stat.isFile()) throw Error('RESEARCH_GOAL_RECEIPT_INVALID'); return parse(JSON.parse(fs.readFileSync(file, 'utf8')), mission); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  /** Add the last observed native state without treating a local record as fresh usage.
   * @param projectId - Admitted original project.
   * @param mission - Original mission record.
   * @returns The original record with explicit native accounting state when present. */
  project(projectId: string, mission: MissionRecord): MissionRecord & { nativeGoal?: NativeMissionGoalState } {
    const saved = this.saved(projectId, mission); return saved ? { ...mission, nativeGoal: saved } : mission;
  }
  private adopt(projectId: string, mission: MissionRecord, value: unknown): NativeMissionGoalState {
    this.current(); const state = parse(value, mission), previous = this.saved(projectId, mission);
    if (previous && (state.tokensUsed < previous.tokensUsed || previous.sessions.some(member => { const fresh = state.sessions.find(candidate => candidate.sessionId === member.sessionId); return !fresh || fresh.parentSessionId !== member.parentSessionId || fresh.tokensUsed < member.tokensUsed; }))) throw Error('RESEARCH_GOAL_USAGE_REGRESSION');
    if (previous && (state.goalSessionId !== previous.goalSessionId || previous.goalId !== null && state.goalId !== previous.goalId)) throw Error('RESEARCH_GOAL_IDENTITY_CHANGED');
    const file = this.file(projectId, mission.id), directory = path.dirname(file);
    assertResearchPath(directory); fs.mkdirSync(directory, { recursive: true }); assertResearchPath(file); this.current();
    const temporary = file + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file);
    if (mission.goal) {
      const location = resolveMissionStoreLocation({ projectRoot: resolvePaths(projectId).sandbox, config: { directory: path.join(resolvePaths(projectId).kadyDir, 'native-missions'), globalIndex: false } });
      const goal = { status: state.state === 'budget-exhausted' ? 'budget-exhausted' as const : state.state === 'active' && state.activation === 'armed' ? 'active' as const : 'paused' as const };
      // Original run links point to real native Goal and descendant Sessions;
      // the page/channel owner remains the original root conversation.
      const status = state.state === 'complete' ? 'completed' : state.state === 'cancelled' || state.state === 'disabled' ? 'cancelled' : state.state;
      updateMission(location, mission.id, { usage: { tokens: state.tokensUsed }, goal, addRuns: state.sessions.map(member => ({ runId: member.sessionId, mode: 'single' as const, status, usage: { tokens: member.tokensUsed } })) });
    }
    return state;
  }
  /** Synchronize an explicit authored mission transition with the existing native Goal.
   * @param projectId - Admitted original project.
   * @param callId - Actual native mission tool call, or authenticated terminal panel operation.
   * @param mission - Record authored by the original lock-pinned mission manager.
   * @param explicit - Whether this action explicitly contained a Goal setting.
   * @param disabled - Whether the action explicitly removed Goal mode.
   * @returns The Host's trusted accounting state, or undefined for an ordinary mission. */
  async sync(projectId: string, callId: string, mission: MissionRecord, explicit: boolean, disabled = false): Promise<NativeMissionGoalState | undefined> {
    this.current(); const previous = this.saved(projectId, mission); if (!mission.goal && !previous) return;
    if (!mission.ownerSessionId || !mission.budget && !previous) throw Error('RESEARCH_GOAL_OWNER_REQUIRED');
    const state = disabled ? 'disabled' : mission.status === 'completed' ? 'complete' : ['failed', 'cancelled'].includes(mission.status) ? 'cancelled' : mission.goal?.status === 'paused' ? 'paused' : 'active';
    const input = { action: 'sync', missionId: mission.id, objective: mission.objective, tokenBudget: mission.budget?.tokens ?? previous!.tokenBudget, state, explicit, callId };
    const observed = await this.channel.request(projectId, 'goal', input, new AbortController().signal, mission.ownerSessionId); this.current();
    return this.adopt(projectId, mission, observed);
  }
  /** Refresh usage through the private native channel without granting continuation authority.
   * @param projectId - Admitted original project.
   * @param mission - Mission whose root owns the persisted native Goal.
   * @returns Last authoritative native state, with unresolved requests preserved. */
  async refresh(projectId: string, mission: MissionRecord): Promise<NativeMissionGoalState | undefined> {
    this.current(); if (!mission.goal && !this.saved(projectId, mission)) return;
    if (!mission.ownerSessionId) throw Error('RESEARCH_GOAL_OWNER_REQUIRED');
    const observed = await this.channel.request(projectId, 'goal', { action: 'inspect', missionId: mission.id }, new AbortController().signal, mission.ownerSessionId); this.current();
    return this.adopt(projectId, mission, observed);
  }
}
