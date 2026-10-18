/** `RemoteMock`: an endpoint table (unary answers or stream scripts), live stream control, a log, and the Connection carrier face. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import { type MockLog } from './log.ts';
import { type StreamScript } from './streams.ts';
import { type MockedRemote } from './remote-proxy.ts';
/** A unary handler receives the caller's positional arguments, without its trailing `AbortSignal`. */
export type UnaryRuleFn<Args extends readonly unknown[] = readonly unknown[], Result = unknown> = (...args: Args) => Result;
/** Endpoint defaults: unary values or positional handlers, stream scripts, and stream declarations. */
export interface RemoteTable {
    readonly unary?: Readonly<Record<string, unknown>>;
    readonly stream?: Readonly<Record<string, StreamScript>>;
    /** Endpoints declared as streams without a script, so an open finds a stream miss rather than a unary one. */
    readonly streams?: readonly string[];
}
/** Construction options. */
export interface RemoteMockOptions {
    /** Host facts the built-in `$events` ready frame carries; default `{ home: '/home/mock' }`. */
    readonly host?: {
        readonly home: string;
    };
}
/** Filter over the args a stream was opened with. */
export type StreamFilter = (args: readonly unknown[]) => boolean;
/** Control and synchronization for streams opened by registered scripts; native overrides are excluded. */
export interface OpenStreams {
    /**
     * Push one item into every open stream on `endpoint`, optionally filtered by its open args.
     * @param endpoint - endpoint.
     * @param item - item to deliver.
     * @param where - filter over open args.
     * @returns how many streams received it.
     */
    push(endpoint: string, item: unknown, where?: StreamFilter): number;
    /**
     * End every matching open stream.
     * @param endpoint - endpoint.
     * @param where - filter over open args.
     * @returns how many streams ended.
     */
    end(endpoint: string, where?: StreamFilter): number;
    /**
     * Fail every matching open stream with `error`.
     * @param endpoint - endpoint.
     * @param error - error the consumer's read rejects with.
     * @param where - filter over open args.
     * @returns how many streams failed.
     */
    fail(endpoint: string, error: Error, where?: StreamFilter): number;
    /**
     * Resolve once registered scripts have opened `endpoint` at least `count` times in total.
     * @param endpoint - endpoint.
     * @param count - opens to wait for.
     */
    opened(endpoint: string, count: number): Promise<void>;
    /**
     * Resolve once the consumer of every matching stream has pulled everything pushed so far and, for a stream still
     * open, waits for more; a settled stream counts once its queue is empty, and a stream nobody reads never drains.
     * Pulled means taken from the queue: a consumer that processes items asynchronously after pulling them may still
     * be working on the last one.
     * @param endpoint - endpoint.
     * @param where - filter over open args.
     */
    drained(endpoint: string, where?: StreamFilter): Promise<void>;
}
/**
 * The success envelope the Client's Remote callers read: `{ ok: true, value }`.
 * @param value - success value.
 * @returns the envelope.
 */
export declare function ok<T>(value: T): {
    readonly ok: true;
    readonly value: T;
};
/**
 * Endpoint-named Remote mock. `dispatch` / `open` are the core; `rpc` is the
 * same core as the decoded carrier accepted by the Connection installer.
 */
export declare class RemoteMock {
    /**
     * Create a mock whose `$events` stream answers the Gateway client's opening
     * with one ready frame and then stays open, so the assembled client connects.
     * @param options - host facts for the ready frame.
     * @returns the mock.
     */
    static create(options?: RemoteMockOptions): RemoteMock;
    private readonly unaryDefaults;
    private readonly scripts;
    private live;
    private openWaiters;
    private readonly logStore;
    private readonly unaryMocks;
    private readonly streamMocks;
    /** The carrier's uplink for the open in progress through {@link open}; a direct call has none. */
    private carrierUplink;
    private readonly proxy;
    /**
     * Native mock functions for every namespace: configure answers and inspect calls without declaring method names.
     * Explicit stream registrations select stream mocks; all other methods use unary mocks.
     * Native overrides belong to this instance; `mockReset()` restores the implementation reading current defaults.
     * Generated declarations provide exact signatures; absent declarations weaken only this test-owned proxy.
     */
    readonly remote: MockedRemote;
    /** Everything observed so far. */
    readonly log: MockLog;
    /** Control over streams opened by registered scripts. */
    readonly streams: OpenStreams;
    /**
     * The Connection carrier face: `call` dispatches, `open` opens; payloads carry
     * `{ args }` as the whole-client proxies (an array) or the Gateway's own
     * endpoints (one object) send them, and a call aborted by its signal rejects.
     */
    readonly rpc: ClientConnectionRpc;
    private constructor();
    /**
     * Set the endpoint's default positional-argument handler without changing its native mock overrides.
     * @param endpoint - `<namespace>/<method>`.
     * @param rule - handler computing the answer.
     * @returns this.
     */
    unary<Args extends readonly unknown[]>(endpoint: string, rule: UnaryRuleFn<Args>): this;
    /**
     * Set the endpoint's default answer, including explicit `undefined`, without changing its native mock overrides.
     * @param endpoint - `<namespace>/<method>`.
     * @param rule - default answer.
     * @returns this.
     */
    unary(endpoint: string, rule: unknown): this;
    /**
     * Declare `endpoint` as a stream and replace its default script when supplied. A declaration without a script
     * preserves any existing script; an endpoint declared without one fails an open as a stream miss.
     * @param endpoint - `<namespace>/<method>`.
     * @param script - script (`frames` / `openStream` build the common ones).
     * @returns this.
     */
    stream(endpoint: string, script?: StreamScript): this;
    /**
     * Register endpoint defaults without changing native mock overrides.
     * @param table - unary answers and stream scripts.
     * @returns this.
     */
    load(table: RemoteTable): this;
    /**
     * Whether `endpoint` is declared a stream (with or without a script) or has a unary rule — the one declaration
     * the whole-client proxies need; an endpoint neither declared nor ruled is dispatched as a unary call.
     * @param endpoint - endpoint.
     * @returns the mode, or undefined when nothing is registered.
     */
    modeOf(endpoint: string): 'unary' | 'stream' | undefined;
    /**
     * Registered endpoints and accessed proxy methods, sorted.
     * @returns endpoint names.
     */
    endpoints(): readonly string[];
    /**
     * Answer one unary call with the registered rule's value, verbatim. The call
     * is logged as soon as its rule is selected and settles with the rule: a
     * rule that throws or rejects fails the call with that error.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the answer.
     * @throws {Error} when no rule is registered (logged as unmatched).
     */
    dispatch(endpoint: string, args: readonly unknown[]): Promise<unknown>;
    private unaryMock;
    private unaryAnswer;
    /**
     * Open through the endpoint's native mock, which is called with the generated
     * signature's arguments only; its default runs the registered script as a
     * controlled stream. A native override returns its own iterable: the caller
     * owns consumption and cancellation, outside `OpenStreams`.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @param signal - consumer cancellation.
     * @param uplink - the carrier's uplink for this open, which the script reads as `StreamHandle.uplink`;
     *   absent for a direct call, whose returned handle owns the uplink.
     * @returns the controlled script stream or the native override's caller-owned iterable.
     * @throws {Error} when the default runs without a registered script (logged as unmatched).
     */
    open(endpoint: string, args: readonly unknown[], signal: AbortSignal, uplink?: AsyncIterable<unknown>): AsyncIterable<unknown>;
    private streamMock;
    private openScript;
    /** Throw when any request found no rule, naming the endpoints and the registered ones. */
    assertNoUnmatched(): void;
    private noRuleMessage;
    /** Streams on `endpoint` still open or still holding items their consumer has not pulled; the rest are forgotten. */
    private matching;
    private forEachOpen;
    private wakeOpened;
}
//# sourceMappingURL=remote-mock.d.ts.map