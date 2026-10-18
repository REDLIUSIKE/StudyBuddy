/** Main-owned update confirmations; closing or replacing a dialog never grants installation permission. */
import { type BrowserWindow, type MessageBoxOptions, type MessageBoxReturnValue } from 'electron';
import type { DesktopLocale } from './locale.ts';
import type { DesktopUpdateOverlays } from './update-overlay.ts';
/** Channels available only to the isolated update-dialog document. */
export declare const UPDATE_DIALOG_IPC: {
    readonly status: "dsh-update-dialog:status";
    readonly changed: "dsh-update-dialog:changed";
    readonly respond: "dsh-update-dialog:respond";
};
/** Text and choices supplied by the main process, never by product documents. */
export interface UpdateDialogView {
    /** Identifies the displayed choices; a response from an older prompt is rejected. */
    readonly revision: number;
    readonly locale: string;
    readonly title: string;
    readonly message: string;
    readonly detail: string;
    readonly buttons: readonly string[];
    readonly cancelId: number;
    readonly closeLabel: string;
    readonly technicalDetails: string;
    readonly technicalDetailsLabel: string;
}
/** Electron message options with separately expandable, main-owned diagnostics. */
export interface UpdateDialogOptions extends MessageBoxOptions {
    readonly technicalDetails?: string;
}
/** The document can select only a displayed response index. */
export interface UpdateDialogApi {
    status(): Promise<UpdateDialogView | null>;
    respond(revision: number, index: number): Promise<void>;
    subscribe(listener: (view: UpdateDialogView | null) => void): () => void;
}
/** One fading backdrop with replaceable confirmation content; aborted checks and mandatory policy cancel ordinary prompts. */
export declare class DesktopUpdateDialog {
    private readonly preload;
    private readonly locale;
    private readonly overlays;
    private disposed;
    private revision;
    private window;
    private parent;
    private closing;
    private active;
    /** Focus the current explanation or confirmation without replacing it or granting permission. */
    focus(): void;
    /** Whether a shell prompt is awaiting a response. */
    get isOpen(): boolean;
    /**
     * @param preload - Bundled isolated preload.
     * @param locale - Shell-owned copy or a reader of the current UI language.
     * @param overlays - Application-owned overlay creation and input tracking.
     */
    constructor(preload: string, locale: DesktopLocale | (() => DesktopLocale), overlays: Pick<DesktopUpdateOverlays, 'create'>);
    /**
     * @param parent - Window blocked by this confirmation.
     * @param options - Main-owned localized content, response choices, and optional cancellation signal.
     * @returns A displayed response, or cancellation on replacement, abort, close, or load failure; backdrop dismissal fades independently.
     */
    show(parent: BrowserWindow, options: UpdateDialogOptions): Promise<MessageBoxReturnValue>;
    /** Cancel the displayed prompt without authorizing any operation. */
    cancel(): void;
    /** Close the document and detach its private IPC handlers. */
    dispose(): void;
    private close;
    private owned;
}
//# sourceMappingURL=update-dialog.d.ts.map