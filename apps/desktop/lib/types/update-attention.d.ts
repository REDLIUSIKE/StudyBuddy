/** Best-effort background attention never grants update or task-stop authorization. */
import { type BrowserWindow } from 'electron';
import type { DesktopLocale } from './locale.ts';
/** Owns one reminder per downloaded version until reset for a new download. */
export declare class DesktopUpdateAttention {
    private readonly locale;
    private readonly platform;
    private version;
    private notification;
    private stop;
    /**
     * @param locale - Shell-owned notification copy.
     * @param platform - Native attention implementation, replaceable for platform tests.
     */
    constructor(locale: DesktopLocale, platform?: string);
    /**
     * @param version - Prepared target whose confirmation is waiting.
     * @param parent - Taskbar window; never restored or focused by the reminder.
     * @param modal - Existing installation confirmation.
     * @param returnToConfirmation - Rechecks current policy and returns to UI without installing.
     */
    ready(version: string, parent: BrowserWindow, modal: BrowserWindow, returnToConfirmation: () => void): void;
    /** Release owned native reminders without scheduling another for the same target. */
    clear(): void;
    /** Start a new download episode, or dispose all owned reminders. */
    reset(): void;
}
//# sourceMappingURL=update-attention.d.ts.map