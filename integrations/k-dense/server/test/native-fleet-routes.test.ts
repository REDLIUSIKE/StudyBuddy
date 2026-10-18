import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No Pi initializer in native fleet panel'); });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-fleet-routes-')), token = 'a'.repeat(64);
const headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
let app: FastifyInstance, native: any, operationId: string;
const request = vi.fn(async (_project: string, operation: string, input: any, _signal: AbortSignal, session?: string) => {
  if (operation === 'journal-sessions') return { projectId: 'study', sessions: [{ id: 'parent', label: 'Original conversation' }] };
  return { operationId: input.operationId, nativeSessionId: 'child', parentSessionId: session, state: 'completed', text: 'Actual fixture journal' };
});
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy');
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts'); const { registerNativeFleetRoutes } = await import('../src/api/native-fleet.ts');
  const { NativeAdvancedWorkflows } = await import('../src/runtime/native-advanced.ts'); native = new NativeAdvancedWorkflows({ current: () => true, request });
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: app => registerNativeFleetRoutes(app, native) });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { id: 'study', name: 'Study' } });
  const { writeProjectAgent } = await import('../src/agent/agent-files.ts'); const { resolvePaths } = await import('../src/projects.ts');
  writeProjectAgent(resolvePaths('study'), 'native-fixture', { description: 'Review', systemPrompt: 'Observed data', model: 'exact/model' });
  const result: any = await native.specialist('study', 'parent', 'private-start', { action: 'start', agent: 'native-fixture', task: 'Review' }); operationId = result.operationId;
}, 30000);
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it('retains the upstream panel URLs and returns actual native results with no token estimates', async () => {
  const sessions = await app.inject({ method: 'GET', url: '/subagents/sessions', headers }); expect(sessions.statusCode).toBe(200); expect(sessions.json().sessions[0].id).toBe('parent');
  const fleet = await app.inject({ method: 'GET', url: '/sessions/parent/subagents', headers }); expect(fleet.statusCode).toBe(200); expect(fleet.json().asyncSnapshot.runs[0].state).toBe('completed'); expect(fleet.json().fleet).toBeUndefined();
  const transcript = await app.inject({ method: 'POST', url: '/sessions/parent/subagents/transcript', headers, payload: { runId: operationId } }); expect(transcript.statusCode).toBe(200); expect(transcript.json().text).toBe('Actual fixture journal');
  expect(request.mock.calls.filter((row: any) => row[2]?.action === 'start')).toHaveLength(1);
});
it('denies foreign parents and invalid control payloads before any new paid dispatch', async () => {
  const foreign = await app.inject({ method: 'POST', url: '/sessions/foreign/subagents/stop', headers, payload: { runId: operationId } }); expect(foreign.statusCode).toBe(403);
  const invalid = await app.inject({ method: 'POST', url: '/sessions/parent/subagents/resume', headers, payload: { runId: operationId, message: '' } }); expect(invalid.statusCode).toBe(400);
  const wrongOrigin = await app.inject({ method: 'GET', url: '/subagents/sessions', headers: { ...headers, origin: 'https://other.test' } }); expect(wrongOrigin.statusCode).toBe(403);
  expect(request.mock.calls.filter((row: any) => row[2]?.action === 'start')).toHaveLength(1);
});
