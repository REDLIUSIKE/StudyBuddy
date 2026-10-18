import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-workspace-'));
const token = 'a'.repeat(64), headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No Pi initializer for UI state'); });
let app: FastifyInstance;
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy');
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts'); const { registerEmbeddedWorkspaceRoutes } = await import('../src/api/embedded-workspace.ts');
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: app => registerEmbeddedWorkspaceRoutes(app, () => true) });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { name: 'Study', id: 'study' } });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const state = { schemaVersion: 1, view: 'notebook', treeOpen: true, treeWidth: 260, sandbox: { openPaths: ['paper.tex', 'study.csv'], activePath: 'paper.tex' } };
it('retains file tabs and pane state in the owned project with a strong edit precondition', async () => {
  const first = await app.inject({ method: 'GET', url: '/research/workspace', headers });
  expect(first.json().state).toBeNull();
  const saved = await app.inject({ method: 'PUT', url: '/research/workspace', headers: { ...headers, 'if-match': first.headers.etag }, payload: state });
  expect(saved.statusCode).toBe(200);
  const restored = await app.inject({ method: 'GET', url: '/research/workspace', headers }); expect(restored.json().state).toEqual(state);
  const stale = await app.inject({ method: 'PUT', url: '/research/workspace', headers: { ...headers, 'if-match': first.headers.etag }, payload: { ...state, treeWidth: 360 } });
  expect(stale.statusCode).toBe(412); expect((await app.inject({ method: 'GET', url: '/research/workspace', headers })).json().state).toEqual(state);
});
it('rejects traversal and model authority in saved UI state before writing', async () => {
  const current = await app.inject({ method: 'GET', url: '/research/workspace', headers });
  for (const payload of [{ ...state, model: 'forged' }, { ...state, sandbox: { openPaths: ['../private'], activePath: '../private' } }]) {
    expect((await app.inject({ method: 'PUT', url: '/research/workspace', headers: { ...headers, 'if-match': current.headers.etag }, payload })).statusCode).toBe(400);
  }
});
