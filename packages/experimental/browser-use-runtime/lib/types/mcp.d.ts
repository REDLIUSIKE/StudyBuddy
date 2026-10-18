/** Session-owned MCP browser processes and provider catalog activation. @module */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
/** Browser launch settings shared by the MCP integrations. */
export interface BrowserMcpLaunchConfig {
    /** Launch a new isolated Chromium browser for each live Session. */
    mode: 'launch';
    /** Whether Chromium runs without a visible window; defaults to true. */
    headless: boolean;
    /** Chromium executable; omission uses the upstream server's installation discovery. */
    executablePath?: string;
    /** Per-call timeout override in milliseconds; omission uses the MCP client default. */
    toolCallTimeoutMs?: number;
}
/** Attachment to an externally owned Chromium browser. */
export interface BrowserMcpAttachConfig {
    /** Exclusively attach one live Session to the configured browser. */
    mode: 'attach';
    /** HTTP(S) debugging URL or WS(S) browser debugging endpoint. */
    endpoint: string;
    /** Per-call timeout override in milliseconds; omission uses the MCP client default. */
    toolCallTimeoutMs?: number;
}
/** Fixed launch or attachment choice for one MCP browser provider. */
export type BrowserMcpConfig = BrowserMcpLaunchConfig | BrowserMcpAttachConfig;
/** Validate the browser mode before the provider reserves browser use. */
export declare const BrowserMcpConfig: Schema<BrowserMcpAttachConfig | (Omit<BrowserMcpLaunchConfig, 'headless'> & {
    headless?: boolean;
}), BrowserMcpConfig>;
/**
 * Reject an invalid debugging endpoint before acquiring provider or browser resources.
 * @param config - schema-validated browser selection.
 */
export declare function validateBrowserMcpConfig(config: BrowserMcpConfig): void;
/** Provider-owned connection options for one live Session. */
export interface SessionMcpOptions {
    /** Provider identity and MCP tool namespace. */
    name: string;
    /** Whether another live Session must wait for the attached browser to be released. */
    exclusive: boolean;
    /** Executable used to start the installed MCP server. */
    command: string;
    /** Arguments passed directly without a shell. */
    args: string[];
    /** Explicit overrides merged into the MCP client's scrubbed child environment. */
    env?: Record<string, string>;
    /** Per-call timeout override; omission retains the MCP client default. */
    toolCallTimeoutMs?: number;
}
/**
 * Await one MCP client during each future Agent's creation.
 * A busy attachment leaves that activation without browser tools; its other turns continue.
 * Calls are serialized per Session; unload closes every server before releasing registration.
 * @param ctx - provider context supplying browser use, Agents, tools, prompt assembly, and working directories.
 * @param options - provider identity, attachment exclusivity, and executable configuration.
 * @throws when the working-directory provider is absent, before browser resources are registered.
 */
export declare function mountSessionMcp(ctx: Context, options: SessionMcpOptions): void;
//# sourceMappingURL=mcp.d.ts.map