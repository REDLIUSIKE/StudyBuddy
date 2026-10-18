import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-fleet-')); roots.push(root);
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.resetModules();
  const { NativeAdvancedWorkflows } = await import('../src/runtime/native-advanced.ts');
  const { writeProjectAgent } = await import('../src/agent/agent-files.ts'); const { resolvePaths } = await import('../src/projects.ts');
  const paths = resolvePaths('study'); fs.mkdirSync(paths.sandbox, { recursive: true });
  writeProjectAgent(paths, 'scientific-fixture', { description: 'Review', systemPrompt: 'Observed evidence', model: 'native/exact' });
  const receipts = new Map<string, any>();
  const request = vi.fn(async (_project: string, operation: string, input: any, _signal: AbortSignal, sessionId?: string) => {
    if (operation === 'journal-sessions') return { projectId: 'study', sessions: [{ id: 'session-owner', label: 'Research', parentSessionId: null }, { id: 'session-foreign', label: 'Other', parentSessionId: null }] };
    if (input.action === 'start') { const row = { operationId: input.operationId, nativeSessionId: 'session-child', parentSessionId: sessionId, state: 'running', selection: { provider: 'native', model: 'exact' } }; receipts.set(input.operationId, row); return row; }
    const row = receipts.get(input.operationId); if (!row || row.parentSessionId !== sessionId) throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND');
    if (input.action === 'cancel') { row.state = 'failed'; return { ...row }; }
    if (input.action === 'steer') return { accepted: true };
    if (input.action === 'transcript') return { nativeSessionId: row.nativeSessionId, text: 'observed journal', journal: { truncated: false } };
    return { ...row };
  });
  return { owner: new NativeAdvancedWorkflows({ current: () => true, request }), request, receipts };
}
it('observes native child status changes without starting a new child or inventing token counts', async () => {
  const x = await setup(); const started: any = await x.owner.specialist('study', 'session-owner', 'start-a', { action: 'start', agent: 'scientific-fixture', task: 'Review' });
  const sessions = await x.owner.fleetSessions('study'); expect(sessions.sessions.map((row: any) => row.id)).toEqual(['session-owner', 'session-foreign']);
  const running: any = await x.owner.fleet('study', 'session-owner'); expect(running.asyncSnapshot.runs[0]).toMatchObject({ id: started.operationId, label: 'scientific-fixture', state: 'running' });
  x.receipts.get(started.operationId).state = 'completed';
  const completed: any = await x.owner.fleet('study', 'session-owner'); expect(completed.asyncSnapshot.runs[0].state).toBe('completed'); expect(completed.fleet).toBeUndefined();
  expect(x.request.mock.calls.filter((row: any) => row[2]?.action === 'start')).toHaveLength(1);
});
it('routes original panel transcript, steer and stop only to that native parent operation', async () => {
  const x = await setup(); const started: any = await x.owner.specialist('study', 'session-owner', 'start-b', { action: 'start', agent: 'scientific-fixture', task: 'Review' });
  expect(await x.owner.fleetControl('study', 'session-owner', 'transcript-a', 'transcript', { runId: started.operationId })).toEqual({ text: 'observed journal' });
  await x.owner.fleetControl('study', 'session-owner', 'steer-a', 'steer', { runId: started.operationId, message: 'Use supplied measurements' });
  await expect(x.owner.fleetControl('study', 'session-foreign', 'foreign-a', 'stop', { runId: started.operationId })).rejects.toThrow('RESEARCH_SPECIALIST_RUN_DENIED');
  await x.owner.fleetControl('study', 'session-owner', 'stop-a', 'stop', { runId: started.operationId });
  expect(x.receipts.get(started.operationId).state).toBe('failed');
});
it('rejects fabricated parent, nested-run controls and empty resume instead of replaying a paid start', async () => {
  const x = await setup();
  await expect(x.owner.fleet('study', 'made-up-parent')).rejects.toThrow('RESEARCH_SPECIALIST_SESSION_DENIED');
  await expect(x.owner.fleetControl('study', 'session-owner', 'bad-a', 'stop', { runId: '11111111-1111-4111-8111-111111111111', index: 0 })).rejects.toThrow('RESEARCH_SPECIALIST_INPUT_INVALID');
  await expect(x.owner.fleetControl('study', 'session-owner', 'bad-b', 'resume', { runId: '11111111-1111-4111-8111-111111111111', message: '' })).rejects.toThrow('RESEARCH_SPECIALIST_INPUT_INVALID');
  expect(x.request.mock.calls.filter((row: any) => row[2]?.action === 'start')).toHaveLength(0);
});
