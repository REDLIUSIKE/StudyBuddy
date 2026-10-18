/** Session-owned user terminals with the execution environment's system-user permissions. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TerminalShell, TerminalAttachmentId, TerminalCreateRequest, TerminalEnvironment, TerminalFrame, TerminalRetentionFrame, WebTerminalId, WebTerminalInfo } from './types.ts';
export type * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Interactive user terminals, separate from the Agent terminal tool registry. */
        terminalController: TerminalController;
    }
}
/** Deployment limits and an optional shell profile. */
export interface Config {
    /** Explicit shell profile; omission uses the execution environment's default shell. */
    readonly shell?: {
        /** Executable path or PATH name, verified by the subprocess provider. */
        path: string;
        /** User-visible profile name. */
        name: string;
        /** Arguments passed to the interactive shell. */
        args: string[];
    } | undefined;
    /** Executable names or paths checked for the new-terminal shell selector. */
    readonly shellCandidates: string[];
    /** Maximum retained terminals and pending allocations per Session. */
    readonly maxTerminals: number;
    /** Maximum terminal width in columns. */
    readonly maxCols: number;
    /** Maximum terminal height in rows. */
    readonly maxRows: number;
    /** Screen history rows retained for reconnecting clients. */
    readonly scrollback: number;
    /** Maximum queued UTF-8 frame bytes per output follower before disconnection. */
    readonly maxBufferedBytes: number;
    /** Maximum UTF-8 bytes in one input request. */
    readonly maxInputBytes: number;
    /** Provider process-termination grace period in milliseconds. */
    readonly disposeGraceMs: number;
    /** Continuous confirmed idle time without window holds before reclamation; zero disables reclamation. */
    readonly unattendedTimeoutMs: number;
    /** Interval between unattended shell and process observations. */
    readonly activityPollIntervalMs: number;
    /** Delay before retrying failed owned terminal cleanup. */
    readonly cleanupRetryMs: number;
}
/** Typed Remote control of transient Session-owned terminal processes. */
export declare class TerminalController extends TypertRemoteService {
    private readonly config;
    static inject: string[];
    static Config: z<Config>;
    private readonly owners;
    private readonly lifetime;
    /**
     * @param ctx - Host context carrying typed Remote and execution providers.
     * @param config - validated terminal limits and optional shell profile.
     */
    constructor(ctx: Context, config: Config);
    /**
     * Read the Session's current directory and terminal limits without filesystem validation or shell lookup.
     * @param agent - Session owner supplied by the Gateway.
     * @param signal - request cancellation.
     * @returns the logged current directory and terminal limits; retained terminals keep their own process directories.
     */
    environment(agent: Agent, signal: AbortSignal): TerminalEnvironment;
    /**
     * Discover installed shells in the Session's execution environment.
     * @param agent - Session owner supplied by the Gateway.
     * @param signal - request cancellation.
     * @returns verified profiles, with the configured or system default first.
     */
    shells(agent: Agent, signal: AbortSignal): Promise<TerminalShell[]>;
    /**
     * List retained terminals without resolving or activating an Agent.
     * @param sessionId - displayed Session identity, including offline history.
     * @returns terminals retained for this Host lifetime.
     */
    list(sessionId: SessionId): WebTerminalInfo[];
    /**
     * Allocate a user shell once for a caller-generated identity, without Agent sandbox or approval restrictions.
     * @param agent - Session owner supplied by the Gateway.
     * @param request - initial dimensions and idempotency identity.
     * @param signal - allocation cancellation; committed terminals survive disconnection.
     * @returns the existing or newly committed terminal.
     */
    create(agent: Agent, request: TerminalCreateRequest, signal: AbortSignal): Promise<WebTerminalInfo>;
    /**
     * Retain an existing terminal for a window without activating its Agent or taking input control.
     * @param sessionId - owning Session identity, including an inactive saved layout.
     * @param id - retained Host terminal identity.
     * @param signal - physical Remote stream cancellation.
     * @returns a hold acknowledgement followed by an open lifetime stream.
     */
    retain(sessionId: SessionId, id: WebTerminalId, signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>;
    /**
     * Attach to a terminal without binding its process lifetime to the transport.
     * @param agent - Session owner supplied by the Gateway.
     * @param id - terminal identity.
     * @param attachmentId - new exclusive input attachment.
     * @param signal - physical stream cancellation.
     * @returns screen recovery followed by output and metadata changes.
     */
    follow(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame>;
    /**
     * Deliver raw input, including Tab completion and control characters.
     * @param agent - Session owner supplied by the Gateway.
     * @param id - terminal identity.
     * @param attachmentId - current writable attachment.
     * @param data - input bytes represented as UTF-8 text.
     * @returns after provider input acceptance.
     */
    write(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, data: string): Promise<void>;
    /**
     * Update the dimensions of the PTY and recovery screen.
     * @param agent - Session owner supplied by the Gateway.
     * @param id - terminal identity.
     * @param attachmentId - current writable attachment.
     * @param cols - column count.
     * @param rows - row count.
     * @returns after the resize completes.
     */
    resize(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, cols: number, rows: number): Promise<void>;
    /**
     * Rename a terminal without changing its shell.
     * @param agent - Session owner supplied by the Gateway.
     * @param id - terminal identity.
     * @param title - nonempty display title, at most 120 characters.
     */
    rename(agent: Agent, id: WebTerminalId, title: string): void;
    /**
     * Close an identity to future creation and kill its process range; repeated closes succeed.
     * @param agent - Session owner supplied by the Gateway.
     * @param id - terminal identity.
     * @returns after provider cleanup succeeds. A failure retains the terminal for retry.
     */
    close(agent: Agent, id: WebTerminalId): Promise<void>;
    private owner;
    private disposeOwner;
    private terminal;
    private requireOpen;
    private dimensions;
    private execution;
    private spawn;
}
/** Browser terminal service plugin. */
export default TerminalController;
//# sourceMappingURL=index.d.ts.map