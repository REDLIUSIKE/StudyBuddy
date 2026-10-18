/** File/definition operations only. These do not initialize a provider, CLI,
 * SessionManager, or ModelRuntime. Tool definition is Pi 1.0.0's identity
 * helper; its compile-time type remains the exact SDK type. */
import type { defineTool as sdkDefineTool } from '@earendil-works/pi-coding-agent';
import os from 'node:os';
import path from 'node:path';
import { normalizePath } from './formats/paths.js';
export const defineTool = ((tool: unknown) => tool) as typeof sdkDefineTool;
export const getAgentDir = () => process.env.PI_CODING_AGENT_DIR ? normalizePath(process.env.PI_CODING_AGENT_DIR) : path.join(os.homedir(), '.pi', 'agent');
