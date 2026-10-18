import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { beforeAll, afterAll, expect, it, vi } from 'vitest'; import type { FastifyInstance } from 'fastify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-resources-'));
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No Pi agent initializer for native resource routes'); });
const token = 'a'.repeat(64), headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
let app: FastifyInstance;
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'native-global'));
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts'); const { registerEmbeddedResourceRoutes } = await import('../src/api/embedded-resources.ts');
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: app => registerEmbeddedResourceRoutes(app) });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { id: 'study', name: 'Study' } });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it('retains the original project prompt resources without a Pi agent or provider setup', async () => {
  const prompts = await app.inject({ method: 'GET', url: '/prompts', headers });
  expect(prompts.statusCode).toBe(200); expect(prompts.json().length).toBeGreaterThan(0);
});
it('lists original evidence packages and robustness/compute metadata without submitting a job', async () => {
  const packages = await app.inject({ method: 'GET', url: '/projects/study/notebook/evidence-packages', headers }); expect(packages.statusCode).toBe(200);
  const instances = await app.inject({ method: 'GET', url: '/modal/instances', headers }); expect(instances.statusCode).toBe(200); expect(instances.json().instances.length).toBeGreaterThan(0);
});
