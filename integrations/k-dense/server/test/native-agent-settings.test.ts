import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { beforeAll, afterAll, expect, it, vi } from 'vitest'; import type { FastifyInstance } from 'fastify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-agent-settings-'));
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No Pi agent initializer in native settings'); });
const token = 'a'.repeat(64), headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
let app: FastifyInstance;
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'native-global'));
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts'), { registerAgentRoutes } = await import('../src/api/agents.ts');
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: app => registerAgentRoutes(app, {
    models: { available: ref => ref === 'owned-route/exact-model', refresh: async () => {}, require: async ref => { if (ref !== 'owned-route/exact-model') throw Error('RESEARCH_MODEL_UNAVAILABLE'); } },
  }) });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { id: 'study', name: 'Study' } });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it('retains original specialists, memory definitions and watchdog settings in native mode', async () => {
  const agents = await app.inject({ method: 'GET', url: '/agents', headers }); expect(agents.statusCode).toBe(200); expect(agents.json().agents.length).toBeGreaterThan(0);
  const watchdog = await app.inject({ method: 'GET', url: '/watchdog', headers }); expect(watchdog.statusCode).toBe(200);
});
it('accepts the exact native directory row and rejects unknown model choices before changing settings', async () => {
  const valid = await app.inject({ method: 'PUT', url: '/agents/defaults', headers, payload: { defaultModel: 'owned-route/exact-model' } }); expect(valid.statusCode).toBe(200);
  const invalid = await app.inject({ method: 'PUT', url: '/agents/defaults', headers, payload: { defaultModel: 'another-route/exact-model' } }); expect(invalid.statusCode).toBe(400);
  const read = await app.inject({ method: 'GET', url: '/agents/defaults', headers }); expect(read.json().defaultModel).toBe('owned-route/exact-model');
});
