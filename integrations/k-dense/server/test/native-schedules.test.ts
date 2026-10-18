import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
vi.mock('../src/agent/session-registry.ts', () => { throw Error('Native schedules must not initialize Pi'); });
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const file = new URL('../src/runtime/native-schedules.ts', import.meta.url);
  expect(fs.existsSync(file), 'research Automation native Schedule relay is not implemented').toBe(true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-schedules-')); roots.push(root);
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.resetModules();
  const { NativeResearchSchedules } = await import('../src/runtime/native-schedules.ts');
  const { resolvePaths } = await import('../src/projects.ts'); fs.mkdirSync(resolvePaths('study').sandbox, { recursive: true });
  let current = true, accepted = false, frozen = 'CREATION_DEFINITION', freezeCount = 0, loseCreate = false, lastId = '';
  const calls: Array<{ project: string; operation: string; input: any; session?: string }> = [];
  const request = async (project: string, operation: string, input: any, _signal: AbortSignal, session?: string) => {
    calls.push({ project, operation, input, session });
    if (input.action === 'create') { accepted = true; lastId = input.operationId; if (loseCreate) throw Error('RESEARCH_TRANSPORT_DISCONNECTED'); return { id: input.alias ?? input.operationId, nativeScheduleId: input.operationId, ownerSessionId: session, model: 'exact-group/exact-model' }; }
    if (input.action === 'show') { if (!accepted) throw Error('HARNESS_RESEARCH_SCHEDULE_NOT_FOUND'); return { id: input.id, ownerSessionId: session, model: 'exact-group/exact-model' }; }
    if (input.action === 'list') return { schedules: [{ id: '33333333-3333-4333-8333-333333333333', ownerSessionId: 'creation-session', model: 'exact-group/exact-model', paused: true, heldByBudget: false, runs: [] }], heldByBudget: [], schedulerSessionId: session ?? 'project-session' };
    if (input.action === 'ensure-host') return { ok: true, sessionId: session };
    if (input.action === 'run') throw Error('HARNESS_RESEARCH_BUDGET_REACHED');
    return { ok: true };
  };
  const owner = new NativeResearchSchedules({ channel: { current: () => current, request }, freeze: async (_project: string, _session: string, _call: string, params: any) => { freezeCount++; return { workflowScript: 'return runs.run("review", {agent:"reviewer",task:"Review"})', definition: frozen, original: params.workflow, context: params.context, async: params.async }; } });
  return { owner, calls, freezeCount: () => freezeCount, setDefinition: (value: string) => { frozen = value; }, revoke: () => { current = false; }, loseCreate: () => { loseCreate = true; }, lastId: () => lastId, root };
}
it('freezes the original workflow target once and relays native schedule.create without a Pi session', async () => {
  const x = await setup(), input = { action: 'schedule.create', name: 'Evidence check', every: '6h', workflow: true, catchUp: 'latest', quiet: true };
  await x.owner.invoke('study', 'creation-session', 'stable-create', input); x.setDefinition('LATER_DEFINITION');
  await x.owner.invoke('study', 'creation-session', 'stable-create', input);
  const creates = x.calls.filter(row => row.input.action === 'create'); expect(creates).toHaveLength(1); expect(x.freezeCount()).toBe(1);
  expect(creates[0]).toMatchObject({ operation: 'schedules', project: 'study', session: 'creation-session', input: { trigger: { kind: 'interval', every: '6h', everyMs: 21600000 }, target: { definition: 'CREATION_DEFINITION' } } });
  await expect(x.owner.invoke('study', 'creation-session', 'stable-create', { ...input, every: '7h' })).rejects.toThrow('RESEARCH_SCHEDULE_OPERATION_CONFLICT');
});
it('rejects calendar fallback, removed raw carrier, cross-project cwd and revoked calls before native dispatch', async () => {
  const x = await setup();
  for (const input of [{ action: 'schedule.create', workflow: true, every: 'day' }, { action: 'schedule.create', workflow: true, every: '1m', timezone: 'UTC' }, { action: 'schedule.create', workflowScript: 'return 1', every: '1m' }, { action: 'schedule.create', workflow: true, every: '1m', cwd: 'C:/outside' }]) await expect(x.owner.invoke('study', 'creation-session', 'bad', input)).rejects.toThrow('RESEARCH_SCHEDULE_INPUT_INVALID');
  expect(x.calls).toHaveLength(0); x.revoke(); await expect(x.owner.invoke('study', 'creation-session', 'gone', { action: 'schedule.list' })).rejects.toThrow('RESEARCH_CONTEXT_REVOKED');
});
it('retains original panel paths and saved Session ownership while refusing budget-blocked run-now', async () => {
  const x = await setup();
  expect(fs.existsSync(new URL('../src/api/native-schedules.ts', import.meta.url)), 'original Automation routes are not implemented').toBe(true);
  const { registerNativeScheduleRoutes } = await import('../src/api/native-schedules.ts'); const { withActiveProject } = await import('../src/scope.ts');
  const app = Fastify(); app.addHook('onRequest', (_request, _reply, done) => withActiveProject('study', done));
  await registerNativeScheduleRoutes(app, { schedules: x.owner, context: async () => ({ projectId: 'study', sessionRef: 'project-session', hostBinding: {} }), current: () => true });
  try {
    expect((await app.inject({ method: 'GET', url: '/schedules' })).json()).toMatchObject({ heldByBudget: [], schedules: [{ ownerSessionId: 'creation-session' }] });
    const pause = await app.inject({ method: 'POST', url: '/schedules/33333333-3333-4333-8333-333333333333/pause' }); expect(pause.statusCode).toBe(200); expect(x.calls.find(row => row.input.action === 'pause')?.session).toBe('creation-session');
    expect((await app.inject({ method: 'POST', url: '/schedules/33333333-3333-4333-8333-333333333333/run' })).statusCode).toBe(402);
    expect((await app.inject({ method: 'POST', url: '/schedules/ensure-host' })).json()).toMatchObject({ ok: true, sessionId: 'project-session' });
    expect((await app.inject({ method: 'POST', url: '/schedules/not-owned/pause' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/schedules/a/invalid' })).statusCode).toBe(400);
  } finally { await app.close(); }
});
it('retains original authored schedule ids and bounded public workflow args without changing native operation identity', async () => {
  const x = await setup(), result = await x.owner.invoke('study', 'creation-session', 'custom-id', { action: 'schedule.create', id: 'qc-nightly', every: '1m', workflow: 'qc-workflow', args: { dataset: 'user_data/measurements.csv' } });
  expect(result.details).toMatchObject({ id: 'qc-nightly' }); expect(x.calls.find(row => row.input.action === 'create')?.input.alias).toBe('qc-nightly');
});
it('observes an uncertain native create after a lost response and never replays the create or freezer', async () => {
  const x = await setup(); x.loseCreate(); const input = { action: 'schedule.create', workflow: true, every: '1m' };
  await expect(x.owner.invoke('study', 'creation-session', 'lost-create', input)).rejects.toThrow('RESEARCH_TRANSPORT_DISCONNECTED');
  const result = await x.owner.invoke('study', 'creation-session', 'lost-create', input);
  expect(result.details).toMatchObject({ id: x.lastId() }); expect(x.calls.filter(row => row.input.action === 'create')).toHaveLength(1); expect(x.calls.filter(row => row.input.action === 'show')).toHaveLength(1); expect(x.freezeCount()).toBe(1);
});
it('rejects an accepted creation receipt whose saved native identity no longer matches its owner', async () => {
  const x = await setup(), input = { action: 'schedule.create', workflow: true, every: '1m' }; await x.owner.invoke('study', 'creation-session', 'corrupted-intent', input);
  const file = path.join(x.root, 'study', 'sandbox', '.kady', 'native-schedule-intents', x.lastId() + '.json'), saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.result.ownerSessionId = 'foreign-session'; fs.writeFileSync(file, JSON.stringify(saved));
  await expect(x.owner.invoke('study', 'creation-session', 'corrupted-intent', input)).rejects.toThrow('RESEARCH_SCHEDULE_INTENT_INVALID'); expect(x.calls.filter(row => row.input.action === 'create')).toHaveLength(1);
});
it('freezes scheduled execution as fresh and async even when a caller requests profile inheritance', async () => {
  const x = await setup(); await x.owner.invoke('study', 'creation-session', 'fresh-schedule', { action: 'schedule.create', workflow: true, every: '1m', context: 'profile' });
  expect(x.calls.find(row => row.input.action === 'create')?.input.target).toMatchObject({ context: 'fresh', async: true });
});
