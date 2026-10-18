/** Bounded successful results; each caller reauthorizes and checks source freshness before reuse. */
export class OfficePreviewCache {
    stat;
    convert;
    maxEntries;
    maxBytes;
    maxPending;
    maxReaders;
    currentGeneration;
    busy;
    ready = new Map();
    pending = new Map();
    bytes = 0;
    readers = 0;
    generation;
    generationQuery = 0;
    acceptedQuery = 0;
    superseded = new Error();
    lifetime = new AbortController();
    tasks = new Set();
    reads = new Set();
    /**
     * @param stat - authorized source metadata lookup.
     * @param convert - Host render Remote returning binary PDF bytes borrowed read-only by callers.
     * @param maxEntries - maximum completed results retained.
     * @param maxBytes - maximum retained PDF byteLength.
     * @param maxPending - maximum unsettled Host conversion requests, including cancellation teardown.
     * @param maxReaders - maximum readers, including metadata lookups.
     * @param generation - current Host renderer generation, checked before cached reuse.
     * @param busy - localized capacity failure.
     */
    constructor(stat, convert, maxEntries, maxBytes, maxPending, maxReaders, currentGeneration, busy) {
        this.stat = stat;
        this.convert = convert;
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
        this.maxPending = maxPending;
        this.maxReaders = maxReaders;
        this.currentGeneration = currentGeneration;
        this.busy = busy;
    }
    /**
     * Share a conversion without letting one caller cancel another caller's work.
     * Renderer replacement retries authorization once; repeated replacement reports localized capacity failure.
     * @param file - Session authorization scope and source path.
     * @param signal - this caller's lifetime.
     * @param priority - foreground preview or speculative read.
     * @returns current PDF bytes borrowed read-only, or a declared source-read failure; cancellation rejects.
     */
    async read(file, signal, priority = 'foreground') {
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        const readerLimit = priority === 'background' ? this.maxReaders - 1 : this.maxReaders;
        if (this.readers >= readerLimit || (priority === 'background' && this.maxPending === 1))
            throw this.busy();
        this.readers++;
        const operation = this.lookup(file, signal, priority);
        this.reads.add(operation);
        try {
            return await operation;
        }
        finally {
            this.readers--;
            this.reads.delete(operation);
        }
    }
    async lookup(file, signal, priority) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await this.lookupGeneration(file, signal, priority);
            }
            catch (error) {
                if (error !== this.superseded)
                    throw error;
            }
        }
        throw this.busy();
    }
    async lookupGeneration(file, signal, priority) {
        signal = AbortSignal.any([signal, this.lifetime.signal]);
        signal.throwIfAborted();
        const query = ++this.generationQuery;
        const generation = await this.currentGeneration(signal);
        signal.throwIfAborted();
        if (!generation.ok)
            return generation;
        if (query < this.acceptedQuery && generation.value !== this.generation)
            throw this.superseded;
        this.acceptedQuery = Math.max(query, this.acceptedQuery);
        if (generation.value !== this.generation) {
            this.generation = generation.value;
            this.ready.clear();
            this.bytes = 0;
            for (const pending of this.pending.values())
                pending.controller.abort(this.superseded);
            this.pending.clear();
        }
        const metadata = await this.stat(file, signal);
        signal.throwIfAborted();
        if (!metadata.ok)
            return metadata;
        if (generation.value !== this.generation)
            throw this.superseded;
        const key = JSON.stringify([generation.value, file.sessionId, metadata.value.absolutePath, metadata.value.version]);
        const cached = this.ready.get(key);
        if (cached !== undefined) {
            this.ready.delete(key);
            this.ready.set(key, cached);
            return cached;
        }
        // A foreground RPC joins and promotes background work at the shared Host queue.
        const pendingKey = JSON.stringify([key, priority]);
        let entry = this.pending.get(pendingKey);
        if (entry === undefined) {
            const pendingLimit = priority === 'background' ? this.maxPending - 1 : this.maxPending;
            if (this.tasks.size >= pendingLimit)
                throw this.busy();
            const controller = new AbortController();
            const promise = Promise.resolve().then(() => {
                controller.signal.throwIfAborted();
                return this.convert(file, controller.signal, priority);
            }).then((result) => {
                controller.signal.throwIfAborted();
                if (generation.value === this.generation && result.ok && result.value.generation === generation.value
                    && result.value.version === metadata.value.version
                    && result.value.absolutePath === metadata.value.absolutePath) {
                    this.retain(key, result);
                }
                return result;
            }).finally(() => {
                this.tasks.delete(promise);
                if (this.pending.get(pendingKey)?.controller === controller)
                    this.pending.delete(pendingKey);
            });
            this.tasks.add(promise);
            entry = { controller, promise, users: 0 };
            this.pending.set(pendingKey, entry);
        }
        const shared = entry;
        shared.users += 1;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = () => {
                if (settled)
                    return false;
                settled = true;
                signal.removeEventListener('abort', abort);
                shared.users -= 1;
                if (shared.users === 0 && this.pending.get(pendingKey) === shared) {
                    this.pending.delete(pendingKey);
                    shared.controller.abort();
                }
                return true;
            };
            const abort = () => {
                const reason = signal.reason;
                finish();
                reject(reason instanceof Error ? reason : new Error('Office preview cancelled', { cause: reason }));
            };
            signal.addEventListener('abort', abort, { once: true });
            shared.promise.then((result) => { if (finish())
                resolve(result); }, (error) => { if (finish())
                reject(error instanceof Error ? error : new Error('Office preview failed', { cause: error })); });
        });
    }
    /** Clear retained bytes, cancel outstanding conversions, and await their completion. */
    async dispose() {
        this.lifetime.abort();
        this.pending.clear();
        this.ready.clear();
        this.bytes = 0;
        await Promise.allSettled([...this.reads, ...this.tasks]);
    }
    retain(key, result) {
        const previous = this.ready.get(key);
        if (previous !== undefined) {
            this.ready.delete(key);
            this.bytes -= previous.value.data.byteLength;
        }
        const size = result.value.data.byteLength;
        if (size > this.maxBytes)
            return;
        while (this.ready.size >= this.maxEntries || this.bytes + size > this.maxBytes) {
            const oldest = this.ready.entries().next().value;
            this.ready.delete(oldest[0]);
            this.bytes -= oldest[1].value.data.byteLength;
        }
        this.ready.set(key, result);
        this.bytes += size;
    }
}
//# sourceMappingURL=cache.js.map