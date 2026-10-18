/** Source-owned MCP configuration is carried privately to the native MCP provider. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as configModule from './mcp-file-formats.ts';
import * as values from './mcp-file-formats.ts';
import type { ProjectPaths } from '../projects.ts';
import { KADY_PI_AGENT_DIR } from '../config.ts';
import { assertResearchPath } from './project-storage.ts';
import { mcpNamespace } from '../agent/mcp.ts';
interface Source { name: string; scope: 'project' | 'global'; config: Record<string, unknown> }
export interface NativeConnector { name: string; scope: 'project' | 'global'; state: 'ready' | 'disabled' | 'unavailable'; reason?: string; config?: Record<string, unknown> }
/** Use the pinned upstream pure config/credential-value readers, without a ModelRuntime/AgentSession. */
export async function nativeMcpCatalog(paths: ProjectPaths, agentDir = KADY_PI_AGENT_DIR): Promise<{ connectors: NativeConnector[]; autoEnableCodemode: boolean; errors: string[] }> {
  for (const file of [path.join(agentDir, 'mcp.json'), path.join(agentDir, 'mcp-auth.json'), path.join(paths.sandbox, '.pi/mcp.json')]) assertResearchPath(file);
  const source = configModule.loadMcpConfig({ agentDir, cwd: paths.sandbox, projectTrusted: true });
  if (source.servers.length > 128) throw Error('RESEARCH_MCP_LIMIT_REACHED');
  let oauth: Record<string, unknown> = {};
  try { const stored = JSON.parse(fs.readFileSync(path.join(agentDir, 'mcp-auth.json'), 'utf8')); if (stored && typeof stored === 'object' && !Array.isArray(stored)) oauth = stored; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('RESEARCH_MCP_AUTH_STORE_INVALID'); }
  const connectors: NativeConnector[] = source.servers.map(({ name, scope, config }) => {
    const base = { name, scope };
    if (config.enabled === false) return { ...base, state: 'disabled' };
    if (config.auth !== undefined) return { ...base, state: 'unavailable', reason: 'MCP_PROVIDER_AUTH_UNAVAILABLE' };
    const namespace = name.replaceAll('-', '_'), serverName = namespace.length <= 32 ? namespace : `${namespace.slice(0, 19)}_${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
    try {
      const environment = (config.env ?? {}) as Record<string, string>;
      if (!environment || typeof environment !== 'object' || Array.isArray(environment) || Object.values(environment).some(value => typeof value !== 'string')) throw Error('MCP_ENV_INVALID');
      const shared = { serverName, exposure: config.exposure ?? 'codemode', ...(config.toolExposure ? { toolExposure: config.toolExposure } : {}), toolCallTimeoutMs: typeof config.timeout === 'number' ? Math.min(config.timeout * 1000, 2147483647) : 60000, failOnStartupError: true };
      if (typeof config.url === 'string') {
        const url = values.resolveConfigValueOrThrow(config.url, 'MCP endpoint', environment), headers = values.resolveHeadersOrThrow(config.headers ?? {}, 'MCP headers', environment);
        if (!Object.keys(headers).some(key => key.toLowerCase() === 'authorization')) {
          const key = String(new URL(url)), state = (oauth[`${mcpNamespace(name)}|${key}`] ?? oauth[key]) as { tokens?: { access_token?: unknown }; tokensExpireAt?: number } | undefined;
          if (state?.tokens?.access_token) {
            if (state.tokensExpireAt !== undefined && state.tokensExpireAt <= Date.now()) return { ...base, state: 'unavailable', reason: 'MCP_SIGN_IN_REQUIRED' };
            if (typeof state.tokens.access_token !== 'string') throw Error('MCP_AUTH_INVALID'); headers.Authorization = `Bearer ${state.tokens.access_token}`;
          }
        }
        return { ...base, state: 'ready', config: { ...shared, transport: 'streamable-http', url, headers } };
      }
      const env = Object.fromEntries(Object.entries((config.env ?? {}) as Record<string, string>).map(([key, value]) => [key, values.resolveConfigValueOrThrow(value, 'MCP environment')]));
      return { ...base, state: 'ready', config: { ...shared, transport: 'stdio', command: values.resolveConfigValueOrThrow(String(config.command), 'MCP command', environment), args: (config.args ?? []) as string[], env, cwd: typeof config.cwd === 'string' ? path.resolve(paths.sandbox, config.cwd) : paths.sandbox } };
    } catch { return { ...base, state: 'unavailable', reason: 'MCP_CONFIGURATION_UNAVAILABLE' }; }
  });
  return { connectors, autoEnableCodemode: source.autoEnableCodemode ?? true, errors: source.errors.map(() => 'MCP_CONFIGURATION_INVALID') };
}
