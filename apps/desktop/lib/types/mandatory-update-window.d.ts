/** Shell-owned modal policy UI; only explicit actions authorize downloads or browser navigation. */
import { BrowserWindow } from 'electron';
import type { DesktopLocale } from './locale.ts';
import { type DesktopUpdateState } from './ipc.ts';
import { type DesktopPolicyState } from './mandatory-update-policy.ts';
import type { DesktopUpdateOverlays } from './update-overlay.ts';
/** A renderer action never carries a URL or authorizes a different version. */
export type MandatoryUpdateAction = 'refresh' | 'download' | 'install' | 'later' | 'page' | 'copy';
/** Combined view rendered as text by the shell-owned page. */
export interface MandatoryUpdateView {
    readonly locale: DesktopLocale;
    readonly policy: DesktopPolicyState;
    readonly update: DesktopUpdateState;
    readonly error?: string;
    readonly confirmation?: {
        readonly version: string;
        readonly active: boolean;
        readonly revision: number;
    };
    readonly deferred: boolean;
    readonly restart?: 'stopping-tasks' | 'preparing';
    readonly navigation?: {
        readonly page: 'requested' | 'failed';
        readonly copy?: 'copied' | 'failed';
    };
}
/** Narrow isolated bridge, absent from product and plugin documents. */
export interface MandatoryUpdateApi {
    status(): Promise<MandatoryUpdateView>;
    action(action: MandatoryUpdateAction, version?: string, confirmationRevision?: number): Promise<void>;
    subscribe(listener: (state: MandatoryUpdateView) => void): () => void;
}
/** Main-process operations owned by the policy client, updater, and application lifecycle. */
export interface MandatoryUpdateWindowOptions {
    readonly preload: string;
    readonly overlays: Pick<DesktopUpdateOverlays, 'create'>;
    readonly locale: DesktopLocale;
    readonly allowedPageOrigins: readonly string[];
    readonly parent: () => BrowserWindow | undefined;
    readonly policy: () => DesktopPolicyState;
    readonly update: () => DesktopUpdateState;
    readonly refresh: () => Promise<void>;
    readonly download: (version: string) => Promise<DesktopUpdateState>;
    readonly install: (version: string) => Promise<DesktopUpdateState>;
}
/** Shell-owned update presentation; Windows embeds it in the main document without a child window. */
export declare class DesktopMandatoryUpdateWindow {
    private readonly options;
    private readonly embedded;
    private embeddedParent;
    private embeddedBlocking;
    private readonly publishEmbedded;
    private window;
    private closing;
    private disposed;
    private error;
    private action;
    private confirmation;
    private confirmationRevision;
    private deferred;
    private restart;
    private navigation;
    private navigationUrl;
    private navigationEpoch;
    private readonly attention;
    /** @param options - Main-process actions and immutable deployment/navigation settings. */
    constructor(options: MandatoryUpdateWindowOptions);
    /** Active modal used as the owner of shell installation-confirmation dialogs. */
    get confirmationWindow(): BrowserWindow | undefined;
    /**
     * @param version - Updater-owned target, already downloaded and verified.
     * @param active - Fresh Host task inspection; unknown state must fail before calling.
     * @returns Explicit approval from this same modal, or false on deferral, policy clearance, or disposal.
     */
    confirm(version: string, active: boolean): Promise<boolean>;
    /** @param active - Whether admitted tasks are actually being stopped after installation approval. */
    preparingRestart(active: boolean): void;
    /** Publish current status, create the block immediately, or close it only after policy clearance. */
    sync(): void;
    /** Focus the block instead of opening ordinary product or plugin interactions. */
    focus(): void;
    /** Detach IPC and release the modal during shutdown, including after the main window closes. */
    dispose(): void;
    private view;
    private finishConfirmation;
    private clearNavigation;
    private navigate;
    private assertSender;
}
//# sourceMappingURL=mandatory-update-window.d.ts.map