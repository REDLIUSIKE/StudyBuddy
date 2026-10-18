import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import { type ClientRemote } from '@deepseek-ai/dsh-api-gateway/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { TerminalEnvironment, TerminalFrame, WebTerminalId, WebTerminalInfo } from '../types.ts';
/** The generated terminal namespace's browser-facing operations. */
export type TerminalRemote = ClientRemote['terminal'];
/** Product error identifiers translated by the terminal UI. */
export type TerminalViewIssue = 'missingTerminal' | 'inputFull' | 'attachmentEnded' | 'invalidOutput' | 'terminalLimit';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        /** Client terminal failure preserved through the Remote stream supervisor. */
        'terminal/view': {
            readonly issue: TerminalViewIssue;
        };
    }
}
/** One screen write awaiting the DOM emulator's callback. */
export interface TerminalRenderFrame {
    readonly revision: number;
    readonly frame: Extract<TerminalFrame, {
        type: 'snapshot' | 'output';
    }>;
}
/** Observable state of one sidebar occurrence. */
export interface TerminalViewState {
    readonly phase: 'idle' | 'loading' | 'creating' | 'connecting' | 'connected' | 'disconnected' | 'closing' | 'closed' | 'failed';
    readonly environment?: TerminalEnvironment | undefined;
    readonly title?: string | undefined;
    readonly info?: WebTerminalInfo | undefined;
    readonly writable: boolean;
    readonly render?: TerminalRenderFrame | undefined;
    readonly error?: string | undefined;
    readonly issue?: TerminalViewIssue | undefined;
}
/** A view survives DOM unmount; its process only ends on explicit close. */
export declare class TerminalView {
    private readonly sessionId;
    private readonly remote;
    private readonly gateway;
    readonly id: WebTerminalId;
    private readonly createWhenMissing;
    private readonly shellPath?;
    private readonly retain?;
    /** Observable controls, process metadata and the next screen update awaiting acknowledgement. */
    readonly state: SnapshotStore<TerminalViewState>;
    private readonly lifetime;
    private stream;
    private mounted;
    private attachmentId;
    private pendingRender;
    private revision;
    private creation;
    private loading;
    private closing;
    private writes;
    private queuedInput;
    private readonly detaching;
    /**
     * @param sessionId - Session owning the terminal.
     * @param remote - typed terminal Remote operations.
     * @param gateway - reconnecting stream factory.
     * @param id - Host terminal identity, reused when recovering an item from its Session list.
     * @param createWhenMissing - allow allocation only for a new tab, never a listed terminal.
     * @param shellPath - explicit shell chosen at the guide; omission uses the remembered available shell.
     * @param retain - window hold acknowledgement required before output attachment.
     */
    constructor(sessionId: SessionId, remote: TerminalRemote, gateway: Pick<ClientRemote, '$stream'>, id: WebTerminalId, createWhenMissing?: boolean, shellPath?: string | undefined, retain?: ((signal: AbortSignal) => Promise<void>) | undefined);
    /**
     * Attach the DOM lifetime, starting the chosen shell or reconnecting the saved process.
     * @returns a detach callback that leaves the terminal process alive.
     */
    mount(): () => void;
    /**
     * Start or recover this tab, deduplicating mounts and retries during allocation.
     * Only a new tab may allocate a shell; listed terminals cannot be silently replaced.
     * @returns after environment lookup and creation or recovery settle.
     */
    refresh(): Promise<void>;
    private stopped;
    private create;
    private adopt;
    /** Reattach with a fresh screen and regain input control. */
    connect(): void;
    /**
     * Release the next stream item after xterm has parsed this frame.
     * @param revision - locally delivered render revision.
     */
    acknowledge(revision: number): void;
    /**
     * Serialize raw input so concurrent RPC requests cannot reorder keystrokes.
     * @param data - input from the terminal emulator.
     */
    write(data: string): void;
    /**
     * Resize only from the currently writable view.
     * @param cols - measured column count.
     * @param rows - measured row count.
     */
    resize(cols: number, rows: number): void;
    /**
     * Update the Host terminal's display name.
     * @param title - user-entered terminal title.
     * @returns after the rename settles and its result is reflected in view state.
     */
    rename(title: string): Promise<void>;
    /**
     * Explicitly terminate this view's process independently of its DOM lifetime.
     * @returns after Host process cleanup succeeds; failures remain retryable by the owner.
     */
    close(): Promise<void>;
    /**
     * Stop Client work on plugin unload without closing Host terminals.
     * @returns after active and previously detached stream iterators have closed.
     */
    dispose(): Promise<void>;
    private detach;
    private consume;
    private patch;
    private fail;
}
//# sourceMappingURL=model.d.ts.map