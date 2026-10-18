/** Stream scripts and the pushable, abort-aware stream a script drives. */
import { type RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol';
import type { StreamRecord } from './log.ts';
/**
 * Type a fake stream method's result as the handle a generated Client method
 * returns. The uplink members are inert: a fake built on it drives the downlink only.
 * @param source - downlink items the fake yields.
 * @returns a handle that iterates `source`.
 */
export declare function streamHandle<Out, In = never>(source: AsyncIterable<Out>): RemoteStreamHandle<Out, In>;
/** Downlink item type of one generated stream method. */
type StreamItem<Method> = Method extends (...args: never[]) => RemoteStreamHandle<infer Out, unknown> ? Out : never;
/**
 * Lift a fake stream method written as an async generator function into the
 * signature of the generated method it stands in for.
 * @param method - fake taking the method's arguments and yielding its downlink items.
 * @returns the fake returning {@link streamHandle} of each call.
 */
export declare function streamMethod<Method extends (...args: never[]) => RemoteStreamHandle<unknown, unknown>>(method: (...args: Parameters<Method>) => AsyncIterable<StreamItem<Method>>): Method;
/** Test-side controls over one open stream. */
export interface StreamHandle {
    /** Queue one item for the consumer. */
    push(item: unknown): void;
    /** End the stream after the queued items drain. */
    end(): void;
    /** Fail the consumer's next read with `error` after the queued items drain. */
    fail(error: Error): void;
    /** Aborts when the opening signal aborts or the consumer returns early. */
    readonly signal: AbortSignal;
    /**
     * Uplink items for the script: the carrier's iterable when the open came
     * through `rpc.open`, otherwise what the returned handle's `send()` and
     * `end()` feed.
     */
    readonly uplink: AsyncIterable<unknown>;
}
/**
 * How a stream endpoint answers an open: receives the open args and the
 * handle; the stream stays open after the script returns until `end()` or
 * `fail()`. A script that throws or rejects fails the stream with that error.
 */
export type StreamScript = (args: readonly unknown[], stream: StreamHandle) => void | Promise<void>;
/**
 * Script yielding `items`, then ending.
 * @param items - items in order.
 * @returns the script.
 */
export declare function frames(items: readonly unknown[]): StreamScript;
/**
 * Script yielding `initial`, then staying open for `streams.push`.
 * @param initial - items yielded on open.
 * @returns the script.
 */
export declare function openStream(initial?: readonly unknown[]): StreamScript;
/** One open stream: a queue the script pushes into and a single consumer reads from; the log entry tracks its state. */
export declare class MockStream implements StreamHandle, AsyncIterable<unknown> {
    readonly record: StreamRecord;
    private readonly sourceSignal;
    readonly uplink: AsyncIterable<unknown>;
    private readonly release;
    private readonly queue;
    private settled;
    private waiting;
    private drainWaiters;
    private readonly cancellation;
    readonly signal: AbortSignal;
    /** Consumer cancellation listener; attached while the stream is open, removed when it settles or cancels. */
    private readonly onAbort;
    /** Items pushed but not yet pulled by the consumer. */
    get queued(): number;
    /**
     * @param record - log entry this stream updates.
     * @param sourceSignal - cancellation from the caller that opened the stream.
     * @param uplink - the uplink the script reads.
     * @param release - closes the uplink this stream owns; called once, when the stream settles, is cancelled, or the consumer leaves.
     */
    constructor(record: StreamRecord, sourceSignal: AbortSignal, uplink: AsyncIterable<unknown>, release: () => void);
    push(item: unknown): void;
    end(): void;
    fail(error: Error): void;
    /** The consumer left: cancel the stream and drop what it left. */
    dispose(): void;
    /**
     * Start `script` on this stream.
     * @param script - the registered script.
     * @param args - open args.
     */
    run(script: StreamScript, args: readonly unknown[]): void;
    /**
     * Resolve once the consumer has pulled every queued item and waits for the next one, or the stream is no longer
     * open and holds nothing the consumer could still pull (a consumer that returns discards what it left).
     * @returns settles when drained.
     */
    drained(): Promise<void>;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
    private next;
    private pull;
    private finish;
    private settle;
    private cancel;
    private isDrained;
    private wakeDrained;
}
/**
 * The uplink a direct handle owns: `send()` pushes, `end()` half-closes, and
 * `close()` ends it and drops unread items once the stream settles, is
 * cancelled, or the consumer leaves. The script reads it as `StreamHandle.uplink`.
 */
export declare class HandleUplink implements AsyncIterable<unknown> {
    private readonly items;
    private done;
    private waiter;
    /**
     * Queues one uplink item for the script, or completes the read waiting for it.
     * @param item - the item the handle's `send()` carried.
     * @throws {Error} after `end()`.
     */
    push(item: unknown): void;
    /** Half-closes the uplink: pending and later reads complete as done; repeated calls are no-ops. */
    end(): void;
    /** Ends the uplink and drops unread items; the owning stream calls it on settle or cancel, the script's iterator on `return()`. */
    close(): void;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
}
/**
 * The handle a direct `mock.remote` stream call returns, as a generated method
 * would: iterate it for the script's downlink, `send()` and `end()` feed
 * `StreamHandle.uplink`, `dispose()` cancels the stream. `send()` applies the
 * real handle's check, so a non-lossless JSON item throws and a top-level
 * `undefined` passes. A stream opened through `rpc.open` reads the carrier's
 * uplink instead, and this handle owns none.
 */
export declare class MockClientStream implements RemoteStreamHandle<unknown, unknown> {
    private readonly stream;
    private readonly uplink;
    /**
     * @param stream - the script-side stream.
     * @param uplink - the uplink this handle feeds; absent when the carrier supplied one.
     */
    constructor(stream: MockStream, uplink: HandleUplink | undefined);
    send(item: unknown): void;
    end(): void;
    dispose(): void;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
}
/**
 * The `Error` a thrown value stands for: itself, or a new Error carrying its string form.
 * @param reason - thrown value.
 * @returns the error.
 */
export declare function toError(reason: unknown): Error;
export {};
//# sourceMappingURL=streams.d.ts.map