/** Windows system tray: the always-present way back to a hidden window and the explicit quit entry. */
import type { DesktopLocale } from './locale.ts';
/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
    /** Multi-size ICO rendered by `scripts/render-tray-icon.ts`; Windows picks the bitmap for the display scale. */
    readonly iconPath: string;
    readonly locale: () => DesktopLocale;
    /** Show and focus the primary window. */
    readonly open: () => void;
    /** Request quit through the same confirmation as every other quit entry. */
    readonly quit: () => void;
}
/** Tray icon present for the whole run, not only while the window is hidden. */
export declare class DesktopTray {
    private readonly options;
    private tray;
    /** @param options - Icon path, locale reader, and the open and quit actions. */
    constructor(options: DesktopTrayOptions);
    /** Rebuild the tooltip and context menu in the current locale. */
    relabel(): void;
    /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
    dispose(): void;
}
//# sourceMappingURL=tray.d.ts.map