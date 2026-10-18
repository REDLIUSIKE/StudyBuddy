import { fn } from "@vitest/spy";
import { isRemoteUplinkItem } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/log.js
/** What a `RemoteMock` saw: answered calls, opened streams, and requests without a rule. */
/** The mock's log store. */
var MockLogStore = class {
	callEntries = [];
	streamEntries = [];
	missEntries = [];
	seq = 0;
	calls(endpoint) {
		return this.callEntries.filter((entry) => endpoint === void 0 || entry.endpoint === endpoint);
	}
	streams(endpoint) {
		return this.streamEntries.filter((entry) => endpoint === void 0 || entry.endpoint === endpoint);
	}
	requests(endpoint) {
		return [...this.calls(endpoint), ...this.streams(endpoint)].filter((entry) => endpoint !== void 0 || !entry.endpoint.startsWith("$")).sort((a, b) => a.seq - b.seq).map((entry) => entry.args[0]);
	}
	unmatched() {
		return [...this.missEntries];
	}
	/**
	* Record one call whose rule was selected.
	* @param endpoint - endpoint.
	* @param args - positional args.
	* @returns the mutable entry the dispatcher settles.
	*/
	call(endpoint, args) {
		const record = {
			endpoint,
			args,
			state: "pending",
			result: void 0,
			seq: ++this.seq
		};
		this.callEntries.push(record);
		return record;
	}
	/**
	* Record one stream open.
	* @param endpoint - endpoint.
	* @param args - positional args.
	* @returns the mutable entry the stream updates.
	*/
	stream(endpoint, args) {
		const record = {
			endpoint,
			args,
			state: "open",
			pushed: 0,
			seq: ++this.seq
		};
		this.streamEntries.push(record);
		return record;
	}
	/**
	* Record one request without a rule.
	* @param endpoint - endpoint.
	* @param mode - how it was requested.
	*/
	miss(endpoint, mode) {
		this.missEntries.push({
			endpoint,
			mode
		});
	}
};
//#endregion
//#region lib/types/streams.js
/** Stream scripts and the pushable, abort-aware stream a script drives. */
/**
* Type a fake stream method's result as the handle a generated Client method
* returns. The uplink members are inert: a fake built on it drives the downlink only.
* @param source - downlink items the fake yields.
* @returns a handle that iterates `source`.
*/
function streamHandle(source) {
	return {
		[Symbol.asyncIterator]: () => source[Symbol.asyncIterator](),
		send: () => void 0,
		end: () => void 0,
		dispose: () => void 0
	};
}
/**
* Lift a fake stream method written as an async generator function into the
* signature of the generated method it stands in for.
* @param method - fake taking the method's arguments and yielding its downlink items.
* @returns the fake returning {@link streamHandle} of each call.
*/
function streamMethod(method) {
	const lifted = (...args) => streamHandle(method(...args));
	return lifted;
}
/**
* Script yielding `items`, then ending.
* @param items - items in order.
* @returns the script.
*/
function frames(items) {
	return (_args, stream) => {
		for (const item of items) stream.push(item);
		stream.end();
	};
}
/**
* Script yielding `initial`, then staying open for `streams.push`.
* @param initial - items yielded on open.
* @returns the script.
*/
function openStream(initial = []) {
	return (_args, stream) => {
		for (const item of initial) stream.push(item);
	};
}
/** One open stream: a queue the script pushes into and a single consumer reads from; the log entry tracks its state. */
var MockStream = class {
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
	onAbort = () => {
		this.cancel(this.sourceSignal.reason);
	};
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
		if (sourceSignal.aborted) this.cancel(sourceSignal.reason);
		else sourceSignal.addEventListener("abort", this.onAbort, { once: true });
	}
	push(item) {
		if (this.record.state !== "open") return;
		this.record.pushed += 1;
		if (this.waiting !== void 0) {
			const { resolve } = this.waiting;
			this.waiting = void 0;
			resolve({
				value: item,
				done: false
			});
			return;
		}
		this.queue.push(item);
	}
	end() {
		this.settle({ kind: "end" }, "ended");
	}
	fail(error) {
		this.settle({
			kind: "fail",
			error
		}, "failed");
	}
	/** The consumer left: cancel the stream and drop what it left. */
	dispose() {
		this.cancel(/* @__PURE__ */ new Error(`remote-mock: ${this.record.endpoint} stream disposed`));
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
		} catch (error) {
			this.fail(toError(error));
			return;
		}
		if (outcome instanceof Promise) outcome.catch((error) => {
			this.fail(toError(error));
		});
	}
	/**
	* Resolve once the consumer has pulled every queued item and waits for the next one, or the stream is no longer
	* open and holds nothing the consumer could still pull (a consumer that returns discards what it left).
	* @returns settles when drained.
	*/
	drained() {
		if (this.isDrained()) return Promise.resolve();
		return new Promise((resolve) => {
			this.drainWaiters.push(resolve);
		});
	}
	[Symbol.asyncIterator]() {
		return {
			next: () => this.next(),
			return: () => {
				this.cancel();
				return Promise.resolve({
					value: void 0,
					done: true
				});
			}
		};
	}
	next() {
		const result = this.pull();
		this.wakeDrained();
		return result;
	}
	pull() {
		if (this.queue.length > 0) return Promise.resolve({
			value: this.queue.shift(),
			done: false
		});
		if (this.settled !== void 0) return this.finish(this.settled);
		if (this.record.state === "cancelled") return Promise.resolve({
			value: void 0,
			done: true
		});
		if (this.waiting !== void 0) return Promise.reject(/* @__PURE__ */ new Error(`remote-mock: ${this.record.endpoint} stream has one consumer`));
		return new Promise((resolve, reject) => {
			this.waiting = {
				resolve,
				reject
			};
		});
	}
	finish(settled) {
		return settled.kind === "end" ? Promise.resolve({
			value: void 0,
			done: true
		}) : Promise.reject(settled.error);
	}
	settle(settled, state) {
		if (this.record.state !== "open") return;
		this.record.state = state;
		this.settled = settled;
		this.sourceSignal.removeEventListener("abort", this.onAbort);
		this.release();
		this.wakeDrained();
		const waiting = this.waiting;
		if (waiting === void 0) return;
		this.waiting = void 0;
		this.finish(settled).then(waiting.resolve, waiting.reject);
	}
	cancel(reason) {
		if (this.record.state === "open") {
			this.record.state = "cancelled";
			this.sourceSignal.removeEventListener("abort", this.onAbort);
			const waiting = this.waiting;
			this.waiting = void 0;
			this.queue.length = 0;
			this.cancellation.abort(reason);
			this.release();
			waiting?.resolve({
				value: void 0,
				done: true
			});
		}
		this.queue.length = 0;
		this.wakeDrained();
	}
	isDrained() {
		return this.queue.length === 0 && (this.waiting !== void 0 || this.record.state !== "open");
	}
	wakeDrained() {
		if (!this.isDrained()) return;
		const waiters = this.drainWaiters;
		this.drainWaiters = [];
		for (const resolve of waiters) resolve();
	}
};
/**
* The uplink a direct handle owns: `send()` pushes, `end()` half-closes, and
* `close()` ends it and drops unread items once the stream settles, is
* cancelled, or the consumer leaves. The script reads it as `StreamHandle.uplink`.
*/
var HandleUplink = class {
	items = [];
	done = false;
	waiter;
	/**
	* Queues one uplink item for the script, or completes the read waiting for it.
	* @param item - the item the handle's `send()` carried.
	* @throws {Error} after `end()`.
	*/
	push(item) {
		if (this.done) throw new Error("remote-mock: uplink was ended");
		const waiter = this.waiter;
		this.waiter = void 0;
		if (waiter === void 0) this.items.push(item);
		else waiter({
			value: item,
			done: false
		});
	}
	/** Half-closes the uplink: pending and later reads complete as done; repeated calls are no-ops. */
	end() {
		if (this.done) return;
		this.done = true;
		this.waiter?.({
			value: void 0,
			done: true
		});
		this.waiter = void 0;
	}
	/** Ends the uplink and drops unread items; the owning stream calls it on settle or cancel, the script's iterator on `return()`. */
	close() {
		this.items.length = 0;
		this.end();
	}
	[Symbol.asyncIterator]() {
		return {
			next: () => {
				if (this.items.length > 0) return Promise.resolve({
					value: this.items.shift(),
					done: false
				});
				if (this.done) return Promise.resolve({
					value: void 0,
					done: true
				});
				return new Promise((resolve) => {
					this.waiter = resolve;
				});
			},
			return: () => {
				this.close();
				return Promise.resolve({
					value: void 0,
					done: true
				});
			}
		};
	}
};
/**
* The handle a direct `mock.remote` stream call returns, as a generated method
* would: iterate it for the script's downlink, `send()` and `end()` feed
* `StreamHandle.uplink`, `dispose()` cancels the stream. `send()` applies the
* real handle's check, so a non-lossless JSON item throws and a top-level
* `undefined` passes. A stream opened through `rpc.open` reads the carrier's
* uplink instead, and this handle owns none.
*/
var MockClientStream = class {
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
		if (this.uplink === void 0) throw new Error(`remote-mock: ${this.stream.record.endpoint} uplink belongs to the carrier that opened the stream`);
		if (!isRemoteUplinkItem(item)) throw new Error(`remote-mock: ${this.stream.record.endpoint} uplink item is not a lossless JSON value`);
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
};
/**
* The `Error` a thrown value stands for: itself, or a new Error carrying its string form.
* @param reason - thrown value.
* @returns the error.
*/
function toError(reason) {
	return reason instanceof Error ? reason : new Error(String(reason));
}
//#endregion
//#region lib/types/remote-proxy.js
/**
* Cache accessed namespaces and expose the current native mock for each method.
* @param method - selects a stable endpoint mock for its configured invocation mode.
* @returns enumerable accessed namespaces and methods; symbols and thenable probes remain inert.
*/
function createRemoteProxy(method) {
	return new Proxy(Object.create(null), { get(namespaces, namespace) {
		if (typeof namespace !== "string" || namespace === "then") return void 0;
		return namespaces[namespace] ??= new Proxy(Object.create(null), { get(methods, name) {
			if (typeof name !== "string" || name === "then") return void 0;
			return methods[name] = method(`${namespace}/${name}`);
		} });
	} });
}
//#endregion
//#region lib/types/remote-mock.js
/** `RemoteMock`: an endpoint table (unary answers or stream scripts), live stream control, a log, and the Connection carrier face. */
const EVENTS_ENDPOINT = "$events";
/**
* The success envelope the Client's Remote callers read: `{ ok: true, value }`.
* @param value - success value.
* @returns the envelope.
*/
function ok(value) {
	return {
		ok: true,
		value
	};
}
/** A missing default answer is an unmatched request, not a selected rule that failed. */
var MissingUnaryRule = class extends Error {};
/**
* Endpoint-named Remote mock. `dispatch` / `open` are the core; `rpc` is the
* same core as the decoded carrier accepted by the Connection installer.
*/
var RemoteMock = class RemoteMock {
	/**
	* Create a mock whose `$events` stream answers the Gateway client's opening
	* with one ready frame and then stays open, so the assembled client connects.
	* @param options - host facts for the ready frame.
	* @returns the mock.
	*/
	static create(options = {}) {
		const mock = new RemoteMock();
		const host = options.host ?? { home: "/home/mock" };
		let generation = 0;
		return mock.stream(EVENTS_ENDPOINT, (_args, stream) => {
			generation += 1;
			stream.push({
				type: "ready",
				clientId: `mock-client-${String(generation)}`,
				host
			});
		});
	}
	unaryDefaults = /* @__PURE__ */ new Map();
	scripts = /* @__PURE__ */ new Map();
	live = [];
	openWaiters = [];
	logStore = new MockLogStore();
	unaryMocks = /* @__PURE__ */ new Map();
	streamMocks = /* @__PURE__ */ new Map();
	/** The carrier's uplink for the open in progress through {@link open}; a direct call has none. */
	carrierUplink;
	proxy = createRemoteProxy((endpoint) => this.modeOf(endpoint) === "stream" ? this.streamMock(endpoint) : this.unaryMock(endpoint));
	/**
	* Native mock functions for every namespace: configure answers and inspect calls without declaring method names.
	* Explicit stream registrations select stream mocks; all other methods use unary mocks.
	* Native overrides belong to this instance; `mockReset()` restores the implementation reading current defaults.
	* Generated declarations provide exact signatures; absent declarations weaken only this test-owned proxy.
	*/
	remote = this.proxy;
	/** Everything observed so far. */
	log = this.logStore;
	/** Control over streams opened by registered scripts. */
	streams = {
		push: (endpoint, item, where) => this.forEachOpen(endpoint, where, (stream) => {
			stream.push(item);
		}),
		end: (endpoint, where) => this.forEachOpen(endpoint, where, (stream) => {
			stream.end();
		}),
		fail: (endpoint, error, where) => this.forEachOpen(endpoint, where, (stream) => {
			stream.fail(error);
		}),
		opened: (endpoint, count) => {
			if (this.logStore.streams(endpoint).length >= count) return Promise.resolve();
			return new Promise((resolve) => {
				this.openWaiters.push({
					endpoint,
					count,
					resolve
				});
			});
		},
		drained: (endpoint, where) => Promise.all(this.matching(endpoint, where).map((stream) => stream.drained())).then(() => void 0)
	};
	/**
	* The Connection carrier face: `call` dispatches, `open` opens; payloads carry
	* `{ args }` as the whole-client proxies (an array) or the Gateway's own
	* endpoints (one object) send them, and a call aborted by its signal rejects.
	*/
	rpc = {
		call: async (_channel, endpoint, payload, signal) => {
			const pending = this.dispatch(endpoint, argsOf(endpoint, payload));
			return await (signal === void 0 ? pending : settleOrAbort(pending, signal));
		},
		open: (_channel, endpoint, payload, signal, uplink) => this.open(endpoint, argsOf(endpoint, payload), signal, uplink)
	};
	constructor() {}
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
		if (script !== void 0 || !this.scripts.has(endpoint)) this.scripts.set(endpoint, script);
		return this;
	}
	/**
	* Register endpoint defaults without changing native mock overrides.
	* @param table - unary answers and stream scripts.
	* @returns this.
	*/
	load(table) {
		for (const [endpoint, rule] of Object.entries(table.unary ?? {})) this.unary(endpoint, rule);
		for (const endpoint of table.streams ?? []) this.stream(endpoint);
		for (const [endpoint, script] of Object.entries(table.stream ?? {})) this.stream(endpoint, script);
		return this;
	}
	/**
	* Whether `endpoint` is declared a stream (with or without a script) or has a unary rule — the one declaration
	* the whole-client proxies need; an endpoint neither declared nor ruled is dispatched as a unary call.
	* @param endpoint - endpoint.
	* @returns the mode, or undefined when nothing is registered.
	*/
	modeOf(endpoint) {
		if (this.scripts.has(endpoint)) return "stream";
		if (this.unaryDefaults.has(endpoint)) return "unary";
	}
	/**
	* Registered endpoints and accessed proxy methods, sorted.
	* @returns endpoint names.
	*/
	endpoints() {
		const names = new Set(this.scripts.keys());
		for (const endpoint of this.unaryDefaults.keys()) names.add(endpoint);
		for (const [namespace, methods] of Object.entries(this.proxy)) for (const method of Object.keys(methods)) names.add(`${namespace}/${method}`);
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
		} catch (error) {
			if (error instanceof MissingUnaryRule) throw error;
			answer = Promise.reject(toError(error));
		}
		const record = this.logStore.call(endpoint, args);
		try {
			record.result = await answer;
		} catch (error) {
			record.state = "failed";
			record.result = error;
			throw error;
		}
		record.state = "answered";
		return record.result;
	}
	unaryMock(endpoint) {
		let mock = this.unaryMocks.get(endpoint);
		if (mock === void 0) {
			mock = fn((...args) => Promise.resolve(this.unaryAnswer(endpoint, args)));
			this.unaryMocks.set(endpoint, mock);
		}
		return mock;
	}
	unaryAnswer(endpoint, args) {
		if (!this.unaryDefaults.has(endpoint)) {
			this.logStore.miss(endpoint, "unary");
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
		} finally {
			this.carrierUplink = void 0;
		}
	}
	streamMock(endpoint) {
		let mock = this.streamMocks.get(endpoint);
		if (mock === void 0) {
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
		if (script === void 0) {
			this.logStore.miss(endpoint, "stream");
			throw new Error(this.noRuleMessage(endpoint));
		}
		let uplink;
		let owned;
		if (carrierUplink === void 0) {
			owned = new HandleUplink();
			uplink = owned;
		} else uplink = carrierUplink;
		const stream = new MockStream(this.logStore.stream(endpoint, args), signal, uplink, () => {
			owned?.close();
		});
		this.live.push(stream);
		this.wakeOpened(endpoint);
		stream.run(script, args);
		return new MockClientStream(stream, owned);
	}
	/** Throw when any request found no rule, naming the endpoints and the registered ones. */
	assertNoUnmatched() {
		const unmatched = this.logStore.unmatched();
		if (unmatched.length === 0) return;
		const lines = unmatched.map((entry) => `  ${entry.endpoint} (${entry.mode})`);
		throw new Error(`remote-mock: ${String(unmatched.length)} unmatched request(s):\n${lines.join("\n")}\nregistered: ${this.endpoints().join(", ")}`);
	}
	noRuleMessage(endpoint) {
		return `remote-mock: no rule for ${endpoint}; registered: ${this.endpoints().join(", ")}`;
	}
	/** Streams on `endpoint` still open or still holding items their consumer has not pulled; the rest are forgotten. */
	matching(endpoint, where) {
		this.live = this.live.filter((stream) => stream.record.state === "open" || stream.queued > 0);
		return this.live.filter((stream) => stream.record.endpoint === endpoint && (where === void 0 || where(stream.record.args)));
	}
	forEachOpen(endpoint, where, action) {
		const targets = this.matching(endpoint, where).filter((stream) => stream.record.state === "open");
		for (const stream of targets) action(stream);
		return targets.length;
	}
	wakeOpened(endpoint) {
		const opened = this.logStore.streams(endpoint).length;
		const ready = this.openWaiters.filter((waiter) => waiter.endpoint === endpoint && opened >= waiter.count);
		this.openWaiters = this.openWaiters.filter((waiter) => !ready.includes(waiter));
		for (const waiter of ready) waiter.resolve();
	}
};
function isRuleFn(rule) {
	return typeof rule === "function";
}
/** A rule's synchronous throw becomes a rejection so the call settles through one path. */
function answerOf(rule, args) {
	try {
		return rule(...args);
	} catch (error) {
		return Promise.reject(toError(error));
	}
}
/** Positional args from a carrier payload: the array the whole-client proxies send, or the one object the Gateway's own endpoints send. */
function argsOf(endpoint, payload) {
	if (typeof payload === "object" && payload !== null && "args" in payload) {
		const { args } = payload;
		if (Array.isArray(args)) return args;
		if (typeof args === "object" && args !== null) return [args];
	}
	throw new TypeError(`remote-mock: payload of ${endpoint} must be { args: unknown[] | object }`);
}
/**
* Settle with the call, or reject with the abort reason first; the call itself
* always keeps a handler so its own outcome is never an unhandled rejection.
*/
function settleOrAbort(pending, signal) {
	return new Promise((resolve, reject) => {
		const abort = () => {
			reject(signal.reason instanceof Error ? signal.reason : new Error("remote-mock: call aborted", { cause: signal.reason }));
		};
		signal.addEventListener("abort", abort, { once: true });
		pending.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", abort);
		});
		if (signal.aborted) abort();
	});
}
//#endregion
export { MockClientStream, RemoteMock, frames, ok, openStream, streamHandle, streamMethod };
