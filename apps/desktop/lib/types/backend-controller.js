/** Owns one backend startup and its quiescent teardown independently of windows. */
import { desktopErrorState } from "./startup-error.js";
/** The error state for one failure: rendered message plus the failure itself. */
function errorState(failure) {
    return { ...desktopErrorState(failure), failure };
}
/** Serializes retries and prevents children from outliving a closed window. */
export class DesktopBackendController {
    createHost;
    publish;
    current = { phase: 'starting' };
    attempt;
    pending;
    stopping;
    closed = false;
    /**
     * @param createHost - Allocate a child and route its fatal failures to the supplied callback.
     * @param publish - Receive availability changes until the controller closes.
     */
    constructor(createHost, publish) {
        this.createHost = createHost;
        this.publish = publish;
    }
    /** Current availability, including the last startup or child failure. */
    get state() { return this.current; }
    /** Child available to application requests; absent during startup and teardown. */
    get host() { return !this.closed && !this.attempt?.cancelled && this.current.phase === 'ready' ? this.attempt?.host : undefined; }
    /**
     * Prepare the profile and start one child; concurrent callers share the attempt.
     * @param prepare - Profile preparation that must finish before spawning.
     * @returns Completion of startup, rejecting on preparation, startup, or cleanup failure.
     */
    start(prepare) {
        if (this.closed)
            return Promise.reject(new Error('desktop backend is closed'));
        if (this.stopping !== undefined)
            return Promise.reject(new Error('desktop backend is stopping'));
        if (this.pending !== undefined)
            return this.pending;
        if (this.current.phase === 'ready')
            return Promise.resolve();
        const previous = this.attempt;
        const attempt = { cancelled: false, ...(previous?.cleanup === undefined ? {} : { cleanup: previous.cleanup }) };
        this.attempt = attempt;
        this.update({ phase: 'starting' });
        const pending = Promise.resolve().then(async () => {
            try {
                await previous?.cleanup;
                delete attempt.cleanup;
                if (attempt.cancelled)
                    return;
                await prepare();
                // stop() can cancel this attempt while preparation is pending.
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (attempt.cancelled)
                    return;
                const host = this.createHost((error) => { this.failed(attempt, error); });
                attempt.host = host;
                await host.start();
                if (attempt.failure !== undefined)
                    throw attempt.failure;
                // stop() can cancel this attempt while the child starts.
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (!attempt.cancelled)
                    this.update({ phase: 'ready' });
            }
            catch (error) {
                const cancelled = attempt.cancelled;
                attempt.cancelled = true;
                let failure = error;
                try {
                    await this.cleanup(attempt);
                }
                catch (cleanupError) {
                    if (cleanupError !== error)
                        failure = new AggregateError([error, cleanupError], 'desktop backend startup and cleanup failed');
                }
                if (!cancelled)
                    this.update(errorState(failure));
                throw failure;
            }
        }).finally(() => { if (this.pending === pending)
            this.pending = undefined; });
        this.pending = pending;
        return pending;
    }
    /**
     * Stop pending preparation and the child before allowing another start.
     * @returns Completion of pending work and child exit; rejects if cleanup fails.
     */
    stop() {
        if (this.stopping !== undefined)
            return this.stopping;
        const attempt = this.attempt;
        if (attempt !== undefined)
            attempt.cancelled = true;
        if (!this.closed)
            this.update({ phase: 'starting' });
        const pending = this.pending;
        const stopping = Promise.allSettled([
            attempt === undefined ? Promise.resolve() : this.cleanup(attempt),
            pending,
        ]).then((results) => {
            const cleanup = results[0];
            if (cleanup.status === 'rejected')
                throw cleanup.reason;
            if (this.attempt === attempt)
                this.attempt = undefined;
        }).finally(() => { if (this.stopping === stopping)
            this.stopping = undefined; });
        this.stopping = stopping;
        return stopping;
    }
    /**
     * Permanently prevent startup and suppress further availability notifications.
     * @returns Completion of pending work and child exit; rejects if cleanup fails.
     */
    close() {
        this.closed = true;
        return this.stop();
    }
    cleanup(attempt) {
        if (attempt.cleanup === undefined) {
            attempt.cleanup = Promise.resolve().then(async () => { await attempt.host?.stop(); });
        }
        return attempt.cleanup;
    }
    failed(attempt, error) {
        if (this.attempt !== attempt || attempt.cancelled)
            return;
        attempt.failure = error;
        if (this.current.phase !== 'ready')
            return;
        attempt.cancelled = true;
        const cleanup = this.cleanup(attempt);
        this.update(errorState(error));
        void cleanup.catch((cleanupError) => {
            if (this.attempt === attempt)
                this.update(errorState(new AggregateError([error, cleanupError], 'Desktop backend failed and could not stop')));
        });
    }
    update(state) {
        if (this.closed)
            return;
        this.current = state;
        try {
            this.publish(state);
        }
        catch (error) {
            console.error('desktop backend state listener failed', error);
        }
    }
}
//# sourceMappingURL=backend-controller.js.map