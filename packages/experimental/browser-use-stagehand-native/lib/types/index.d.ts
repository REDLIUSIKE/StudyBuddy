/**
 * Stagehand browser tools with one native browser runtime per live Session.
 * @module @deepseek-ai/dsh-experimental-browser-use-stagehand-native
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { StagehandModelConfig } from './native.ts';
/** Cordis identity for the native Stagehand provider. */
export declare const name = "experimental-browser-use-stagehand-native";
/** Browser, Agent, and tool services required before activation. */
export declare const inject: string[];
/** Profile-owned browser connection and independent Stagehand model credentials. */
export interface Config {
    /** Native Stagehand model and credentials; independent of the Session model. */
    model: StagehandModelConfig;
    /** Launch a fresh browser or attach to the configured existing endpoint. */
    mode: 'launch' | 'attach';
    /** CDP HTTP or WebSocket endpoint, required only for attach mode. */
    cdpEndpoint?: string;
    /** Optional Stagehand extension id for an existing browser. */
    extensionId?: string;
    /** Installed Chrome/Chromium executable used in launch mode. */
    executablePath?: string;
    /** Hide an owned browser's window. */
    headless?: boolean;
    /** Deadline for Chromium startup and Stagehand navigation/action operations. */
    operationTimeoutMs?: number;
    /** Grace for native SDK cleanup before its connection Worker is terminated. */
    shutdownGraceMs?: number;
}
type ResolvedConfig = Config & Required<Pick<Config, 'headless' | 'operationTimeoutMs' | 'shutdownGraceMs'>>;
/** Loader defaults and validation for explicit browser connection choices. */
export declare const Config: Schema<Config, ResolvedConfig>;
/**
 * Register native Stagehand tools and retain the provider reservation through cleanup.
 * Browser startup is lazy; attachment reserves its endpoint for one live Agent.
 * @param ctx - context providing browser registration, Agents, and tools.
 * @param input - profile-owned browser and native model configuration.
 */
export declare function apply(ctx: Context, input: Config): void;
export {};
//# sourceMappingURL=index.d.ts.map