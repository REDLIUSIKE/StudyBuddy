/** What a `RemoteMock` saw: answered calls, opened streams, and requests without a rule. */
/** One unary call, logged when its rule is selected and settled when the rule does. */
export interface LoggedCall {
    readonly endpoint: string;
    /** Positional args as the caller passed them. */
    readonly args: readonly unknown[];
    /** `pending` until the rule settles, then `answered` or `failed`. */
    readonly state: 'pending' | 'answered' | 'failed';
    /** The answer once `answered`, the thrown error once `failed`. */
    readonly result: unknown;
    /** Global order across calls and stream opens. */
    readonly seq: number;
}
/** One stream open and its current state. */
export interface LoggedStream {
    readonly endpoint: string;
    /** Positional args the stream was opened with. */
    readonly args: readonly unknown[];
    readonly state: 'open' | 'ended' | 'failed' | 'cancelled';
    /** Items delivered to the consumer so far. */
    readonly pushed: number;
    /** Global order across calls and stream opens. */
    readonly seq: number;
}
/** One request that found no rule. */
export interface LoggedMiss {
    readonly endpoint: string;
    readonly mode: 'unary' | 'stream';
}
/** Read side of the log. */
export interface MockLog {
    /**
     * Unary calls, oldest first, with their live state.
     * @param endpoint - restrict to one endpoint.
     * @returns matching entries.
     */
    calls(endpoint?: string): readonly LoggedCall[];
    /**
     * Stream opens, oldest first, with their live state.
     * @param endpoint - restrict to one endpoint.
     * @returns matching entries.
     */
    streams(endpoint?: string): readonly LoggedStream[];
    /**
     * The first positional arg of every unary call and stream open, oldest first: the request object of the Gateway's
     * one-parameter endpoints. Without `endpoint`, every endpoint the client asked the Host for, except the Gateway's
     * own `$`-prefixed ones (`$events`).
     * @param endpoint - restrict to one endpoint.
     * @returns the requests.
     */
    requests(endpoint?: string): readonly unknown[];
    /** Requests that found no rule, oldest first. */
    unmatched(): readonly LoggedMiss[];
}
/** Mutable call entry the dispatcher settles. */
export interface CallRecord extends LoggedCall {
    state: LoggedCall['state'];
    result: unknown;
}
/** Mutable stream entry shared with the live stream. */
export interface StreamRecord extends LoggedStream {
    state: LoggedStream['state'];
    pushed: number;
}
/** The mock's log store. */
export declare class MockLogStore implements MockLog {
    private readonly callEntries;
    private readonly streamEntries;
    private readonly missEntries;
    private seq;
    calls(endpoint?: string): readonly LoggedCall[];
    streams(endpoint?: string): readonly LoggedStream[];
    requests(endpoint?: string): readonly unknown[];
    unmatched(): readonly LoggedMiss[];
    /**
     * Record one call whose rule was selected.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the mutable entry the dispatcher settles.
     */
    call(endpoint: string, args: readonly unknown[]): CallRecord;
    /**
     * Record one stream open.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the mutable entry the stream updates.
     */
    stream(endpoint: string, args: readonly unknown[]): StreamRecord;
    /**
     * Record one request without a rule.
     * @param endpoint - endpoint.
     * @param mode - how it was requested.
     */
    miss(endpoint: string, mode: 'unary' | 'stream'): void;
}
//# sourceMappingURL=log.d.ts.map