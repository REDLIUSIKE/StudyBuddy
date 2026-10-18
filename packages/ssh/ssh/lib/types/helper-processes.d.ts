import type { Context } from '@deepseek-ai/cordis';
import { type SshProcessId, type SshStreamEndpoint } from './schemas.ts';
type Channel = 'stdin' | 'stdout' | 'stderr' | 'control' | 'terminal';
/** Owns remote launch reservations through final process-range quiescence. */
export declare class RemoteProcesses {
    private readonly ctx;
    private readonly root;
    private readonly limit;
    private readonly preparationMs;
    private readonly records;
    private readonly completed;
    private readonly cleanups;
    private closing;
    /** Spill failures reach the helper's logger; the remote caller then receives the tail without a spill path. */
    private readonly reportSpillFailure;
    constructor(ctx: Context, root: string, limit: number, preparationMs: number);
    /**
     * Allocate private stream listeners; no target executes until start().
     * @param raw - untrusted process request received over SSH.
     * @returns the reservation id and authenticated stream coordinates.
     */
    prepare(raw: unknown): Promise<{
        id: SshProcessId;
        streams: Partial<Record<Channel, SshStreamEndpoint>>;
    }>;
    /**
     * Start once all data channels are authenticated; duplicate starts refuse.
     * @param id - the prepared process reservation.
     * @param signal - cancellation of pending process publication.
     * @returns the terminal pid when the request owns a PTY.
     */
    start(id: SshProcessId, signal?: AbortSignal): Promise<{
        pid?: number;
    }>;
    private startOnce;
    /**
     * Await the direct result without claiming all descendants have exited.
     * @param id - the started process reservation.
     * @returns the exit observation and remote spill paths.
     * @throws the original startup or process failure while its completion is retained.
     */
    done(id: SshProcessId): Promise<unknown>;
    /**
     * Observe the native managed range used for termination.
     * @param id - the started process reservation.
     * @param signal - cancellation of this observation, leaving ownership intact.
     * @returns whether the owned process range is empty.
     */
    wait(id: SshProcessId, signal?: AbortSignal): Promise<boolean>;
    /**
     * Terminate and await the managed range independently of output readers.
     * @param id - the process reservation to stop.
     */
    terminate(id: SshProcessId): Promise<void>;
    /**
     * Operate on the terminal owned by the request id.
     * @param id - the terminal reservation.
     * @param operation - terminal input, foreground observation, or signal delivery.
     * @param value - input bytes as text or the signal name.
     * @returns the operation's wire result.
     */
    terminal(id: SshProcessId, operation: 'write' | 'inspect' | 'activity' | 'signal', value?: string): Promise<unknown>;
    /**
     * Resize an allocated terminal without replacing its process.
     * @param id - terminal reservation.
     * @param cols - positive terminal width.
     * @param rows - positive terminal height.
     * @returns after the local provider accepts the dimensions.
     */
    resizeTerminal(id: SshProcessId, cols: number, rows: number): Promise<void>;
    /** Stop every owned process on lease expiry or disconnect. */
    close(): Promise<void>;
    private release;
    private record;
    private finishFailed;
    private rememberCompleted;
    private trackCleanup;
    private endpoint;
}
export {};
//# sourceMappingURL=helper-processes.d.ts.map