/** Renderer gets closed actions and validated progress, never private diagnostic or file methods. */
import { type HarnessSupportApi } from '@studybuddy/contracts';
interface PreloadTransport {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (_event: unknown, value: unknown) => void): void;
    off(channel: string, listener: (_event: unknown, value: unknown) => void): void;
}
/** Assemble the app-only preload API; the caller enforces origin and main-frame exposure.
 * @param transport Electron's restricted IPC carrier.
 * @returns Support actions with no owner, token, path or arbitrary operation selector.
 */
export declare function createSupportPreload(transport: PreloadTransport): HarnessSupportApi;
export {};
//# sourceMappingURL=support-preload.d.ts.map