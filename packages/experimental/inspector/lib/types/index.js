/** Repository-facing Host package entry over the mirrored implementation tree. */
import z from '@deepseek-ai/schemastery';
import { apply as applyHost, } from "./host/plugin.js";
import { resolveInspectorOptions } from "./host/bridge/controller.js";
export { resolveInspectorOptions, startInspector } from "./host/plugin.js";
/** Cordis plugin name shared with the Client face. */
export const name = 'experimental-inspector';
/** Web Host and authenticated browser bootstrap transport. */
export const inject = ['webServer', 'connection'];
const libraryDefaults = resolveInspectorOptions();
/** Runtime validation for {@link Config}. */
export const Config = z.object({
    host: z.const('127.0.0.1').default('127.0.0.1'),
    port: z.natural().max(65_535).default(9_230),
    clientOrigins: z.array(z.string()).default([]),
    captureFetch: z.boolean().default(true),
    maxRequestBodyBytes: z.natural().min(1).default(libraryDefaults.maxRequestBodyBytes),
    maxResponseBodyBytes: z.natural().min(1).default(libraryDefaults.maxResponseBodyBytes),
    maxBodyChunkBytes: z.natural().min(1).default(libraryDefaults.maxBodyChunkBytes),
    maxJournalBytes: z.natural().min(1).default(libraryDefaults.maxJournalBytes),
    maxRetainedRequests: z.natural().min(1).default(libraryDefaults.maxRetainedRequests),
    maxSourceFrameBytes: z.natural().min(1).default(libraryDefaults.maxSourceFrameBytes),
    maxSourceRecordsPerFrame: z.natural().min(1).default(libraryDefaults.maxSourceRecordsPerFrame),
    maxQueuedRecords: z.natural().min(1).default(libraryDefaults.maxQueuedRecords),
    maxQueuedBytes: z.natural().min(1).default(libraryDefaults.maxQueuedBytes),
    startupTimeoutMs: z.natural().min(1).default(libraryDefaults.startupTimeoutMs),
    stopTimeoutMs: z.natural().min(1).default(libraryDefaults.stopTimeoutMs),
    clientReconnectBaseMs: z.natural().min(1).default(libraryDefaults.clientReconnectBaseMs),
    clientReconnectMaxMs: z.natural().min(1).default(libraryDefaults.clientReconnectMaxMs),
    clientRuntimeTimeoutMs: z.natural().min(1).default(libraryDefaults.clientRuntimeTimeoutMs),
    queryTimeoutMs: z.natural().min(1).default(libraryDefaults.queryTimeoutMs),
    maxClientRuntimeObjects: z.natural().min(1).default(libraryDefaults.maxClientRuntimeObjects),
    maxClientRuntimeProperties: z.natural().min(1).default(libraryDefaults.maxClientRuntimeProperties),
    maxClientSourceBytes: z.natural().min(1).default(libraryDefaults.maxClientSourceBytes),
    maxCordisNodes: z.natural().min(1).default(libraryDefaults.maxCordisNodes),
    maxDisconnectedCordisTrees: z.natural().default(libraryDefaults.maxDisconnectedCordisTrees),
});
/**
 * Start inspection when enabled; the hidden --inspect flag also opens the Host debugging window.
 * @param ctx - Host Cordis plugin context.
 * @param config - Validated Inspector configuration.
 */
export async function apply(ctx, config) {
    await applyHost(ctx, config);
}
//# sourceMappingURL=index.js.map