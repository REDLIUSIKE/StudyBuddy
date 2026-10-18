/**
 * Exclusive computer use through an installed Cua Driver MCP executable.
 * The MCP client owns discovery, execution, image admission, and reconnection.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
/** Cordis plugin identity for the installed Cua Driver provider. */
export declare const name = "experimental-computer-use-cua-driver-mcp";
/** The shared reservation and tool registry must exist before connection. */
export declare const inject: string[];
/** Installed executable and MCP connection overrides. */
export interface Config {
    /** Executable path or PATH command; defaults to `cua-driver`. */
    command: string;
    /** Arguments passed without a shell; defaults to `['mcp']`. */
    args: string[];
    /** Per-call timeout in milliseconds; omission uses the MCP client's default. */
    toolCallTimeoutMs?: number;
    /** Reconnection overrides; defaults to the MCP client's policy. */
    reconnect: McpClient.ReconnectConfig;
}
/** Validate executable options; the MCP client resolves connection defaults. */
export declare const Config: z<Partial<Config>, Config>;
/**
 * Reserve computer use and activate the installed Cua Driver's MCP tools.
 * Initial connection or discovery failure rejects activation and rolls back.
 * Disposal retains the reservation until the MCP child has finished teardown.
 * @param ctx - context providing computer use and the tool registry.
 * @param config - validated executable options and optional connection overrides.
 * @returns initial MCP tool-discovery completion.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map