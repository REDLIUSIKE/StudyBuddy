import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess';
import { type TerminalRetentionPolicy } from './retention.ts';
import type { TerminalAttachmentId, TerminalFrame, TerminalRetentionFrame, WebTerminalInfo } from './types.ts';
/** Process lifetime is independent of follower and component lifetimes. */
export declare class BrowserTerminal {
    private readonly handle;
    info: WebTerminalInfo;
    private readonly maxBufferedBytes;
    private readonly screen;
    private readonly serializer;
    private readonly followers;
    private sequence;
    private operations;
    private readonly drained;
    private closing;
    private retention;
    private controller;
    /**
     * @param handle - allocated terminal process range.
     * @param info - initial metadata.
     * @param scrollback - maximum retained scrollback rows.
     * @param maxBufferedBytes - per-follower queue cap.
     */
    constructor(handle: SubprocessTerminalHandle, info: WebTerminalInfo, scrollback: number, maxBufferedBytes: number);
    /**
     * Start monitoring after this allocation is committed to its Session owner.
     * @param policy - validated Host timing policy.
     * @param closing - closes the id before any asynchronous termination.
     * @param closed - removes the exact successfully terminated owner record.
     * @param failed - diagnostic sink for background cleanup failure.
     */
    monitor(policy: TerminalRetentionPolicy, closing: () => void, closed: () => void, failed: (error: unknown) => void): void;
    /**
     * Retain this committed process independently of output attachment.
     * @param signal - physical window stream lifetime.
     * @returns its hold acknowledgement and lifetime.
     */
    retain(signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>;
    /**
     * Attach with exclusive input control; an older attachment becomes read-only.
     * @param id - browser attachment identity.
     * @param signal - attachment cancellation; never terminates the process.
     * @returns a consistent screen followed by ordered output and state changes.
     */
    follow(id: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame>;
    /**
     * Send raw terminal input without command interpretation.
     * @param id - current writable attachment.
     * @param data - UTF-8 input, including shell completion/control keys.
     * @returns when the provider accepts the input.
     */
    write(id: TerminalAttachmentId, data: string): Promise<void>;
    /**
     * Resize the PTY and recovery screen in the same operation order as output.
     * @param id - current writable attachment.
     * @param cols - validated column count.
     * @param rows - validated row count.
     * @returns when the provider and emulator use the new dimensions.
     */
    resize(id: TerminalAttachmentId, cols: number, rows: number): Promise<void>;
    /**
     * Publish a display name to every attached view.
     * @param title - validated user title.
     */
    rename(title: string): void;
    /**
     * Terminate the complete provider-owned process range before releasing its screen.
     * @returns after process cleanup and final output drainage; failures remain retryable.
     */
    close(): Promise<void>;
    /**
     * Stop unattended cleanup scheduling and await final process cleanup.
     * @returns after terminal and monitor quiescence.
     */
    dispose(): Promise<void>;
    private closeProcess;
    private requireController;
    private broadcast;
    private enqueue;
    private consume;
    private output;
}
//# sourceMappingURL=terminal.d.ts.map