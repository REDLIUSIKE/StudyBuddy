/**
 * The engine behavior for each mods API call this bridge serves, mapped onto
 * harness services: commands and tools on the agent's scoped registries,
 * `ui.ask` on the user-questions answerer, files on `ctx.fs`, processes on
 * `ctx.subprocess`, the store on a storage domain, session facts on the
 * agent's Session and projections. A service a deployment did not compose
 * fails the call with the service name.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { LoadedMod } from './chain.ts';
import type { ModsEngine, OpTable } from './engine.ts';
import type { ToolNameAliases } from './tool-names.ts';
import type { SessionVersion, ToolCallResult } from './types.ts';
/** The binding every event of this bridge carries: the agent it belongs to, when one does. */
export interface AgentBinding {
    readonly agent: Agent | undefined;
}
/** The mods API version string `$.session.version()` reports. */
export declare const MODS_API_VERSION: SessionVersion;
/** Largest file `$.fs.read` returns and `$.fs.write` accepts, Claude Code's own limit. */
export declare const FS_MAX_BYTES: number;
/** Largest JSON a plugin's `$.store` holds in total, Claude Code's own limit. */
export declare const STORE_MAX_BYTES: number;
/** Largest response body `$.http.fetch` returns. */
export declare const HTTP_MAX_BYTES: number;
/**
 * Full name the model sees for a mod-registered tool: Claude Code's MCP-style spelling.
 * @param plugin - the registering plugin's name.
 * @param tool - the name the mod registered.
 * @returns `mcp__<plugin>__<tool>`.
 */
export declare function modToolName(plugin: string, tool: string): string;
/** Options the host op table is built from. */
export interface HostOpsOptions {
    readonly ctx: Context;
    readonly aliases: ToolNameAliases;
    /** Default `$.process.run` timeout in milliseconds. */
    readonly processTimeoutMs: number;
    /**
     * Disposers of registrations mods made, keyed by the session they were scoped to
     * (`''` for global ones), so bridge disposal undoes them and a disposed agent's
     * entries can be dropped.
     */
    readonly registrations: Map<string, Set<() => void>>;
    /** The mod that raised each in-flight `$.tool.call`, by call id, so the pipeline raises `tool.call` from it. */
    readonly callOrigins: Map<string, LoadedMod>;
    /** Names of commands mods registered, for `$.command.list` sources. */
    readonly modCommands: Set<string>;
    /** Full names of tools mods registered, whose calls a `tool.call` hook may answer with a successful result. */
    readonly modTools: Set<string>;
    /** Redraw a session's band after a `$.ui` call that changes what it shows; absent when no surface is drawn. */
    readonly redraw?: (sessionId: string) => void;
    /** Note a prompt a mod submitted, so the `prompt.submit` it raises carries the mod as its origin. */
    readonly submitted?: (messageId: string, mod: string) => void;
}
/**
 * Project one tool outcome onto Claude Code's `tool.call` result.
 * @param result - the harness tool outcome.
 * @returns its text as `result`, with `isError` on a failure.
 */
export declare function toolCallResultOf(result: ToolExecutionResult): ToolCallResult;
/**
 * Build the op table over the composed harness services.
 * @param options - the context, aliases, limits, and registration tracking.
 * @returns engine behaviors by event name.
 */
export declare function createHostOps(options: HostOpsOptions): OpTable<AgentBinding>;
export type { ModsEngine };
//# sourceMappingURL=host-ops.d.ts.map