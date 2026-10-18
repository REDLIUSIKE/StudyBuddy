/** Ordinary feed polling; policy queries and user-authorized transfers keep their own lifetimes. */
import { resolveDurationMs } from "./duration-env.js";
/**
 * Resolve ordinary-update polling settings without changing mandatory-policy scheduling.
 * @param env - Desktop process environment.
 * @returns Validated durations and fractional jitter.
 */
export function resolveDesktopUpdateScheduleConfig(env) {
    const intervalMs = resolveDurationMs(env, 'DSH_DESKTOP_UPDATE_CHECK_INTERVAL_MS', 600_000);
    const maxBackoffMs = resolveDurationMs(env, 'DSH_DESKTOP_UPDATE_CHECK_MAX_BACKOFF_MS', Math.max(intervalMs, 3_600_000));
    const jitter = Number(env.DSH_DESKTOP_UPDATE_CHECK_JITTER ?? 0.2);
    if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1 || maxBackoffMs < intervalMs) {
        throw new Error('desktop update: check jitter must be in [0, 1] and max backoff must cover the check interval');
    }
    return { intervalMs, maxBackoffMs, jitter };
}
/** One completion-based deadline shared by periodic, foreground, resume, and explicit checks. */
export class DesktopUpdateSchedule {
    updates;
    config;
    random;
    now;
    timer;
    pending;
    activeChecks = 0;
    disposed = false;
    nextCheck = -Infinity;
    delay;
    /**
     * @param updates - Coordinator that joins network checks and retains prepared packages.
     * @param config - Validated polling options.
     * @param random - Instance-local uniform sample in [0, 1).
     * @param now - Monotonic milliseconds, independent of wall-clock corrections.
     */
    constructor(updates, config, random = Math.random, now = () => performance.now()) {
        this.updates = updates;
        this.config = config;
        this.random = random;
        this.now = now;
        this.delay = config.intervalMs;
    }
    /**
     * Start immediately when due; explicit requests bypass the deadline and share in-flight work.
     * @param manual - Whether a check failure must be visible, including when joining an automatic request.
     * @param force - Whether policy arrival or explicit intent bypasses the automatic deadline.
     * @returns Current state when not due, otherwise the coordinator result. Disposal rejects new work.
     */
    async check(manual = false, force = manual) {
        if (this.disposed)
            throw new Error('desktop update: polling is disposed');
        if (this.pending !== undefined && !manual)
            return this.pending;
        if (!force && this.now() < this.nextCheck)
            return this.updates.state;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.activeChecks++;
        this.pending = Promise.resolve().then(() => {
            if (this.disposed)
                throw new Error('desktop update: polling is disposed');
            return this.updates.check(manual);
        }).then((state) => {
            this.complete(state.phase === 'error' && state.failedOperation === 'check');
            return state;
        }, (error) => { this.complete(true); throw error; });
        return this.pending;
    }
    /** Stop timers and prevent late completion from rearming; the coordinator owns pending network teardown. */
    dispose() {
        this.disposed = true;
        clearTimeout(this.timer);
        this.timer = undefined;
    }
    complete(failed) {
        // Joined manual callers publish through the coordinator but advance the retry delay only once.
        if (--this.activeChecks !== 0)
            return;
        this.pending = undefined;
        this.schedule(failed);
    }
    schedule(failed) {
        if (this.disposed)
            return;
        const { intervalMs, maxBackoffMs, jitter } = this.config;
        this.delay = failed ? Math.min(maxBackoffMs, this.delay * 2) : intervalMs;
        const lower = Math.max(1_000, this.delay * (1 - jitter));
        const upper = Math.min(maxBackoffMs, this.delay * (1 + jitter));
        const delay = Math.round(lower + (upper - lower) * this.random());
        this.nextCheck = this.now() + delay;
        this.timer = setTimeout(() => {
            void this.check(false, true).catch((error) => { console.error(error); });
        }, delay);
    }
}
//# sourceMappingURL=update-schedule.js.map