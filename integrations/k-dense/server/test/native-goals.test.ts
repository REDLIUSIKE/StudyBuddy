import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/agent/session-registry.ts', () => { throw Error('Native Goals must not initialize Pi'); });
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-goals-')); roots.push(root);
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.resetModules();
  const missionsModule = await import('../src/runtime/native-missions.ts'), goalsModule = await import('../src/runtime/native-goals.ts'), { resolvePaths } = await import('../src/projects.ts');
  const paths = resolvePaths('study'); fs.mkdirSync(paths.sandbox, { recursive: true });
  let current = true, tokensUsed = 0, state = 'active', unknownRequests: string[] = [], projection: Record<string, unknown> = {};
  const requests: unknown[] = [];
  const childSessionId = 'session-11111111-1111-4111-8111-111111111111';
  const channel = { current: () => current, events: async function* () {}, request: async (projectId: string, operation: string, input: any, _signal: AbortSignal, sessionId?: string) => {
    expect(projectId).toBe('study'); expect(operation).toBe('goal'); expect(sessionId).toBe('session-owner'); requests.push(input);
    return { missionId: input.missionId, nativeSessionId: 'session-owner', goalSessionId: childSessionId, goalId: 'goal-native-fixture', state, tokenBudget: 100, tokensUsed, unknownRequests, activation: 'armed', sessions: [{ sessionId: childSessionId, parentSessionId: 'session-owner', tokensUsed }], ...projection };
  } };
  const Factory = (goalsModule as Record<string, any>).NativeResearchGoals;
  if (typeof Factory !== 'function') throw Error('NATIVE_MISSION_GOAL_NOT_IMPLEMENTED');
  const goals = new Factory(channel);
  const owner = new missionsModule.NativeResearchMissions({ current: () => current, inspect: async () => { throw Error('No specialist start'); }, goals });
  const create = () => owner.invoke('study', 'session-owner', 'create-goal', { action: 'mission.create', mission: { title: 'Explicit experiment goal', objective: 'Compare recorded data', goal: true, budget: { tokens: 100 } } });
  return { owner, requests, paths, create, childSessionId, project: (value: Record<string, unknown>) => { projection = value; }, observed: (tokens: number, phase: string, unknown: string[] = []) => { tokensUsed = tokens; state = phase; unknownRequests = unknown; }, revoke: () => { current = false; } };
}
it('connects only an explicit mission goal and repeats its durable action without replaying native Goal creation', async () => {
  const x = await setup(), first: any = await x.create(), replay: any = await x.create();
  expect(first.details.missionId).toBe(replay.details.missionId);
  expect(x.requests).toEqual([{ action: 'sync', missionId: first.details.missionId, objective: 'Compare recorded data', tokenBudget: 100, state: 'active', explicit: true, callId: 'create-goal' }]);
  expect(first.details.mission).toMatchObject({ ownerSessionId: 'session-owner', goal: { status: 'active' }, usage: { tokens: 0 } });
  expect(first.details.mission.runs).toEqual([expect.objectContaining({ runId: 'session-11111111-1111-4111-8111-111111111111', usage: { tokens: 0 } })]);
});
it('reflects native cumulative counts into the original mission store and preserves unknown usage instead of reporting an exhausted or zero estimate', async () => {
  const x = await setup(), first: any = await x.create();
  x.observed(77, 'unknown', ['session-child:23']);
  const listed = await x.owner.refresh('study');
  expect(listed[0]).toMatchObject({ id: first.details.missionId, goal: { status: 'paused' }, usage: { tokens: 77 }, nativeGoal: { state: 'unknown', unknownRequests: ['session-child:23'] } });
  x.observed(100, 'budget-exhausted');
  expect((await x.owner.refresh('study'))[0]).toMatchObject({ goal: { status: 'budget-exhausted' }, usage: { tokens: 100 } });
  await x.owner.invoke('study', 'session-owner', 'change-label', { action: 'mission.update', missionId: first.details.missionId, missionUpdate: { labels: ['observed'] } });
  expect(x.owner.list('study')[0]).toMatchObject({ usage: { tokens: 100 }, labels: ['observed'] });
});
it('rejects a decreasing native counter and preserves the last trusted cumulative value across backend restart', async () => {
  const x = await setup(); await x.create(); x.observed(40, 'active'); await x.owner.refresh('study');
  x.observed(39, 'active'); await expect(x.owner.refresh('study')).rejects.toThrow('RESEARCH_GOAL_USAGE_REGRESSION');
  expect(x.owner.list('study')[0]).toMatchObject({ usage: { tokens: 40 } });
  x.revoke(); await expect(x.owner.refresh('study')).rejects.toThrow('RESEARCH_CONTEXT_REVOKED');
});
it('keeps ordinary mission creation independent of Goal services and sends terminal closure without asking for another paid activation', async () => {
  const x = await setup(); await x.owner.invoke('study', 'session-owner', 'ordinary', { action: 'mission.create', mission: { title: 'Single task' } });
  expect(x.requests).toEqual([]);
  const created: any = await x.create(); await x.owner.close('study', 'session-owner', 'cancel-goal', created.details.missionId, 'cancelled', 'Closed by human');
  expect(x.requests.at(-1)).toMatchObject({ action: 'sync', state: 'cancelled', explicit: false, callId: 'cancel-goal' });
});
it('preserves real child lineage and rejects per-session regression even when the aggregate increases', async () => {
  const x = await setup(); await x.create(); const descendant = 'session-22222222-2222-4222-8222-222222222222';
  const sessions = (first: number, second: number) => [{ sessionId: x.childSessionId, parentSessionId: 'session-owner', tokensUsed: first }, { sessionId: descendant, parentSessionId: x.childSessionId, tokensUsed: second }];
  x.observed(40, 'active'); x.project({ sessions: sessions(20, 20) }); await x.owner.refresh('study');
  x.observed(41, 'active'); x.project({ sessions: sessions(19, 22) }); await expect(x.owner.refresh('study')).rejects.toThrow('RESEARCH_GOAL_USAGE_REGRESSION');
  expect(x.owner.list('study')[0]).toMatchObject({ usage: { tokens: 40 }, runs: [expect.objectContaining({ runId: x.childSessionId, usage: { tokens: 20 } }), expect.objectContaining({ runId: descendant, usage: { tokens: 20 } })] });
  x.project({ sessions: [{ sessionId: x.childSessionId, parentSessionId: 'session-owner', tokensUsed: 20 }, { sessionId: descendant, parentSessionId: 'session-owner', tokensUsed: 21 }] });
  await expect(x.owner.refresh('study')).rejects.toThrow('RESEARCH_GOAL_OBSERVATION_INVALID');
});
it('refreshes original mission.list and explicitly forwards authored budget/objective changes without a new goal boolean', async () => {
  const x = await setup(), created: any = await x.create(); x.observed(45, 'active');
  const listed: any = await x.owner.invoke('study', 'session-owner', 'list-current', { action: 'mission.list' });
  expect(listed.details.missions.records[0]).toMatchObject({ usage: { tokens: 45 }, nativeGoal: { nativeSessionId: 'session-owner', goalSessionId: x.childSessionId } });
  await x.owner.invoke('study', 'session-owner', 'expand-budget', { action: 'mission.update', missionId: created.details.missionId, missionUpdate: { budget: { tokens: 150 }, objective: 'Compare a new authored criterion' } });
  expect(x.requests.at(-1)).toMatchObject({ action: 'sync', explicit: true, tokenBudget: 150, objective: 'Compare a new authored criterion', callId: 'expand-budget' });
});
