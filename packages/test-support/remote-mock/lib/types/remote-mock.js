/** `RemoteMock`: an endpoint table (unary answers or stream scripts), live stream control, a log, and the Connection carrier face. */
import { fn } from '@vitest/spy';
import { MockLogStore } from "./log.js";
import { HandleUplink, MockClientStream, MockStream, toError } from "./streams.js";
import { createRemoteProxy } from "./remote-proxy.js";
const EVENTS_ENDPOINT = '$events';
/**
 * The success envelope the Client's Remote callers read: `{ ok: true, value }`.
 * @param value - success value.
 * @returns the envelope.
 */
export function ok(value) {
    return { ok: true, value };
}
/** A missing default answer is an unmatched request, not a selected rule that failed. */
class MissingUnaryRule extends Error {
}
/**
 * Endpoint-named Remote mock. `dispatch` / `open` are the core; `rpc` is the
 * same core as the decoded carrier accepted by the Connection installer.
 */
export class RemoteMock {
    /**
     * Create a mock whose `$events` stream answers the Gateway client's opening
     * with one ready frame and then stays open, so the assembled client connects.
     * @param options - host facts for the ready frame.
     * @returns the mock.
     */
    static create(options = {}) {
        const mock = new RemoteMock();
        const host = options.host ?? { home: '/home/mock' };
        let generation = 0;
        return mock.stream(EVENTS_ENDPOINT, (_args, stream) => {
            generation += 1;
            stream.push({ type: 'ready', clientId: `mock-client-${String(generation)}`, host });
        });
    }
    unaryDefaults = new Map();
    scripts = new Map();
    live = [];
    openWaiters = [];
    logStore = new MockLogStore();
    unaryMocks = new Map();
    streamMocks = new Map();
    /** The carrier's uplink for the open in progress through {@link open}; a direct call has none. */
    carrierUplink;
    proxy = createRemoteProxy(endpoint => this.modeOf(endpoint) === 'stream'
        ? this.streamMock(endpoint)
        : this.unaryMock(endpoint));
    /**
     * Native mock functions for every namespace: configure answers and inspect calls without declaring method names.
     * Explicit stream registrations select stream mocks; all other methods use unary mocks.
     * Native overrides belong to this instance; `mockReset()` restores the implementation reading current defaults.
     * Generated declarations provide exact signatures; absent declarations weaken only this test-owned proxy.
     */
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Only this test proxy becomes any without generated namespaces.
    remote = this.proxy;
    /** Everything observed so far. */
    log = this.logStore;
    /** Control over streams opened by registered scripts. */
    streams = {
        push: (endpoint, item, where) => this.forEachOpen(endpoint, where, (stream) => { stream.push(item); }),
        end: (endpoint, where) => this.forEachOpen(endpoint, where, (stream) => { stream.end(); }),
        fail: (endpoint, error, where) => this.forEachOpen(endpoint, where, (stream) => { stream.fail(error); }),
        opened: (endpoint, count) => {
            if (this.logStore.streams(endpoint).length >= count)
                return Promise.resolve();
            return new Promise((resolve) => { this.openWaiters.push({ endpoint, count, resolve }); });
        },
        drained: (endpoint, where) => Promise.all(this.matching(endpoint, where).map(stream => stream.drained())).then(() => undefined),
    };
    /**
     * The Connection carrier face: `call` dispatches, `open` opens; payloads carry
     * `{ args }` as the whole-client proxies (an array) or the Gateway's own
     * endpoints (one object) send them, and a call aborted by its signal rejects.
     */
    rpc = {
        call: async (_channel, endpoint, payload, signal) => {
            const pending = this.dispatch(endpoint, argsOf(endpoint, payload));
            const value = await (signal === undefined ? pending : settleOrAbort(pending, signal));
            // The carrier contract names the result envelope; the registered value is taken as that envelope unchecked.
            return value;
        },
        open: (_channel, endpoint, payload, signal, uplink) => this.open(endpoint, argsOf(endpoint, payload), signal, uplink),
    };
    constructor() { }
    unary(endpoint, rule) {
        this.unaryDefaults.set(endpoint, rule);
        return this;
    }
    /**
     * Declare `endpoint` as a stream and replace its default script when supplied. A declaration without a script
     * preserves any existing script; an endpoint declared without one fails an open as a stream miss.
     * @param endpoint - `<namespace>/<method>`.
     * @param script - script (`frames` / `openStream` build the common ones).
     * @returns this.
     */
    stream(endpoint, script) {
        if (script !== undefined || !this.scripts.has(endpoint))
            this.scripts.set(endpoint, script);
        return this;
    }
    /**
     * Register endpoint defaults without changing native mock overrides.
     * @param table - unary answers and stream scripts.
     * @returns this.
     */
    load(table) {
        for (const [endpoint, rule] of Object.entries(table.unary ?? {}))
            this.unary(endpoint, rule);
        for (const endpoint of table.streams ?? [])
            this.stream(endpoint);
        for (const [endpoint, script] of Object.entries(table.stream ?? {}))
            this.stream(endpoint, script);
        return this;
    }
    /**
     * Whether `endpoint` is declared a stream (with or without a script) or has a unary rule — the one declaration
     * the whole-client proxies need; an endpoint neither declared nor ruled is dispatched as a unary call.
     * @param endpoint - endpoint.
     * @returns the mode, or undefined when nothing is registered.
     */
    modeOf(endpoint) {
        if (this.scripts.has(endpoint))
            return 'stream';
        if (this.unaryDefaults.has(endpoint))
            return 'unary';
        return undefined;
    }
    /**
     * Registered endpoints and accessed proxy methods, sorted.
     * @returns endpoint names.
     */
    endpoints() {
        const names = new Set(this.scripts.keys());
        for (const endpoint of this.unaryDefaults.keys())
            names.add(endpoint);
        for (const [namespace, methods] of Object.entries(this.proxy)) {
            for (const method of Object.keys(methods))
                names.add(`${namespace}/${method}`);
        }
        return [...names].sort();
    }
    /**
     * Answer one unary call with the registered rule's value, verbatim. The call
     * is logged as soon as its rule is selected and settles with the rule: a
     * rule that throws or rejects fails the call with that error.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the answer.
     * @throws {Error} when no rule is registered (logged as unmatched).
     */
    async dispatch(endpoint, args) {
        let answer;
        try {
            answer = this.unaryMock(endpoint)(...args);
        }
        catch (error) {
            if (error instanceof MissingUnaryRule)
                throw error;
            answer = Promise.reject(toError(error));
        }
        const record = this.logStore.call(endpoint, args);
        try {
            record.result = await answer;
        }
        catch (error) {
            record.state = 'failed';
            record.result = error;
            throw error;
        }
        record.state = 'answered';
        return record.result;
    }
    unaryMock(endpoint) {
        let mock = this.unaryMocks.get(endpoint);
        if (mock === undefined) {
            mock = fn((...args) => Promise.resolve(this.unaryAnswer(endpoint, args)));
            this.unaryMocks.set(endpoint, mock);
        }
        return mock;
    }
    unaryAnswer(endpoint, args) {
        if (!this.unaryDefaults.has(endpoint)) {
            this.logStore.miss(endpoint, 'unary');
            throw new MissingUnaryRule(this.noRuleMessage(endpoint));
        }
        const rule = this.unaryDefaults.get(endpoint);
        return isRuleFn(rule) ? answerOf(rule, args) : rule;
    }
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
    open(endpoint, args, signal, uplink) {
        this.carrierUplink = uplink;
        try {
            return this.streamMock(endpoint)(...args, signal);
        }
        finally {
            this.carrierUplink = undefined;
        }
    }
    streamMock(endpoint) {
        let mock = this.streamMocks.get(endpoint);
        if (mock === undefined) {
            mock = fn((...values) => {
                const args = [...values];
                const signal = args.at(-1) instanceof AbortSignal ? args.pop() : new AbortController().signal;
                return this.openScript(endpoint, args, signal, this.carrierUplink);
            });
            this.streamMocks.set(endpoint, mock);
        }
        return mock;
    }
    openScript(endpoint, args, signal, carrierUplink) {
        const script = this.scripts.get(endpoint);
        if (script === undefined) {
            this.logStore.miss(endpoint, 'stream');
            throw new Error(this.noRuleMessage(endpoint));
        }
        let uplink;
        let owned;
        if (carrierUplink === undefined) {
            owned = new HandleUplink();
            uplink = owned;
        }
        else {
            uplink = carrierUplink;
        }
        const stream = new MockStream(this.logStore.stream(endpoint, args), signal, uplink, () => { owned?.close(); });
        this.live.push(stream);
        this.wakeOpened(endpoint);
        stream.run(script, args);
        return new MockClientStream(stream, owned);
    }
    /** Throw when any request found no rule, naming the endpoints and the registered ones. */
    assertNoUnmatched() {
        const unmatched = this.logStore.unmatched();
        if (unmatched.length === 0)
            return;
        const lines = unmatched.map(entry => `  ${entry.endpoint} (${entry.mode})`);
        throw new Error(`remote-mock: ${String(unmatched.length)} unmatched request(s):\n${lines.join('\n')}\nregistered: ${this.endpoints().join(', ')}`);
    }
    noRuleMessage(endpoint) {
        return `remote-mock: no rule for ${endpoint}; registered: ${this.endpoints().join(', ')}`;
    }
    /** Streams on `endpoint` still open or still holding items their consumer has not pulled; the rest are forgotten. */
    matching(endpoint, where) {
        this.live = this.live.filter(stream => stream.record.state === 'open' || stream.queued > 0);
        return this.live.filter(stream => stream.record.endpoint === endpoint && (where === undefined || where(stream.record.args)));
    }
    forEachOpen(endpoint, where, action) {
        const targets = this.matching(endpoint, where).filter(stream => stream.record.state === 'open');
        for (const stream of targets)
            action(stream);
        return targets.length;
    }
    wakeOpened(endpoint) {
        const opened = this.logStore.streams(endpoint).length;
        const ready = this.openWaiters.filter(waiter => waiter.endpoint === endpoint && opened >= waiter.count);
        this.openWaiters = this.openWaiters.filter(waiter => !ready.includes(waiter));
        for (const waiter of ready)
            waiter.resolve();
    }
}
function isRuleFn(rule) {
    return typeof rule === 'function';
}
/** A rule's synchronous throw becomes a rejection so the call settles through one path. */
function answerOf(rule, args) {
    try {
        return rule(...args);
    }
    catch (error) {
        return Promise.reject(toError(error));
    }
}
/** Positional args from a carrier payload: the array the whole-client proxies send, or the one object the Gateway's own endpoints send. */
function argsOf(endpoint, payload) {
    if (typeof payload === 'object' && payload !== null && 'args' in payload) {
        const { args } = payload;
        if (Array.isArray(args))
            return args;
        if (typeof args === 'object' && args !== null)
            return [args];
    }
    throw new TypeError(`remote-mock: payload of ${endpoint} must be { args: unknown[] | object }`);
}
/**
 * Settle with the call, or reject with the abort reason first; the call itself
 * always keeps a handler so its own outcome is never an unhandled rejection.
 */
function settleOrAbort(pending, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('remote-mock: call aborted', { cause: signal.reason })); };
        signal.addEventListener('abort', abort, { once: true });
        pending.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort); });
        if (signal.aborted)
            abort();
    });
}
//# sourceMappingURL=remote-mock.js.map