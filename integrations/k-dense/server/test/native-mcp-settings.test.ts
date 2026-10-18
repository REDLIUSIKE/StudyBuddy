import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { beforeAll, afterAll, expect, it, vi } from 'vitest'; import type { FastifyInstance } from 'fastify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mcp-settings-'));
vi.mock('../src/agent/session-registry.ts', () => { throw Error('No model runtime for native connector settings'); });
const token = 'a'.repeat(64), headers = { host: '127.0.0.1:42813', origin: 'http://127.0.0.1:42813', 'x-studybuddy-research-guest': token, 'x-project-id': 'study' };
let app: FastifyInstance;
beforeAll(async () => {
  vi.stubEnv('KADY_PROJECTS_ROOT', root); vi.stubEnv('KADY_RUNTIME_PROFILE', 'studybuddy'); vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'native-global'));
  const { buildEmbeddedApp } = await import('../src/bootstrap-embedded.ts'), { registerMcpRoutes } = await import('../src/api/mcp.ts');
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true, registerFeatures: app => registerMcpRoutes(app, { providerSignedIn: async () => false }) });
  await app.inject({ method: 'POST', url: '/projects', headers, payload: { id: 'study', name: 'Study' } });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it('preserves connector exposure choices, unknown options and project/global overrides without a model initializer', async () => {
  const config = { url: 'https://example.invalid/mcp', exposure: 'codemode', toolExposure: { lookup: 'direct' }, futureOptions: { retained: true } };
  const saved = await app.inject({ method: 'PUT', url: '/mcp?scope=project', headers, payload: { mcpServers: { literature: config } } }); expect(saved.statusCode).toBe(200);
  const read = await app.inject({ method: 'GET', url: '/mcp?scope=project', headers }); expect(read.json().mcpServers.literature).toEqual(config);
});
it('does not substitute a gateway model credential for an independent connector OAuth identity', async () => {
  const radius = await app.inject({ method: 'POST', url: '/mcp/radius', headers }); expect(radius.statusCode).toBe(409);
  const providers = await app.inject({ method: 'GET', url: '/mcp/auth-providers', headers }); expect(providers.statusCode).toBe(200);
  expect(providers.json().providers.every((provider: { connected: boolean }) => provider.connected === false)).toBe(true);
});
