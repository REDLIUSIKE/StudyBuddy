/** Chromium inspection and automation through the pinned Chrome DevTools MCP server. @module */
import type { Context } from '@deepseek-ai/cordis';
import { BrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp';
/** Cordis identity for the Chrome DevTools MCP browser provider. */
export declare const name = "experimental-browser-use-chrome-devtools-mcp";
/** Services required for scoped MCP startup and prompt readiness checks. */
export declare const inject: string[];
/** Fixed Chromium launch or existing-browser attachment settings. */
export type Config = BrowserMcpConfig;
/** Validate the launch or attachment configuration before activation. */
export declare const Config: typeof BrowserMcpConfig;
/**
 * Expose Chrome DevTools' upstream catalog through one MCP process per live Session.
 * Attached browsers remain externally owned; the server disables usage statistics.
 * @param ctx - provider context supplying browser use, Agents, and tools.
 * @param config - validated browser choice and optional tool timeout.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map