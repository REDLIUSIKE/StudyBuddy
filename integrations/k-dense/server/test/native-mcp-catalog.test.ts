import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { nativeMcpCatalog } from '../src/runtime/native-mcp-catalog.ts';
const roots: string[] = []; afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.unstubAllEnvs(); });
it('retains project override and exposure semantics and resolves independent headers only in the private catalog', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mcp-catalog-')); roots.push(root);
  const agentDir = path.join(root, 'native-adapters'), cwd = path.join(root, 'sandbox'); fs.mkdirSync(agentDir); fs.mkdirSync(path.join(cwd, '.pi'), { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ autoEnableCodemode: false, mcpServers: { literature: { url: 'https://example.invalid/global', exposure: 'direct' } } }));
  fs.writeFileSync(path.join(cwd, '.pi/mcp.json'), JSON.stringify({ mcpServers: { literature: { url: 'https://example.invalid/project', headers: { 'X-API-Key': '${PAPERCLIP_API_KEY}' }, exposure: 'codemode', toolExposure: { lookup: 'direct' } } } }));
  vi.stubEnv('PAPERCLIP_API_KEY', 'fixture-independent-secret');
  const catalog = await nativeMcpCatalog({ sandbox: cwd } as never, agentDir);
  expect(catalog.autoEnableCodemode).toBe(false); expect(catalog.connectors).toHaveLength(1);
  expect(catalog.connectors[0]).toMatchObject({ name: 'literature', scope: 'project', state: 'ready', config: { transport: 'streamable-http', url: 'https://example.invalid/project', headers: { 'X-API-Key': 'fixture-independent-secret' }, exposure: 'codemode', toolExposure: { lookup: 'direct' } } });
});
it('retains disabled and unavailable connectors without substituting model credentials', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mcp-catalog-')); roots.push(root); const cwd = path.join(root, 'sandbox'); fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(root, 'mcp.json'), JSON.stringify({ mcpServers: { radius: { url: 'https://example.invalid/mcp', auth: { provider: 'radius' } }, disabled: { command: 'node', enabled: false } } }));
  const catalog = await nativeMcpCatalog({ sandbox: cwd } as never, root);
  expect(catalog.connectors.find(row => row.name === 'radius')).toMatchObject({ state: 'unavailable', reason: 'MCP_PROVIDER_AUTH_UNAVAILABLE' });
  expect(catalog.connectors.find(row => row.name === 'disabled')).toMatchObject({ state: 'disabled' });
});
