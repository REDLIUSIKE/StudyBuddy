import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

const temporary: string[] = [];
const domains: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(domains.splice(0).map(domain => domain.close()));
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.resetModules();
}, 15_000);
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-domain-')); temporary.push(directory);
  const web = path.join(directory, 'web'); fs.mkdirSync(path.join(web, 'office'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><p>Research fixture</p>');
  fs.writeFileSync(path.join(web, 'office', 'runtime.html'), '<!doctype html><p>Office fixture</p>');
  let live = true;
  const channel = { current: () => live, request: async () => { throw Error('Unexpected native request'); }, async *events() {} };
  return { options: { projectsRoot: path.join(directory, 'projects'), staticDirectory: web, guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64), channel }, revoke: () => { live = false; } };
}
async function create(options: ReturnType<typeof fixture>['options']) {
  const module = await import('../src/research-domain.ts');
  const domain = await module.createEmbeddedResearchDomain(options); domains.push(domain); return domain;
}
test('the new domain serves admitted static/API requests and rejects crossed origin or revoked authority', async () => {
  const { options, revoke } = fixture(), domain = await create(options), { origin } = await domain.start();
  const headers = { 'x-studybuddy-research-guest': options.guestAuthorization };
  expect(await (await fetch(origin, { headers })).text()).toContain('Research fixture');
  expect(await (await fetch(origin + '/api/health', { headers })).json()).toEqual({ status: 'ok', runtimeProfile: 'studybuddy' });
  expect((await fetch(origin)).status).toBe(403);
  expect((await fetch(origin, { headers: { ...headers, Origin: 'https://example.invalid' } })).status).toBe(403);
  expect((await fetch(origin + '/private.json', { headers })).status).toBe(404);
  revoke(); expect((await fetch(origin, { headers })).status).toBe(403);
}, 15_000);
test('Office keeps document isolation and only allowlisted runtime resources can be requested', async () => {
  const { options } = fixture(), domain = await create(options), { origin } = await domain.start();
  const headers = { 'x-studybuddy-research-guest': options.guestAuthorization };
  for (const route of ['/office?path=paper.docx&project=test', '/office/runtime.html']) {
    const response = await fetch(origin + route, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
  }
  expect((await fetch(origin + '/office/missing.html', { headers })).status).toBe(404);
  expect((await fetch(origin + '/office-assets/not-approved/soffice.js', { headers })).status).toBe(404);
  expect((await fetch(origin + '/office-assets/zeta-2025-05-13/not-approved.js', { headers })).status).toBe(404);
});
test('root identity is immutable in one process and close is idempotent and forbids late start', async () => {
  const { options } = fixture(), domain = await create(options);
  const python = process.env.KADY_PYTHON;
  await expect(create({ ...options, projectsRoot: path.join(path.dirname(options.projectsRoot), 'another-account') })).rejects.toThrow('RESEARCH_DOMAIN_ROOT_CONFLICT');
  const module = await import('../src/research-domain.ts');
  await expect(module.createEmbeddedResearchDomain({ ...options, projectsRoot: path.join(path.dirname(options.projectsRoot), 'another-account'), pythonExecutable: process.execPath })).rejects.toThrow('RESEARCH_DOMAIN_ROOT_CONFLICT');
  expect(process.env.KADY_PYTHON).toBe(python);
  await domain.close(); await domain.close();
  await expect(domain.start()).rejects.toThrow('RESEARCH_DOMAIN_CLOSED');
});
test('a cancelled bootstrap never binds a listener', async () => {
  const { options } = fixture(), controller = new AbortController(); controller.abort();
  const module = await import('../src/research-domain.ts');
  await expect(module.createEmbeddedResearchDomain({ ...options, signal: controller.signal })).rejects.toThrow();
});
test('closing during listen awaits the late bind and releases the loopback listener', async () => {
  const { options } = fixture(), domain = await create(options);
  const listeners = () => process.getActiveResourcesInfo().filter(name => name === 'TCPServerWrap').length;
  await vi.waitFor(() => expect(listeners()).toBe(0), { timeout: 1000, interval: 10 });
  const before = listeners(), starting = domain.start(); void starting.catch(() => {});
  await domain.close(); await expect(starting).rejects.toThrow('RESEARCH_DOMAIN_CLOSED');
  await vi.waitFor(() => expect(listeners()).toBe(before), { timeout: 1000, interval: 10 });
});
test('static resource junctions cannot escape the admitted distribution', async () => {
  const { options } = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'research-static-outside-')); temporary.push(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'Outside bytes'); fs.mkdirSync(path.join(options.staticDirectory, 'brand'));
  fs.symlinkSync(outside, path.join(options.staticDirectory, 'brand', 'escape'), 'junction');
  const domain = await create(options), { origin } = await domain.start();
  const response = await fetch(origin + '/brand/escape/secret.txt', { headers: { 'x-studybuddy-research-guest': options.guestAuthorization } });
  expect(response.status).toBe(403); expect(await response.text()).not.toContain('Outside bytes');
});
test('a trusted shared Python must be an absolute ordinary executable', async () => {
  const { options } = fixture(), module = await import('../src/research-domain.ts');
  await expect(module.createEmbeddedResearchDomain({ ...options, pythonExecutable: 'python.exe' })).rejects.toThrow('RESEARCH_PYTHON_EXECUTABLE_INVALID');
});
