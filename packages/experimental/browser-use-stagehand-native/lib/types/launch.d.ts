/** Own Chromium before CDP or Stagehand initialization can wait or fail. */
import type { NativeBrowserConfig } from './native.ts';
/** Chromium process and profile owned independently of the Stagehand Worker. */
export interface OwnedChromium {
    /** CDP endpoint reported by this exact process. */
    endpoint: string;
    /** Kill the owned process tree, await child close, and remove its profile. */
    close(): Promise<void>;
}
/**
 * Launch Chromium with scrubbed environment and OS-allocated debugging port.
 * @param config - executable, window visibility, and startup deadline.
 * @param signal - cancellation before the caller receives browser ownership.
 * @returns the owned browser after its debugging endpoint is ready.
 */
export declare function launchChromium(config: NativeBrowserConfig, signal: AbortSignal): Promise<OwnedChromium>;
//# sourceMappingURL=launch.d.ts.map