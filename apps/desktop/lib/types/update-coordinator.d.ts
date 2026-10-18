/** User-authorized downloads and separate installation of one version-bound Desktop release. */
import { type AppUpdater } from 'electron-updater';
import type { DesktopUpdateState } from './ipc.ts';
import type { DesktopUpdateChannel } from '../scripts/desktop-auto-update-environment.mjs';
/** Owns one updater target until its download and installation settle. */
export declare class DesktopUpdateCoordinator {
    private readonly publish;
    private readonly beforeRestart;
    private readonly updater;
    private readonly enabled;
    private readonly currentVersion;
    private readonly downloadResult?;
    private readonly channel;
    private current;
    private candidate;
    private downloaded;
    private disposed;
    private checkOperation;
    private downloadOperation;
    private installOperation;
    private readonly windowsSignature;
    private readonly onProgress;
    private readonly onDownloaded;
    private readonly onError;
    /**
     * @param publish - Receives observable states for every Desktop window.
     * @param beforeRestart - Completes task authorization, admission locking, and owned-process shutdown.
     * @param updater - Process-owned Electron updater, replaceable at the network/platform test boundary.
     * @param enabled - Whether this process has a packaged update source.
     * @param currentVersion - Actual installed application version.
     * @param downloadResult - Once per completed download attempt, including platform preparation failures.
     */
    constructor(publish: (state: DesktopUpdateState) => DesktopUpdateState, beforeRestart: () => Promise<boolean>, updater?: AppUpdater, enabled?: () => boolean, currentVersion?: () => string, downloadResult?: ((success: boolean, reason?: string) => void) | undefined, channel?: DesktopUpdateChannel);
    /** Latest observable state; complete download identity remains main-process-owned. */
    get state(): DesktopUpdateState;
    /**
     * Check metadata without downloading, joining any current check.
     * @param manual - Whether a failed check must remain visible in the status indicator.
     * @returns The check result, including a silent automatic failure when applicable.
     */
    check(manual?: boolean): Promise<DesktopUpdateState>;
    /**
     * @param version - Version shown in the user's download confirmation.
     * @returns Download readiness or failure, without authorizing installation.
     */
    download(version: string): Promise<DesktopUpdateState>;
    /**
     * Install a prepared target after a separate user confirmation.
     * @param version - Exact version displayed in the confirmation, never a renderer-selected URL.
     * @returns Installation handoff or a recoverable preparation error.
     */
    install(version: string): Promise<DesktopUpdateState>;
    /** Remove owned listeners and prevent pending library operations from publishing into closed UI. */
    dispose(): void;
    private assertLive;
    private setState;
    private failure;
    private target;
    private doCheck;
}
//# sourceMappingURL=update-coordinator.d.ts.map