/** Ordinary feed polling; policy queries and user-authorized transfers keep their own lifetimes. */
import type { DesktopUpdateCoordinator } from './update-coordinator.ts';
import type { DesktopUpdateState } from './ipc.ts';
/** Validated polling delays; maxBackoffMs caps the final randomized delay. */
export interface DesktopUpdateScheduleConfig {
    readonly intervalMs: number;
    readonly maxBackoffMs: number;
    readonly jitter: number;
}
/**
 * Resolve ordinary-update polling settings without changing mandatory-policy scheduling.
 * @param env - Desktop process environment.
 * @returns Validated durations and fractional jitter.
 */
export declare function resolveDesktopUpdateScheduleConfig(env: NodeJS.ProcessEnv): DesktopUpdateScheduleConfig;
/** One completion-based deadline shared by periodic, foreground, resume, and explicit checks. */
export declare class DesktopUpdateSchedule {
    private readonly updates;
    private readonly config;
    private readonly random;
    private readonly now;
    private timer;
    private pending;
    private activeChecks;
    private disposed;
    private nextCheck;
    private delay;
    /**
     * @param updates - Coordinator that joins network checks and retains prepared packages.
     * @param config - Validated polling options.
     * @param random - Instance-local uniform sample in [0, 1).
     * @param now - Monotonic milliseconds, independent of wall-clock corrections.
     */
    constructor(updates: Pick<DesktopUpdateCoordinator, 'check' | 'state'>, config: DesktopUpdateScheduleConfig, random?: () => number, now?: () => number);
    /**
     * Start immediately when due; explicit requests bypass the deadline and share in-flight work.
     * @param manual - Whether a check failure must be visible, including when joining an automatic request.
     * @param force - Whether policy arrival or explicit intent bypasses the automatic deadline.
     * @returns Current state when not due, otherwise the coordinator result. Disposal rejects new work.
     */
    check(manual?: boolean, force?: boolean): Promise<DesktopUpdateState>;
    /** Stop timers and prevent late completion from rearming; the coordinator owns pending network teardown. */
    dispose(): void;
    private complete;
    private schedule;
}
//# sourceMappingURL=update-schedule.d.ts.map