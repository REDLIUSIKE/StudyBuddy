/**
 * Browser resource ownership for the experimental providers. Resources belong
 * to an exact live Agent activation and never transfer to a resumed Session.
 * @module
 */
/** Stop a caller's wait while retaining handlers on the resource owner's work. */
function awaitOperation(operation, signal) {
    return new Promise((resolve, reject) => {
        const aborted = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('browser operation canceled', { cause: signal.reason })); };
        signal.addEventListener('abort', aborted, { once: true });
        void operation.then((value) => {
            signal.removeEventListener('abort', aborted);
            resolve(value);
        }, (error) => {
            signal.removeEventListener('abort', aborted);
            reject(error instanceof Error ? error : new Error(String(error), { cause: error }));
        });
    });
}
/**
 * Lazily acquires one resource per live Session and serializes its operations.
 * Provider disposal closes connections before awaiting operations, allowing
 * transport closure to interrupt work whose upstream API has no abort support.
 */
export class SessionResources {
    ctx;
    options;
    entries = new Map();
    ownerCleanups = new Map();
    disposedOwners = new WeakSet();
    disposing;
    /**
     * @param ctx - provider context with the live Agent registry.
     * @param options - provider-owned acquisition and attachment policy.
     */
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
    }
    /**
     * Check admission without reserving or acquiring a browser.
     * @param agent - exact live Agent that would own the resource.
     * @returns whether this owner can use or acquire the configured browser.
     */
    available(agent) {
        return this.disposing === undefined && !this.disposedOwners.has(agent)
            && this.ctx.get('agents')?.get(agent.id) === agent
            && (this.entries.has(agent) || !this.options.exclusive || this.entries.size === 0);
    }
    /**
     * Obtain the current activation's resource, acquiring it once when absent.
     * @param agent - exact live owner, never merely a durable Session id.
     * @param signal - optional cancellation of this wait; acquisition remains Session-owned.
     * @returns the provider's resource after acquisition and ownership checks.
     */
    async get(agent, signal) {
        signal?.throwIfAborted();
        const entry = this.entry(agent);
        const resource = await (signal === undefined ? entry.ready : awaitOperation(entry.ready, signal));
        signal?.throwIfAborted();
        entry.controller.signal.throwIfAborted();
        return resource.value;
    }
    /**
     * Run after earlier operations on this Session settle; other Sessions proceed independently.
     * Cancellation stops this caller's acquisition wait without canceling Session-owned initialization.
     * It reaches an active provider operation and prevents queued work from starting.
     * @param agent - exact live resource owner.
     * @param signal - cancellation for this operation.
     * @param operation - provider call, which must retain ownership until its work settles.
     * @returns the operation result or its acquisition, cancellation, or execution failure.
     */
    run(agent, signal, operation) {
        signal.throwIfAborted();
        const entry = this.entry(agent);
        const combined = AbortSignal.any([signal, entry.controller.signal]);
        const releaseDisposed = () => {
            const reason = signal.reason;
            if (reason?.kind !== 'disposed')
                return;
            this.disposedOwners.add(agent);
            // AgentHandle waits for idle before disposing its scope; close interrupts the owned operation first.
            void this.closeEntry(agent, entry).catch((error) => {
                this.ctx.logger.warn(`${this.options.label}: browser cleanup during Session cancellation failed: ${String(error)}`);
            });
        };
        signal.addEventListener('abort', releaseDisposed, { once: true });
        const task = entry.tail.then(async () => {
            combined.throwIfAborted();
            const resource = await awaitOperation(entry.ready, combined);
            combined.throwIfAborted();
            const result = await operation(resource.value, combined);
            combined.throwIfAborted();
            return result;
        }).finally(() => { signal.removeEventListener('abort', releaseDisposed); });
        // The queue tracks settlement independently of a caller observing its error.
        entry.tail = task.then(() => { }, () => { });
        return task;
    }
    /**
     * Stop new acquisitions and await every acquired resource and owned operation.
     * A failed close retains its entry and rejects disposal, preserving exclusive ownership.
     * @returns the shared quiescent disposal promise.
     */
    dispose() {
        return this.disposing ??= Promise.resolve().then(async () => {
            const settled = await Promise.allSettled([...this.entries].map(([agent, entry]) => this.closeEntry(agent, entry)));
            const errors = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
            if (errors.length > 0)
                throw new AggregateError(errors, `${this.options.label}: browser cleanup failed`);
            await Promise.all([...this.ownerCleanups.values()].map(close => close()));
        });
    }
    entry(agent) {
        if (this.disposing !== undefined || this.disposedOwners.has(agent) || this.ctx.get('agents')?.get(agent.id) !== agent) {
            throw new Error(`${this.options.label}: Session is not a live browser owner`);
        }
        const current = this.entries.get(agent);
        if (current !== undefined)
            return current;
        if (this.options.exclusive && this.entries.size > 0) {
            throw new Error(`${this.options.label}: attached browser is already reserved by another Session`);
        }
        if (!this.ownerCleanups.has(agent)) {
            const cleanup = agent.ctx.effect(() => async () => {
                this.disposedOwners.add(agent);
                const owned = this.entries.get(agent);
                if (owned !== undefined)
                    await this.closeEntry(agent, owned);
                this.ownerCleanups.delete(agent);
            }, `${this.options.label}.session`);
            this.ownerCleanups.set(agent, cleanup);
        }
        const controller = new AbortController();
        const entry = {
            controller,
            ready: Promise.resolve().then(() => {
                controller.signal.throwIfAborted();
                return this.options.open(agent, controller.signal);
            }).catch((error) => {
                // open() owns rollback; a failed acquisition has no remaining resource.
                this.entries.delete(agent);
                throw error;
            }),
            tail: Promise.resolve(),
        };
        // Acquisition can outlive every canceled caller; later consumers still receive its failure.
        void entry.ready.catch(() => { });
        this.entries.set(agent, entry);
        return entry;
    }
    closeEntry(agent, entry) {
        return entry.closing ??= Promise.resolve().then(async () => {
            entry.controller.abort(new Error(`${this.options.label}: Session browser is closing`));
            const resource = await entry.ready.catch(() => undefined);
            try {
                await resource?.close();
            }
            finally {
                await entry.tail;
            }
            this.entries.delete(agent);
        });
    }
}
//# sourceMappingURL=index.js.map