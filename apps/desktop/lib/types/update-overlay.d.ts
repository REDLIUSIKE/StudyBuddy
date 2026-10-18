/** Shell-owned modal windows cover the parent's content without replacing its native window controls. */
import { BrowserWindow } from 'electron';
/** Tracks application-owned update overlays and their parent input state. */
export declare class DesktopUpdateOverlays {
    private readonly inputStates;
    /**
     * @param parent - Product window whose input may belong to an update dialog.
     * @returns Current blocking state; its revision changes whenever an overlay opens or closes.
     */
    input(parent: BrowserWindow): {
        readonly revision: number;
        readonly blocked: boolean;
    };
    /**
     * @param parent - Product window whose content is blocked while the overlay is open.
     * @param preload - Isolated shell-only preload.
     * @param title - Localized window title.
     * @param nativeModal - Use a native modal; false keeps overlays out of macOS sheets.
     * @returns A transparent child that follows its parent's bounds and visibility after loading and releases its listeners on close.
     */
    create(parent: BrowserWindow, preload: string, title: string, nativeModal?: boolean): BrowserWindow;
}
//# sourceMappingURL=update-overlay.d.ts.map