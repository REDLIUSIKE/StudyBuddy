/** Cordis research provider and stdio consumer for Main's sealed dsh profile. */
import { Context } from '@deepseek-ai/cordis';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
/** Validated resource paths supplied by Main; credentials are never profile fields. */
export declare const Config: z.ZodObject<{
    domainEntry: z.ZodString;
    staticDirectory: z.ZodString;
    pythonExecutable: z.ZodString;
}, z.core.$strict>;
/** Validated deployment configuration for the built research plugin. */
export type Config = z.infer<typeof Config>;
/** Launcher-owned services required before the research profile mounts. */
export declare const inject: string[];
/** Stable failures reported without echoing the credential-bearing input line. */
export declare class ResearchPluginError extends Error {
    readonly code: 'RESEARCH_BOOTSTRAP_INVALID' | 'RESEARCH_PLUGIN_STOPPED' | 'RESEARCH_MODULE_INVALID' | 'RESEARCH_LAUNCHER_REQUIRED';
    constructor(code: 'RESEARCH_BOOTSTRAP_INVALID' | 'RESEARCH_PLUGIN_STOPPED' | 'RESEARCH_MODULE_INVALID' | 'RESEARCH_LAUNCHER_REQUIRED', cause?: unknown);
}
/**
 * Mount the private stdio consumer and compiled research provider on one fiber.
 * EOF and I/O failure stop initialization, suppress readiness, await domain/Worker
 * cleanup, then release the channel and request launcher shutdown. Fiber disposal
 * cancels initialization immediately and joins the same cleanup. No operation is retried.
 * @param ctx - Owning plugin context with launcher readiness and exit services.
 * @param config - Absolute paths already admitted by Main's sealed profile.
 * @param input - Main's private stdin, beginning with exactly one bootstrap JSON line.
 * @param output - Existing private RPC stdout, also carrying the single ready message.
 * @returns After domain initialization and listen have completed, or cancellation settles.
 * @throws A startup failure after retaining cleanup ownership; malformed bootstrap omits parser text.
 */
export declare function mountResearchPlugin(ctx: Context, config: Config, input: Readable, output: Writable): Promise<void>;
/**
 * Load the built plugin under the ordinary dsh profile launcher.
 * @param ctx - Cordis plugin context with injected appReady and appExit.
 * @param config - Main's validated absolute resource paths.
 * @returns Initialization of the owned provider and private stdio consumer.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=research-plugin.d.ts.map