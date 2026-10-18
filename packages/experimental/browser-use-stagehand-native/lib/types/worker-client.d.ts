/** Isolated Stagehand Workers own CDP connections; the host owns browser processes. */
import type { NativeBrowserConfig, NativeBrowserRuntime } from './native.ts';
/**
 * Connect Stagehand through an isolated Worker that receives no ambient environment.
 * @param config - resolved CDP connection and operation options.
 * @param signal - cancellation of lazy browser acquisition.
 * @param warn - report SDK cleanup failures after connection termination.
 * @returns a runtime whose close requires SDK request drainage before releasing ownership.
 */
export declare function openBrowserWorker(config: NativeBrowserConfig, signal: AbortSignal, warn: (message: string) => void): Promise<NativeBrowserRuntime>;
//# sourceMappingURL=worker-client.d.ts.map