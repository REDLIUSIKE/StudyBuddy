import { type BrowserWindow, type WebContents } from 'electron';
import type { DesktopBrowserLeaseId, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types';
/** Owns workspace storage partitions independently from individual tab guests. */
export declare class DesktopBrowserGuests {
    private readonly hostUrl;
    private readonly partitions;
    private readonly leases;
    /** @param hostUrl - current authenticated DSH Host, which guests cannot request. */
    constructor(hostUrl: () => string | undefined);
    /**
     * Reserve one guest in a workspace's process-lifetime partition.
     * @param owner - authenticated primary application WebContents.
     * @param workspace - workspace identity received over IPC.
     * @returns opaque lease and the partition approved for it.
     */
    acquire(owner: WebContents, workspace: unknown): DesktopBrowserReservation;
    /**
     * Release only a lease issued to this application window; workspace storage survives.
     * @param owner - authenticated IPC sender.
     * @param id - lease received over IPC.
     */
    release(owner: WebContents, id: unknown): Promise<void>;
    /**
     * Install attachment checks before the application document can create a webview.
     * @param window - primary application window.
     * @param attachInput - attaches native input after guest ownership is verified and returns its disposer.
     */
    bind(window: BrowserWindow, attachInput: (guest: WebContents, name: DesktopBrowserLeaseId) => () => void, otherReservation?: (src: string, partition?: string) => boolean): void;
    /** Admit another attachment owner only after checking this manager's exact lease. */
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    private configureSession;
    private allowedNavigation;
    private isApplicationHost;
}
//# sourceMappingURL=browser-guests.d.ts.map