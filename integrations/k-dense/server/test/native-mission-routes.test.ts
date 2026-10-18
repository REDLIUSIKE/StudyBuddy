import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No Pi initializer in native mission routes'); });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mission-routes-'));
const token = 'a'.repeat(64), tool = 'b'.repeat(64);
const headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
let app: FastifyInstance, missionId: string;
const bind = vi.fn(async () => ({ projectId: 'study', sessionRef: 'native-parent', hostBinding: {} }));
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy');
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts');
  const { NativeResearchMissions } = await import('../src/runtime/native-missions.ts');
  const { registerNativeMissionRoutes } = await import('../src/api/native-missions.ts');
  const { registerEmbeddedToolRoutes } = await import('../src/api/embedded-tools.ts');
  const missions = new NativeResearchMissions({ current: () => true, inspect: async () => { throw Error('No model dispatch'); } });
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: async app => {
    await registerNativeMissionRoutes(app, { missions, current: () => true, context: bind });
    await registerEmbeddedToolRoutes(app, { authorization: tool, current: () => true, context: bind, missions });
  } });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { id: 'study', name: 'Study' } });
}, 30000);
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it('keeps mission tool creation private and returns original records in the automation panel', async () => {
  const catalog = await app.inject({ method: 'POST', url: '/research/tools/catalog', headers: { ...headers, 'x-studybuddy-research-tool': tool }, payload: { toolCallId: 'catalog-a', sessionId: 'native-parent', record: {} } });
  expect(catalog.statusCode).toBe(200);
  expect(catalog.json().tools.map((row: { name: string }) => row.name)).toContain('research_mission');
  const body = { sessionId: 'native-parent', toolCallId: 'mission-create-a', record: { name: 'research_mission', arguments: { action: 'mission.create', mission: { title: 'Observed research' } } } };
  const denied = await app.inject({ method: 'POST', url: '/research/tools/advanced', headers, payload: body });
  expect(denied.statusCode).toBe(403);
  const created = await app.inject({ method: 'POST', url: '/research/tools/advanced', headers: { ...headers, 'x-studybuddy-research-tool': tool }, payload: body });
  expect(created.statusCode).toBe(200); missionId = created.json().details.missionId;
  const listed = await app.inject({ method: 'GET', url: '/missions', headers });
  expect(listed.statusCode).toBe(200);
  expect(listed.json().missions).toEqual([expect.objectContaining({ id: missionId, title: 'Observed research', ownerSessionId: 'native-parent' })]);
  expect(bind).not.toHaveBeenCalled();
});
it('closes only the admitted project record and keeps reads independent of native activation', async () => {
  const created = await app.inject({ method: 'POST', url: '/research/tools/advanced', headers: { ...headers, 'x-studybuddy-research-tool': tool }, payload: { sessionId: 'native-parent', toolCallId: 'mission-close-fixture', record: { name: 'research_mission', arguments: { action: 'mission.create', mission: { title: 'Close fixture' } } } } });
  expect(created.statusCode).toBe(200); const missionId = created.json().details.missionId;
  const invalid = await app.inject({ method: 'POST', url: `/missions/${missionId}/close`, headers, payload: { status: 'invented' } });
  expect(invalid.statusCode).toBe(400);
  const closed = await app.inject({ method: 'POST', url: `/missions/${missionId}/close`, headers, payload: {} });
  expect(closed.statusCode).toBe(200); expect(closed.json().missions.find((row: { id: string }) => row.id === missionId).status).toBe('cancelled');
  expect(bind).toHaveBeenCalledOnce();
  const foreign = await app.inject({ method: 'GET', url: '/missions', headers: { ...headers, 'x-project-id': 'other' } });
  expect(foreign.statusCode).toBe(404);
});
