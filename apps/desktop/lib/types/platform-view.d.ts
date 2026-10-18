/** Isolated Platform documents owned by the desktop account lifetime. */
import type { EventEmitter } from 'node:events';
import { type View, type WebFrameMain } from 'electron';
import { type PlatformSession } from '@deepseek-ai/dsh-deepseek-account';
import { type PlatformLocale } from './platform-ipc.ts';
export { PLATFORM_IPC } from './platform-ipc.ts';
/** Bounds in desktop content coordinates, supplied by the owned application renderer. */
export interface PlatformBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * Decode the renderer rectangle before allocating a native view.
 * @param value - IPC payload.
 * @returns finite, nonnegative integer coordinates.
 */
export declare function platformBounds(value: unknown): PlatformBounds;
type PlatformOwner = Pick<EventEmitter, 'on' | 'removeListener'> & {
    webContents: Pick<EventEmitter, 'on' | 'removeListener'>;
    contentView: Pick<View, 'addChildView' | 'removeChildView'>;
    isDestroyed(): boolean;
};
type PlatformSender = {
    sender: object;
    senderFrame: Pick<WebFrameMain, 'url'> | null;
};
/** Native view and its credential snapshot are discarded together. */
export declare class DesktopPlatformView {
    private readonly preload;
    private readonly getLocale;
    private readonly platform;
    private account;
    private view;
    private owner;
    private releaseOwner;
    private generation;
    private readonly storageCleanup;
    private disposed;
    /**
     * @param preload - bundled sandboxed Platform preload path.
     * @param getLocale - current resolved Desktop language.
     * @param platform - operating system this shell runs on, reported to Platform.
     */
    constructor(preload: string, getLocale: () => PlatformLocale, platform: 'darwin' | 'win32');
    /** @param next - private Host credentials; identity enrichment preserves an already open temporary document. */
    setSession(next: PlatformSession | null): void;
    /**
     * Open account-scoped persistent storage, or temporary storage when the account ID is unavailable.
     * @param owner - application window containing the view.
     * @param page - explicit supported Platform page.
     * @param bounds - owned renderer rectangle.
     * @returns when loading finishes, or without a document when superseded or the owner closes or navigates.
     */
    open(owner: PlatformOwner, page: 'usage' | 'top-up', bounds: PlatformBounds): Promise<void>;
    /** @param bounds - current application viewport rectangle. */
    setBounds(bounds: PlatformBounds): void;
    /**
     * Return prepared credentials and resolved language only to the current Platform main frame.
     * @param event - Electron-provided sender identity.
     * @returns credentials and current language copied into the isolated preload.
     */
    bootstrap(event: PlatformSender): Pick<PlatformSession, 'origin' | 'token'> & {
        locale: PlatformLocale;
    };
    /** Notify the current document after the Desktop language changes. */
    notifyLocaleChanged(): void;
    /** Destroy the document and clear authentication; account-scoped page preferences survive reopening. */
    close(): void;
    /** Stop accepting documents and await all scheduled authentication cleanup. */
    dispose(): Promise<void>;
    /** Destroy the current document and await authentication cleanup before an installer takes over. */
    closeAndWait(): Promise<void>;
    private cleanStorage;
}
//# sourceMappingURL=platform-view.d.ts.map