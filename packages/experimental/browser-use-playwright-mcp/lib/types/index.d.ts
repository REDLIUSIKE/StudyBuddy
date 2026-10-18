/** Chromium browser tools from the pinned Playwright MCP server. @module */
import type { Context } from '@deepseek-ai/cordis';
import { BrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp';
/** Cordis identity for the Playwright MCP browser provider. */
export declare const name = "experimental-browser-use-playwright-mcp";
/** Services required for scoped MCP startup and prompt readiness checks. */
export declare const inject: string[];
/** Fixed Chromium launch or existing-browser attachment settings. */
export type Config = BrowserMcpConfig;
/** Validate the launch or attachment configuration before activation. */
export declare const Config: typeof BrowserMcpConfig;
/**
 * Expose Playwright's upstream tools in each live Session's scope.
 * The pinned npm server runs under the current Node executable; browser state is not persisted by DSH.
 * @param ctx - provider context supplying browser use, Agents, and tools.
 * @param config - validated browser choice and optional tool timeout.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map