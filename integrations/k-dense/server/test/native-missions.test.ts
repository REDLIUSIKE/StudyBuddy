import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/agent/session-registry.ts', () => { throw Error('Native missions must not initialize Pi'); });
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mission-'));
  roots.push(root); vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy');
  vi.resetModules();
  const module = await import('../src/runtime/native-missions.ts');
  const { resolvePaths } = await import('../src/projects.ts');
  const paths = resolvePaths('study'); fs.mkdirSync(paths.sandbox, { recursive: true });
  let current = true;
  const inspect = vi.fn(async (_project: string, _session: string, _call: string, input: any) => {
    if (input.operationId !== '11111111-1111-4111-8111-111111111111') throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND');
    return { operationId: input.operationId, nativeSessionId: 'session-observed', parentSessionId: 'session-owner', state: 'completed' };
  });
  return { paths, inspect, owner: new module.NativeResearchMissions({ current: () => current, inspect }), revoke: () => { current = false; } };
}
it('preserves upstream mission decisions, receipts and labels with native actor identity and stable creation', async () => {
  const x = await setup();
  const input = { action: 'mission.create', mission: { title: 'Review measurements', objective: 'Compare observed data', labels: ['evidence'] } };
  const first: any = await x.owner.invoke('study', 'session-owner', 'create-a', input);
  const again: any = await x.owner.invoke('study', 'session-owner', 'create-a', input);
  expect(again.details.missionId).toBe(first.details.missionId);
  expect(first.details.mission.ownerSessionId).toBe('session-owner');
  await x.owner.invoke('study', 'session-owner', 'update-a', { action: 'mission.update', missionId: first.details.missionId, missionUpdate: { decisions: [{ title: 'Which evidence?', options: ['observed', 'planned'] }], receipts: [{ kind: 'ci', status: 'ready', title: 'Recorded validation', url: 'https://example.test/proof' }] } });
  const missions = x.owner.list('study');
  expect(missions).toHaveLength(1);
  expect(missions[0]).toMatchObject({ labels: ['evidence'], decisions: [expect.objectContaining({ title: 'Which evidence?', status: 'open' })], receipts: [expect.objectContaining({ kind: 'ci', status: 'ready' })] });
  await x.owner.close('study', 'session-owner', 'close-a', first.details.missionId, 'cancelled', 'Closed by user');
  expect(x.owner.list('study')[0]).toMatchObject({ status: 'cancelled', summary: 'Closed by user' });
  expect(x.inspect).not.toHaveBeenCalled();
});
it('links only an observed native operation and never invents token usage or accepts a runner path', async () => {
  const x = await setup(); const created: any = await x.owner.invoke('study', 'session-owner', 'create-b', { action: 'mission.create', mission: { title: 'Native child' } });
  await x.owner.invoke('study', 'session-owner', 'attach-a', { action: 'mission.attach-run', missionId: created.details.missionId, operationId: '11111111-1111-4111-8111-111111111111' });
  expect(x.owner.list('study')[0].runs).toEqual([expect.objectContaining({ runId: 'session-observed', mode: 'single', status: 'completed' })]);
  expect(x.owner.list('study')[0].usage).toBeUndefined();
  await expect(x.owner.invoke('study', 'session-owner', 'attach-foreign', { action: 'mission.attach-run', missionId: created.details.missionId, operationId: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow('HARNESS_RESEARCH_RUN_NOT_FOUND');
  await expect(x.owner.invoke('study', 'session-owner', 'attach-path', { action: 'mission.attach-run', missionId: created.details.missionId, operationId: '11111111-1111-4111-8111-111111111111', dir: x.paths.sandbox })).rejects.toThrow('RESEARCH_MISSION_INPUT_INVALID');
});
it('rejects conflicting action identities, foreign project paths and revoked owners', async () => {
  const x = await setup(); await x.owner.invoke('study', 'session-owner', 'same', { action: 'mission.create', mission: { title: 'First' } });
  await expect(x.owner.invoke('study', 'session-owner', 'same', { action: 'mission.create', mission: { title: 'Changed' } })).rejects.toThrow('RESEARCH_MISSION_OPERATION_CONFLICT');
  x.revoke(); expect(() => x.owner.list('study')).toThrow('RESEARCH_CONTEXT_REVOKED');
  await expect(x.owner.invoke('study', 'session-owner', 'revoked', { action: 'mission.create', mission: { title: 'Denied' } })).rejects.toThrow('RESEARCH_CONTEXT_REVOKED');
});
it('denies a junction in the mission store and preserves the outside directory', async () => {
  const x = await setup(), outside = path.join(path.dirname(x.paths.root), 'outside');
  fs.mkdirSync(outside, { recursive: true }); fs.writeFileSync(path.join(outside, 'keep.txt'), 'preserved');
  fs.mkdirSync(x.paths.kadyDir, { recursive: true });
  fs.symlinkSync(outside, path.join(x.paths.kadyDir, 'native-missions'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => x.owner.list('study')).toThrow('RESEARCH_PATH_DENIED');
  await expect(x.owner.invoke('study', 'session-owner', 'junction-create', { action: 'mission.create', mission: { title: 'Denied' } })).rejects.toThrow('RESEARCH_PATH_DENIED');
  expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('preserved');
});
it('keeps unsupported automatic token-goal execution closed instead of publishing a fabricated native counter', async () => {
  const x = await setup();
  await expect(x.owner.invoke('study', 'session-owner', 'goal-a', { action: 'mission.create', mission: { title: 'Goal loop', goal: true, budget: { tokens: 100 } } })).rejects.toThrow('RESEARCH_MISSION_GOAL_USAGE_UNAVAILABLE');
  expect(x.owner.list('study')).toEqual([]); expect(x.inspect).not.toHaveBeenCalled();
});
