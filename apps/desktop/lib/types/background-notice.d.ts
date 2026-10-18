/** One-time Windows confirmation before hiding the application in the tray. */
import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import type { DesktopLocale } from './locale.ts';
/** Persistent acknowledgement and the shared shell dialog. */
export interface DesktopBackgroundNoticeOptions {
    /** Acknowledgement under Electron userData; updates retain it and uninstall removes it. */
    readonly markerPath: string;
    readonly locale: () => DesktopLocale;
    readonly show: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>;
    readonly focus: () => void;
}
/** Only an explicit acknowledgement permits the first hide; cancelled prompts remain eligible. */
export declare class DesktopBackgroundNotice {
    private readonly options;
    private acknowledged;
    private pending;
    private disposed;
    /** @param options - Marker path, localized copy, and shell dialog actions. */
    constructor(options: DesktopBackgroundNoticeOptions);
    /**
     * Request a window hide, prompting until acknowledged and coalescing repeated requests.
     * @param hide - Hide the still-owned window after acknowledgement, or immediately when already recorded.
     */
    close(hide: () => void): void;
    /** Ignore late dialog responses after application shutdown begins. */
    dispose(): void;
    private confirm;
}
//# sourceMappingURL=background-notice.d.ts.map