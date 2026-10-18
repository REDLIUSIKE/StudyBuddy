/** Stream scripts and the pushable, abort-aware stream a script drives. */
import { isRemoteUplinkItem } from '@deepseek-ai/dsh-typert-protocol';
/**
 * Type a fake stream method's result as the handle a generated Client method
 * returns. The uplink members are inert: a fake built on it drives the downlink only.
 * @param source - downlink items the fake yields.
 * @returns a handle that iterates `source`.
 */
export function streamHandle(source) {
    return {
        [Symbol.asyncIterator]: () => source[Symbol.asyncIterator](),
        send: () => undefined,
        end: () => undefined,
        dispose: () => undefined,
    };
}
/**
 * Lift a fake stream method written as an async generator function into the
 * signature of the generated method it stands in for.
 * @param method - fake taking the method's arguments and yielding its downlink items.
 * @returns the fake returning {@link streamHandle} of each call.
 */
export function streamMethod(method) {
    const lifted = (...args) => streamHandle(method(...args));
    return lifted;
}
/**
 * Script yielding `items`, then ending.
 * @param items - items in order.
 * @returns the script.
 */
export function frames(items) {
    return (_args, stream) => {
        for (const item of items)
            stream.push(item);
        stream.end();
    };
}
/**
 * Script yielding `initial`, then staying open for `streams.push`.
 * @param initial - items yielded on open.
 * @returns the script.
 */
export function openStream(initial = []) {
    return (_args, stream) => {
        for (const item of initial)
            stream.push(item);
    };
}
/** One open stream: a queue the script pushes into and a single consumer reads from; the log entry tracks its state. */
export class MockStream {
    record;
    sourceSignal;
    uplink;
    release;
    queue = [];
    settled;
    waiting;
    drainWaiters = [];
    cancellation = new AbortController();
    signal = this.cancellation.signal;
    /** Consumer cancellation listener; attached while the stream is open, removed when it settles or cancels. */
    onAbort = () => { this.cancel(this.sourceSignal.reason); };
    /** Items pushed but not yet pulled by the consumer. */
    get queued() {
        return this.queue.length;
    }
    /**
     * @param record - log entry this stream updates.
     * @param sourceSignal - cancellation from the caller that opened the stream.
     * @param uplink - the uplink the script reads.
     * @param release - closes the uplink this stream owns; called once, when the stream settles, is cancelled, or the consumer leaves.
     */
    constructor(record, sourceSignal, uplink, release) {
        this.record = record;
        this.sourceSignal = sourceSignal;
        this.uplink = uplink;
        this.release = release;
        if (sourceSignal.aborted)
            this.cancel(sourceSignal.reason);
        else
            sourceSignal.addEventListener('abort', this.onAbort, { once: true });
    }
    push(item) {
        if (this.record.state !== 'open')
            return;
        this.record.pushed += 1;
        if (this.waiting !== undefined) {
            const { resolve } = this.waiting;
            this.waiting = undefined;
            resolve({ value: item, done: false });
            return;
        }
        this.queue.push(item);
    }
    end() {
        this.settle({ kind: 'end' }, 'ended');
    }
    fail(error) {
        this.settle({ kind: 'fail', error }, 'failed');
    }
    /** The consumer left: cancel the stream and drop what it left. */
    dispose() {
        this.cancel(new Error(`remote-mock: ${this.record.endpoint} stream disposed`));
    }
    /**
     * Start `script` on this stream.
     * @param script - the registered script.
     * @param args - open args.
     */
    run(script, args) {
        let outcome;
        try {
            outcome = script(args, this);
        }
        catch (error) {
            this.fail(toError(error));
            return;
        }
        if (outcome instanceof Promise)
            void outcome.catch((error) => { this.fail(toError(error)); });
    }
    /**
     * Resolve once the consumer has pulled every queued item and waits for the next one, or the stream is no longer
     * open and holds nothing the consumer could still pull (a consumer that returns discards what it left).
     * @returns settles when drained.
     */
    drained() {
        if (this.isDrained())
            return Promise.resolve();
        return new Promise((resolve) => { this.drainWaiters.push(resolve); });
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => this.next(),
            return: () => {
                this.cancel();
                return Promise.resolve({ value: undefined, done: true });
            },
        };
    }
    next() {
        const result = this.pull();
        this.wakeDrained();
        return result;
    }
    pull() {
        if (this.queue.length > 0)
            return Promise.resolve({ value: this.queue.shift(), done: false });
        if (this.settled !== undefined)
            return this.finish(this.settled);
        if (this.record.state === 'cancelled')
            return Promise.resolve({ value: undefined, done: true });
        if (this.waiting !== undefined)
            return Promise.reject(new Error(`remote-mock: ${this.record.endpoint} stream has one consumer`));
        return new Promise((resolve, reject) => { this.waiting = { resolve, reject }; });
    }
    finish(settled) {
        return settled.kind === 'end' ? Promise.resolve({ value: undefined, done: true }) : Promise.reject(settled.error);
    }
    settle(settled, state) {
        if (this.record.state !== 'open')
            return;
        this.record.state = state;
        this.settled = settled;
        this.sourceSignal.removeEventListener('abort', this.onAbort);
        this.release();
        this.wakeDrained();
        // A pending read exists only while the queue is empty: push() resolves it directly instead of queueing.
        const waiting = this.waiting;
        if (waiting === undefined)
            return;
        this.waiting = undefined;
        void this.finish(settled).then(waiting.resolve, waiting.reject);
    }
    cancel(reason) {
        if (this.record.state === 'open') {
            this.record.state = 'cancelled';
            this.sourceSignal.removeEventListener('abort', this.onAbort);
            const waiting = this.waiting;
            this.waiting = undefined;
            this.queue.length = 0;
            this.cancellation.abort(reason);
            this.release();
            waiting?.resolve({ value: undefined, done: true });
        }
        // Whether cancelled or left after the producer settled, the consumer pulls nothing more: drop what it left.
        this.queue.length = 0;
        this.wakeDrained();
    }
    isDrained() {
        return this.queue.length === 0 && (this.waiting !== undefined || this.record.state !== 'open');
    }
    wakeDrained() {
        if (!this.isDrained())
            return;
        const waiters = this.drainWaiters;
        this.drainWaiters = [];
        for (const resolve of waiters)
            resolve();
    }
}
/**
 * The uplink a direct handle owns: `send()` pushes, `end()` half-closes, and
 * `close()` ends it and drops unread items once the stream settles, is
 * cancelled, or the consumer leaves. The script reads it as `StreamHandle.uplink`.
 */
export class HandleUplink {
    items = [];
    done = false;
    waiter;
    /**
     * Queues one uplink item for the script, or completes the read waiting for it.
     * @param item - the item the handle's `send()` carried.
     * @throws {Error} after `end()`.
     */
    push(item) {
        if (this.done)
            throw new Error('remote-mock: uplink was ended');
        const waiter = this.waiter;
        this.waiter = undefined;
        if (waiter === undefined)
            this.items.push(item);
        else
            waiter({ value: item, done: false });
    }
    /** Half-closes the uplink: pending and later reads complete as done; repeated calls are no-ops. */
    end() {
        if (this.done)
            return;
        this.done = true;
        this.waiter?.({ value: undefined, done: true });
        this.waiter = undefined;
    }
    /** Ends the uplink and drops unread items; the owning stream calls it on settle or cancel, the script's iterator on `return()`. */
    close() {
        this.items.length = 0;
        this.end();
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                if (this.items.length > 0)
                    return Promise.resolve({ value: this.items.shift(), done: false });
                if (this.done)
                    return Promise.resolve({ value: undefined, done: true });
                return new Promise((resolve) => { this.waiter = resolve; });
            },
            return: () => {
                this.close();
                return Promise.resolve({ value: undefined, done: true });
            },
        };
    }
}
/**
 * The handle a direct `mock.remote` stream call returns, as a generated method
 * would: iterate it for the script's downlink, `send()` and `end()` feed
 * `StreamHandle.uplink`, `dispose()` cancels the stream. `send()` applies the
 * real handle's check, so a non-lossless JSON item throws and a top-level
 * `undefined` passes. A stream opened through `rpc.open` reads the carrier's
 * uplink instead, and this handle owns none.
 */
export class MockClientStream {
    stream;
    uplink;
    /**
     * @param stream - the script-side stream.
     * @param uplink - the uplink this handle feeds; absent when the carrier supplied one.
     */
    constructor(stream, uplink) {
        this.stream = stream;
        this.uplink = uplink;
    }
    send(item) {
        if (this.uplink === undefined) {
            throw new Error(`remote-mock: ${this.stream.record.endpoint} uplink belongs to the carrier that opened the stream`);
        }
        if (!isRemoteUplinkItem(item)) {
            throw new Error(`remote-mock: ${this.stream.record.endpoint} uplink item is not a lossless JSON value`);
        }
        this.uplink.push(item);
    }
    end() {
        this.uplink?.end();
    }
    dispose() {
        this.stream.dispose();
    }
    [Symbol.asyncIterator]() {
        return this.stream[Symbol.asyncIterator]();
    }
}
/**
 * The `Error` a thrown value stands for: itself, or a new Error carrying its string form.
 * @param reason - thrown value.
 * @returns the error.
 */
export function toError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
}
//# sourceMappingURL=streams.js.map