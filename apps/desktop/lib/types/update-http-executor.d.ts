/** Electron-native inactivity deadlines for updater checks, full downloads, and blockmap requests. */
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js';
import type { ClientRequest } from 'electron';
/** Retains electron-updater transport and proxy handling while bounding silent connections. */
export declare class DesktopUpdateHttpExecutor extends ElectronHttpExecutor {
    private readonly idleTimeoutMs;
    /**
     * @param idleTimeoutMs - Maximum silence before headers or between response chunks, not a total download deadline.
     * @param proxyLogin - Existing updater login event forwarding.
     */
    constructor(idleTimeoutMs: number, proxyLogin?: ConstructorParameters<typeof ElectronHttpExecutor>[0]);
    addErrorAndTimeoutHandlers(request: ClientRequest, reject: (error: Error) => void): void;
}
//# sourceMappingURL=update-http-executor.d.ts.map