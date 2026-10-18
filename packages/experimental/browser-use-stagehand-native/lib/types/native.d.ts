/** Native Stagehand operations run inside one isolated browser Worker. */
import type { ModelConfig } from '@browserbasehq/stagehand';
import { z } from 'zod';
/** Profile-owned model settings accepted by the pinned Stagehand SDK. */
export interface StagehandModelConfig {
    /** Provider-prefixed model name from Stagehand's supported model catalog. */
    modelName: ModelConfig['modelName'];
    /** Explicit API key sent to Stagehand's browser extension. */
    apiKey: string;
    /** Additional headers sent with the extension's model requests. */
    headers?: Record<string, string>;
}
/** Explicit credentials for one model supported by the pinned Stagehand SDK. */
export declare const stagehandModelSchema: z.ZodPipe<z.ZodObject<{
    modelName: z.ZodString;
    apiKey: z.ZodString;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strict>, z.ZodTransform<StagehandModelConfig, {
    modelName: string;
    apiKey: string;
    headers?: Record<string, string> | undefined;
}>>;
/** Resolved browser options accepted by the native runtime and attachment worker. */
export interface NativeBrowserConfig {
    /** Explicit model credentials passed to Stagehand's browser extension. */
    model: StagehandModelConfig;
    /** Whether the runtime owns Chromium or only its connection. */
    mode: 'launch' | 'attach';
    /** Existing browser's configured debugging endpoint. */
    cdpEndpoint?: string;
    /** Optional existing Stagehand extension id. */
    extensionId?: string;
    /** Executable selected for an owned Chromium instance. */
    executablePath?: string;
    /** Whether to hide an owned browser's window. */
    headless: boolean;
    /** Deadline for Chromium startup, navigation, and natural-language actions. */
    operationTimeoutMs: number;
    /** Time allowed for attachment-worker shutdown before terminating it. */
    shutdownGraceMs: number;
}
/** Model and worker requests share the same validated browser arguments. */
export declare const browserInputs: {
    navigate: z.ZodObject<{
        url: z.ZodURL;
        pageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    tabs: z.ZodDiscriminatedUnion<[z.ZodObject<{
        action: z.ZodLiteral<"list">;
    }, z.core.$strict>, z.ZodObject<{
        action: z.ZodLiteral<"new">;
        url: z.ZodOptional<z.ZodURL>;
    }, z.core.$strict>, z.ZodObject<{
        action: z.ZodEnum<{
            select: "select";
            close: "close";
        }>;
        pageId: z.ZodString;
    }, z.core.$strict>], "action">;
    screenshot: z.ZodObject<{
        fullPage: z.ZodDefault<z.ZodBoolean>;
        pageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    act: z.ZodObject<{
        instruction: z.ZodString;
        pageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    observe: z.ZodObject<{
        instruction: z.ZodString;
        pageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    extract: z.ZodObject<{
        instruction: z.ZodString;
        schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodJSONSchema>>;
        pageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
};
/** Closed set of native browser operations. */
export type BrowserMethod = keyof typeof browserInputs;
/** SDK requests did not drain before their connection Worker terminated. */
export declare class StagehandDrainError extends Error {
}
/** Native browser operations and SDK cleanup owned by one live Session. */
export interface NativeBrowserRuntime {
    /**
     * Execute one operation after validating its tool or worker arguments.
     * @param method - supported browser operation.
     * @param args - untrusted JSON arguments.
     * @param signal - host-side cancellation; closes the Worker connection when supplied.
     * @returns a canonicalizable MCP result with text or screenshot content.
     */
    execute(method: BrowserMethod, args: unknown, signal?: AbortSignal): Promise<unknown>;
    /** Release Stagehand state before Worker termination disconnects CDP. */
    close(): Promise<void>;
}
/**
 * Open the pinned SDK using its public initialization and native model configuration.
 * The host owns launched Chromium separately; this Worker owns only its CDP connection.
 * @param config - resolved profile-owned browser options.
 * @returns the native operation runtime after initialization completes.
 */
export declare function openNativeBrowser(config: NativeBrowserConfig): Promise<NativeBrowserRuntime>;
//# sourceMappingURL=native.d.ts.map