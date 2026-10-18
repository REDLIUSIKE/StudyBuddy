import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { SessionId } from "@deepseek-ai/dsh-session";
import { scopeOf } from "@deepseek-ai/dsh-scope";
import { assertObjectJsonSchema, validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
import { ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { randomUUID } from "@deepseek-ai/dsh-util-crypto";
import { z as z$1 } from "zod";
//#region lib/types/values.js
/**
* Small value helpers shared by the engine and the host: reading a mod's
* untyped call input, wording a thrown value, and JSON encoding as typed by
* what it does.
* @module
*/
/**
* The message of a thrown value: an Error's `message`, anything else as text.
* @param error - the thrown value.
* @returns the message text.
*/
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* A mod's call input as a field record; anything that is not an object reads as empty.
* @param input - the value a mod passed.
* @returns the fields, or an empty record.
*/
function record(input) {
	return typeof input === "object" && input !== null ? input : {};
}
/**
* Require one string field of a mod's call input.
* @param value - the field value.
* @param what - the field, named in the error.
* @returns the string.
* @throws TypeError when the value is not a string.
*/
function requireString(value, what) {
	if (typeof value !== "string") throw new TypeError(`${what} must be a string`);
	return value;
}
/**
* `JSON.stringify` as typed by what it does: undefined for a value JSON cannot carry.
* @param value - the value to encode.
* @returns the JSON text, or undefined.
*/
function stringify(value) {
	return JSON.stringify(value);
}
//#endregion
//#region lib/types/matcher.js
/**
* Event-name patterns and field matchers: which registered hooks an event
* selects. Event names are Claude Code's; a hook on a name this bridge never
* raises registers fine and never runs.
* @module
*/
/** The events the engine raises on its own, as opposed to the `<namespace>.<method>` events a mods API call raises. */
const ENGINE_EVENTS = new Set([
	"tool.call",
	"tool.check",
	"tool.describe",
	"prompt.submit",
	"prompt.fill",
	"prompt.suggest",
	"prompt.edit",
	"prompt.compose",
	"prompt.section",
	"prompt.context",
	"prompt.attachment",
	"skill.prompt",
	"attribution.text",
	"command.run",
	"command.describe",
	"config.set",
	"config.describe",
	"turn.start",
	"turn.step",
	"turn.complete",
	"session.start",
	"session.end",
	"session.compact",
	"session.receive",
	"session.send",
	"session.append",
	"session.attach",
	"session.detach",
	"session.measure",
	"agent.offer",
	"agent.spawn",
	"ui.render",
	"ui.resolve",
	"ui.press",
	"ui.input",
	"ui.select",
	"ui.focus",
	"ui.scroll",
	"ui.close",
	"ui.message",
	"plugin.register",
	"engine.create",
	"telemetry.log",
	"telemetry.mark"
]);
/**
* Every event name a mod may hook, in Claude Code's reference order: engine
* events, then every mods API method as `<namespace>.<method>`. `on` refuses a
* name outside this list with Claude Code's own wording, so a misspelling
* fails at load rather than registering a hook that never runs.
*/
const KNOWN_EVENTS = new Set([
	...ENGINE_EVENTS,
	"ui.log",
	"ui.toast",
	"ui.status",
	"ui.notice",
	"ui.invalidate",
	"ui.open",
	"ui.panes",
	"ui.blit",
	"ui.ask",
	"ui.copy",
	"command.register",
	"command.list",
	"tool.register",
	"tool.list",
	"agent.register",
	"agent.list",
	"model.complete",
	"model.fork",
	"model.classify",
	"prompt.read",
	"turn.abort",
	"session.messages",
	"session.cwd",
	"session.root",
	"session.model",
	"session.turns",
	"session.id",
	"session.repo",
	"session.surface",
	"session.surfaces",
	"session.usage",
	"session.version",
	"session.authorize",
	"config.list",
	"settings.read",
	"env.get",
	"env.set",
	"fs.read",
	"fs.write",
	"fs.list",
	"fs.exists",
	"fs.stat",
	"fs.ancestors",
	"store.get",
	"store.set",
	"store.delete",
	"store.keys",
	"state.get",
	"state.set",
	"clock.now",
	"clock.sleep",
	"clock.after",
	"clock.every",
	"http.fetch",
	"process.run",
	"process.spawn",
	"mcp.call",
	"mcp.connect",
	"audio.play",
	"audio.speak"
]);
/**
* Whether a name passed to `on` is an exact event name, `*`, or a `<namespace>.*` glob.
* @param pattern - the name or glob.
* @returns true when `on` accepts it.
*/
function isEventPattern(pattern) {
	if (pattern === "*") return true;
	if (pattern.endsWith(".*")) {
		const namespace = pattern.slice(0, -2);
		return namespace.length > 0 && [...KNOWN_EVENTS].some((event) => event.startsWith(`${namespace}.`));
	}
	return KNOWN_EVENTS.has(pattern);
}
/**
* Whether a registered pattern selects an event. `*` selects every event
* except the telemetry ones, which a mod hooks by name or as `telemetry.*`.
* @param pattern - the name or glob passed to `on`.
* @param event - the event being raised.
* @returns true when the pattern selects the event.
*/
function eventMatches(pattern, event) {
	if (pattern === event) return true;
	if (pattern === "*") return !event.startsWith("telemetry.");
	return pattern.endsWith(".*") && event.startsWith(pattern.slice(0, -1));
}
function valueMatches(expected, actual) {
	if (expected instanceof RegExp) {
		expected.lastIndex = 0;
		return (typeof actual === "string" || typeof actual === "number") && expected.test(String(actual));
	}
	if (Array.isArray(expected)) return expected.some((candidate) => candidate === actual);
	return expected === actual;
}
/**
* Whether every matcher field accepts the event's top-level field of the same
* name: a scalar by equality, an array by membership, a RegExp by test.
* @param matcher - the matcher passed to `on`.
* @param input - the event input as this hook would receive it.
* @returns true when the hook should run.
*/
function matcherMatches(matcher, input) {
	if (typeof input !== "object" || input === null) return false;
	const record = input;
	return Object.entries(matcher).every(([field, expected]) => valueMatches(expected, record[field]));
}
/**
* Render a matcher the way `claude plugin validate` prints it.
* @param matcher - the matcher, or undefined for a hook without one.
* @returns `{field=value,...}`, or an empty string.
*/
function describeMatcher(matcher) {
	if (matcher === void 0) return "";
	return `{${Object.entries(matcher).map(([field, value]) => {
		return `${field}=${value instanceof RegExp ? String(value) : Array.isArray(value) ? value.join("|") : String(value)}`;
	}).join(",")}}`;
}
//#endregion
//#region lib/types/chain.js
/**
* The middleware chain: runs the hooks selected for one event in order, each
* hook's `next` reaching the hooks beneath and then the engine behavior, under
* Claude Code's failure rules (skip a hook that throws, times out, or returns
* no result; keep the result from beneath when it had already called `next`;
* give a `.catch` handler the chance to answer in its place).
* @module
*/
/** The `next.error.kind === 'timeout'` failure. */
var HookTimeoutError = class extends Error {
	constructor(budgetMs) {
		super(`ran past its ${budgetMs} ms limit`);
		this.name = "HookTimeoutError";
	}
};
/**
* Accounts a hook's own running time: the clock runs while the hook is busy
* and pauses while it awaits `next` or a mods API call. The deadline promise
* rejects once the busy time reaches the limit.
*/
var BudgetClock = class {
	ms;
	now;
	spent = 0;
	busySince;
	pauses = 0;
	stopped = false;
	timer;
	deadline = Promise.withResolvers();
	/**
	* @param ms - the running-time limit in milliseconds.
	* @param now - monotonic clock in milliseconds.
	*/
	constructor(ms, now = () => performance.now()) {
		this.ms = ms;
		this.now = now;
		this.deadline.promise.catch(() => {});
	}
	/** Rejects with {@link HookTimeoutError} when the busy time reaches the limit. */
	get expired() {
		return this.deadline.promise;
	}
	/** Milliseconds left before the deadline fires. */
	get remainingMs() {
		const busy = this.busySince === void 0 ? 0 : this.now() - this.busySince;
		return Math.max(0, this.ms - this.spent - busy);
	}
	/** Start counting; the hook is busy from now on. */
	start() {
		if (this.stopped) return;
		this.busySince = this.now();
		this.arm();
	}
	/** Stop counting while the hook awaits `next` or a mods API call. Nested pauses are counted. */
	pause() {
		if (this.stopped) return;
		this.pauses += 1;
		if (this.busySince !== void 0) {
			this.spent += this.now() - this.busySince;
			this.busySince = void 0;
		}
		this.disarm();
	}
	/** Resume counting after the awaited call settled. */
	resume() {
		if (this.stopped || this.pauses === 0) return;
		this.pauses -= 1;
		if (this.pauses === 0) {
			this.busySince = this.now();
			this.arm();
		}
	}
	/** The hook settled: no deadline can fire from now on. */
	stop() {
		if (this.busySince !== void 0) this.spent += this.now() - this.busySince;
		this.stopped = true;
		this.busySince = void 0;
		this.disarm();
	}
	arm() {
		this.disarm();
		const remaining = this.remainingMs;
		this.timer = setTimeout(() => {
			this.stopped = true;
			this.busySince = void 0;
			this.spent = this.ms;
			this.deadline.reject(new HookTimeoutError(this.ms));
		}, remaining);
		this.timer.unref();
	}
	disarm() {
		if (this.timer !== void 0) clearTimeout(this.timer);
		this.timer = void 0;
	}
};
/** Thrown by {@link DispatchRequest.validateNext}: the hook asked for a rewrite this host does not serve. */
var RewriteRefusedError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "RewriteRefusedError";
	}
};
/** The engine's own origin. */
const ENGINE_ORIGIN = Object.freeze({
	plugin: "engine",
	tier: "core"
});
/** A hook settled with something other than a result object. */
var NoResultError = class extends Error {
	constructor() {
		super("returned no result");
		this.name = "NoResultError";
	}
};
/** Classify a failed hook and word the diagnostic line's tail. */
function failureOf(error) {
	if (error instanceof HookTimeoutError) return {
		kind: "timeout",
		message: error.message,
		line: `timeout, ${error.message}`
	};
	if (error instanceof NoResultError || error instanceof RewriteRefusedError) return {
		kind: "throw",
		message: error.message,
		line: error.message
	};
	const message = error instanceof Error ? `${error.name}: ${error.message}` : messageOf(error);
	return {
		kind: "throw",
		message,
		line: `threw ${message}`
	};
}
/** Freeze the event input in place at every depth, as the mods API promises. */
function freezeInput(input) {
	return typeof input === "object" && input !== null ? deepFreeze(input) : input;
}
/**
* Run one event through its hooks and the engine behavior.
* @param request - the event, its hooks, and the engine behavior beneath them.
* @returns the event's result as the outermost hook returned it.
*/
async function dispatch(request) {
	const { hooks } = request;
	async function runFrom(index, input) {
		for (let i = index; i < hooks.length; i += 1) {
			const hook = hooks[i];
			if (hook.matcher !== void 0 && !matcherMatches(hook.matcher, input)) continue;
			return runHook(hook, i, input);
		}
		return request.core(input);
	}
	async function runHook(hook, index, input) {
		const frozen = freezeInput(input);
		const clock = new BudgetClock(request.budgetMs);
		const state = {
			abandoned: false,
			called: false,
			beneath: void 0,
			beneathError: void 0,
			refused: void 0
		};
		const next = Object.assign((e) => {
			state.called = true;
			if (state.beneath !== void 0) return state.beneath;
			if (state.abandoned) return Promise.resolve(void 0);
			if (request.validateNext !== void 0) try {
				request.validateNext(e, hook);
			} catch (error) {
				const refused = error instanceof Error ? error : new Error(messageOf(error));
				state.refused = { error: refused };
				return Promise.reject(refused);
			}
			clock.pause();
			state.beneath = runFrom(index + 1, e).catch((error) => {
				state.beneathError = { error };
				throw error;
			}).finally(() => {
				clock.resume();
			});
			return state.beneath;
		}, {
			signal: request.signal,
			origin: request.origin,
			budget: {
				ms: request.budgetMs,
				get remainingMs() {
					return clock.remainingMs;
				}
			},
			to() {
				return Promise.reject(/* @__PURE__ */ new Error("next.to is only available to mods in managed prependPlugins or appendPlugins"));
			}
		});
		const api = request.api(hook, clock);
		clock.start();
		try {
			const running = Promise.resolve().then(() => hook.hook(api, frozen, next));
			running.catch(() => {});
			const result = await Promise.race([running, clock.expired]);
			if (typeof result !== "object") throw new NoResultError();
			clock.stop();
			if (state.beneath !== void 0) await state.beneath.catch((error) => {
				request.report(`${hook.mod.name}: ${request.event}: the chain beneath failed after the hook answered: ${messageOf(error)}`);
			});
			return result;
		} catch (error) {
			state.abandoned = true;
			if (state.beneathError !== void 0 && error === state.beneathError.error) throw error;
			const failure = failureOf(state.refused !== void 0 && error === state.refused.error ? state.refused.error : error);
			if (!hook.reported.has(failure.kind)) {
				hook.reported.add(failure.kind);
				request.report(`${hook.mod.name}: ${request.event} hook skipped: ${failure.line}`);
			}
			if (hook.catchHandler !== void 0) {
				const answered = await runCatch(hook, index, frozen, {
					kind: failure.kind,
					message: failure.message
				}, state);
				if (answered !== void 0) return answered;
			}
			if (state.beneath !== void 0) return await state.beneath;
			return await runFrom(index + 1, input);
		} finally {
			clock.stop();
		}
	}
	/**
	* Run the failed hook's `.catch` handler. It shares the hook's beneath state:
	* what the hook already ran is handed back, what the handler runs is recorded
	* for the skip path, so nothing beneath runs twice.
	*/
	async function runCatch(hook, index, input, failure, state) {
		const clock = new BudgetClock(request.catchBudgetMs);
		let handlerAbandoned = false;
		const next = Object.assign((e) => {
			if (state.beneath !== void 0) return state.beneath;
			if (handlerAbandoned) return Promise.resolve(void 0);
			if (request.validateNext !== void 0) try {
				request.validateNext(e, hook);
			} catch (error) {
				return Promise.reject(error instanceof Error ? error : new Error(messageOf(error)));
			}
			clock.pause();
			state.beneath = runFrom(index + 1, e).finally(() => {
				clock.resume();
			});
			return state.beneath;
		}, {
			signal: request.signal,
			origin: request.origin,
			budget: {
				ms: request.catchBudgetMs,
				get remainingMs() {
					return clock.remainingMs;
				}
			},
			to() {
				return Promise.reject(/* @__PURE__ */ new Error("next.to is not available in a .catch handler"));
			},
			error: failure,
			called: state.called
		});
		const api = request.api(hook, clock);
		clock.start();
		try {
			const handler = hook.catchHandler;
			const running = Promise.resolve().then(() => handler(api, input, next));
			running.catch(() => {});
			const result = await Promise.race([running, clock.expired]);
			if (typeof result === "object") return result;
		} catch (error) {
			request.report(`${hook.mod.name}: ${request.event} .catch handler skipped: ${failureOf(error).line}`);
		} finally {
			handlerAbandoned = true;
			clock.stop();
		}
	}
	return runFrom(0, request.input);
}
//#endregion
//#region lib/types/elements.js
/**
* The element vocabulary a `ui.render` hook answers with — Claude Code's
* `Box`, `Text`, and `Button` constructors — and what the host does with a
* tree: validate it, serialize it with callbacks replaced by action ids, and
* search it the way a mod's test does.
* @module
*/
/** What a serialized tree may carry per prop: scalars only. */
function scalarProps(props) {
	const scalars = {};
	for (const [name, value] of Object.entries(props)) {
		if (name === "children" || name === "onPress") continue;
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") scalars[name] = value;
	}
	return scalars;
}
const elementBrand = Symbol("claude-code-mods.element");
function element(type, props) {
	return Object.freeze({
		type,
		props: Object.freeze({ ...props }),
		[elementBrand]: true
	});
}
/**
* Whether a value is an element one of this host's constructors returned.
* @param value - the candidate.
* @returns true for a constructor-made element.
*/
function isUiElement(value) {
	return typeof value === "object" && value !== null && value[elementBrand] === true;
}
/**
* The element constructors for one render.
* @returns `Box`, `Text`, and `Button`.
*/
function uiElements() {
	return Object.freeze({
		Box: (props) => element("Box", props),
		Text: (props) => element("Text", props),
		Button: (props) => element("Button", props)
	});
}
/** Flatten a node into the elements and text runs it draws, dropping what draws nothing. */
function childrenOf(node) {
	if (node === null || node === void 0 || node === false) return [];
	if (typeof node === "string") return node.length === 0 ? [] : [node];
	if (typeof node === "number") return [String(node)];
	if (isUiElement(node)) return [node];
	if (Array.isArray(node)) return node.flatMap(childrenOf);
	throw new TypeError(`a tree node is ${typeof node}, not an element, text, or a list of them`);
}
/**
* Check a `ui.render` answer against the vocabulary.
* @param node - the hook's answer.
* @returns undefined for a valid tree, or the reason it does not validate.
*/
function treeProblem(node) {
	try {
		for (const child of childrenOf(node)) {
			if (typeof child === "string") continue;
			if (child.type === "Button") {
				if (typeof child.props["label"] !== "string") return "a Button needs a string label";
				if (child.props["onPress"] !== void 0 && typeof child.props["onPress"] !== "function") return "a Button onPress must be a function";
				continue;
			}
			const nested = treeProblem(child.props["children"]);
			if (nested !== void 0) return nested;
		}
		return;
	} catch (error) {
		/* v8 ignore next -- childrenOf throws TypeErrors only; the String branch covers a future non-Error throw */
		return error instanceof Error ? error.message : String(error);
	}
}
/**
* Serialize a validated tree for a client: scalars kept, children flattened,
* each `onPress` replaced by the id `holdAction` returns for it.
* @param node - the hook's answer, already validated with {@link treeProblem}.
* @param holdAction - stores one callback and returns its id.
* @returns the serialized nodes, in drawing order.
*/
function serializeTree(node, holdAction) {
	return childrenOf(node).map((child) => {
		if (typeof child === "string") return child;
		if (child.type === "Button") {
			const onPress = child.props["onPress"];
			return {
				type: "Button",
				props: scalarProps(child.props),
				children: [],
				...typeof onPress === "function" ? { actionId: holdAction(onPress) } : {}
			};
		}
		return {
			type: child.type,
			props: scalarProps(child.props),
			children: serializeTree(child.props["children"], holdAction)
		};
	});
}
//#endregion
//#region lib/types/api.js
/**
* The `$` a hook receives. Each method shapes its arguments into the mods API
* event of the same name and hands it to the binding's `invoke`, which runs
* the mods loaded before this one and then the engine's implementation. The
* hook's running-time clock pauses while a call is awaited, except for
* `$.clock.sleep`, which Claude Code counts as the hook's own time.
* @module
*/
/**
* Build the `$` for one hook invocation.
* @param binding - the mod, clock, and engine entry points this instance uses.
* @returns the mods API.
*/
function createModsApi(binding) {
	const { mod, clock, timers } = binding;
	async function call(op, input) {
		clock?.pause();
		try {
			return await binding.invoke(op, input);
		} finally {
			clock?.resume();
		}
	}
	function fire(op, input) {
		call(op, input).catch((error) => {
			binding.report(`${mod.name}: $.${op} failed: ${messageOf(error)}`);
		});
	}
	return withUnservedMembers({
		plugin: Object.freeze({
			name: mod.name,
			root: mod.root
		}),
		ui: Object.freeze({
			log(text, options) {
				fire("ui.log", {
					text,
					to: options?.to ?? "transcript"
				});
			},
			toast(text, options) {
				fire("ui.toast", {
					text,
					...options?.timeoutMs === void 0 ? {} : { timeoutMs: options.timeoutMs }
				});
			},
			status(text) {
				fire("ui.status", { text });
			},
			invalidate(event) {
				fire("ui.invalidate", { event });
			},
			open(pane) {
				return call("ui.open", pane);
			},
			close(pane) {
				return call("ui.close", {
					id: pane.id,
					origin: "plugin"
				});
			},
			panes() {
				return call("ui.panes", {});
			},
			ask(question, options) {
				return call("ui.ask", {
					question,
					...Array.isArray(options) ? { options } : options ?? {}
				});
			},
			resolve: () => uiElements()
		}),
		command: Object.freeze({
			register(command) {
				return call("command.register", command);
			},
			run(input) {
				return call("command.run", {
					command: input.command,
					args: input.args ?? ""
				});
			},
			list() {
				return call("command.list", {});
			}
		}),
		tool: Object.freeze({
			register(tool) {
				return call("tool.register", tool);
			},
			call(input) {
				return call("tool.call", input);
			},
			list() {
				return call("tool.list", {});
			}
		}),
		prompt: Object.freeze({ submit(input) {
			return call("prompt.submit", {
				text: input.text,
				asUser: input.asUser === true
			});
		} }),
		session: Object.freeze({
			id: () => call("session.id", {}),
			cwd: () => call("session.cwd", {}),
			root: () => call("session.root", {}),
			model: () => call("session.model", {}),
			turns: () => call("session.turns", {}),
			messages: () => call("session.messages", {}),
			usage: () => call("session.usage", {}),
			version: () => call("session.version", {})
		}),
		state: Object.freeze({
			get(ref) {
				return call("state.get", {
					plugin: ref.plugin,
					key: ref.key
				});
			},
			set(ref, value) {
				return call("state.set", {
					plugin: ref.plugin,
					key: ref.key,
					value
				});
			}
		}),
		store: Object.freeze({
			get: (key) => call("store.get", { key }),
			set: (key, value) => call("store.set", {
				key,
				value
			}),
			delete: (key) => call("store.delete", { key }),
			keys: () => call("store.keys", {})
		}),
		clock: Object.freeze({
			now: () => call("clock.now", {}),
			sleep: (ms) => binding.invoke("clock.sleep", { ms }),
			after: (ms, fn) => timers.after(ms, fn),
			every: (ms, fn) => timers.every(ms, fn)
		}),
		fs: Object.freeze({
			read: (path) => call("fs.read", {
				path,
				as: "text"
			}),
			write: (path, text) => call("fs.write", {
				path,
				text
			}),
			list: (path) => call("fs.list", { path: path ?? "." }),
			exists: (path) => call("fs.exists", { path }),
			stat: (path) => call("fs.stat", {
				path,
				resolve: true
			})
		}),
		process: Object.freeze({ run(argv, init) {
			return call("process.run", {
				argv,
				...init === void 0 ? {} : { init }
			});
		} }),
		http: Object.freeze({ fetch(url, init) {
			return call("http.fetch", {
				url,
				...init === void 0 ? {} : { init }
			});
		} }),
		env: Object.freeze({
			get: (name) => call("env.get", { name }),
			set: (name, value) => call("env.set", {
				name,
				...value === void 0 ? {} : { value }
			})
		})
	}, mod.name);
}
/** The method namespaces Claude Code's `$` has; `plugin` holds facts, not methods, and stays as served. */
const METHOD_NAMESPACES = new Set([
	"ui",
	"command",
	"tool",
	"prompt",
	"session",
	"state",
	"store",
	"clock",
	"fs",
	"process",
	"http",
	"env",
	"model",
	"agent",
	"config",
	"settings",
	"mcp",
	"audio",
	"telemetry",
	"turn"
]);
/**
* Give `$` Claude Code's full namespace set: a served member is itself; any
* other member of a method namespace is a function whose call rejects with
* `no implementation for <namespace>.<member>`, so a mod that reaches past
* this host fails with the gap named, not with a TypeError.
* @param served - the frozen object of served namespaces.
* @param modName - the mod the `$` belongs to, for the rejection text.
* @returns the `$` a hook receives.
*/
function withUnservedMembers(served, modName) {
	const namespaces = /* @__PURE__ */ new Map();
	const namespaceOf = (name, base) => {
		let wrapped = namespaces.get(name);
		if (wrapped === void 0) {
			wrapped = new Proxy(base, { get(target, member, receiver) {
				const own = Reflect.get(target, member, receiver);
				if (own !== void 0 || typeof member !== "string" || member === "then") return own;
				return () => Promise.reject(/* @__PURE__ */ new Error(`${modName}: no implementation for ${name}.${member}`));
			} });
			namespaces.set(name, wrapped);
		}
		return wrapped;
	};
	return new Proxy(served, {
		get(target, namespace, receiver) {
			const own = Reflect.get(target, namespace, receiver);
			if (typeof namespace !== "string" || !METHOD_NAMESPACES.has(namespace)) return own;
			return namespaceOf(namespace, typeof own === "object" && own !== null ? own : Object.freeze({}));
		},
		set: () => false,
		defineProperty: () => false,
		deleteProperty: () => false
	});
}
//#endregion
//#region lib/types/module.js
/**
* Mod registration: run a mod's `register(on, options)` and keep every
* `on(...)` registration in one ordered registry that dispatch selects from.
* @module
*/
/** Plugin names Claude Code accepts: letters, digits, `_` and `-`. */
const PLUGIN_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
/** Mods ordered by load; hooks ordered by mod, then by registration. */
var HookRegistry = class {
	hooks = [];
	mods = [];
	/**
	* The loaded mods.
	* @returns the mods in load order.
	*/
	list() {
		return this.mods;
	}
	/**
	* Add one mod and its registrations; a mod of the same name must be removed first.
	* @param mod - the mod the hooks belong to.
	* @param hooks - its registrations in `on` order.
	*/
	add(mod, hooks) {
		if (this.mods.some((loaded) => loaded.name === mod.name)) throw new Error(`hooks module ${mod.name} not loaded: another plugin of that name loads first`);
		this.mods.push(mod);
		this.hooks.push(...hooks);
	}
	/**
	* Drop one mod and its hooks.
	* @param name - the plugin name.
	*/
	remove(name) {
		const index = this.mods.findIndex((mod) => mod.name === name);
		if (index === -1) return;
		const [mod] = this.mods.splice(index, 1);
		for (let i = this.hooks.length - 1; i >= 0; i -= 1) if (this.hooks[i]?.mod === mod) this.hooks.splice(i, 1);
	}
	/**
	* Hooks whose pattern selects `event`, outermost first. A mods API call a mod
	* raised is seen only by the mods loaded before it.
	* @param event - the event name.
	* @param raisedBy - the mod whose `$` call became the event, or undefined for the engine.
	* @returns the ordered hooks; matchers are evaluated at run time.
	*/
	select(event, raisedBy) {
		return this.hooks.filter((hook) => (raisedBy === void 0 || hook.mod.order < raisedBy.order) && eventMatches(hook.event, event)).sort((left, right) => left.mod.order - right.mod.order);
	}
	/**
	* The engine events one mod hooks by exact name that the host never raises.
	* @param mod - the loaded mod.
	* @param served - the engine events the host raises.
	* @returns the unserved event names in registration order, each once.
	*/
	unserved(mod, served) {
		const names = [];
		for (const hook of this.hooks) {
			if (hook.mod !== mod || !ENGINE_EVENTS.has(hook.event) || served.has(hook.event) || names.includes(hook.event)) continue;
			names.push(hook.event);
		}
		return names;
	}
	/**
	* Event names with matchers, as `claude plugin validate` prints the `hooks:` line.
	* @param mod - the loaded mod.
	* @returns its events with matchers, comma-separated.
	*/
	describe(mod) {
		return this.hooks.filter((hook) => hook.mod === mod).map((hook) => `${hook.event}${describeMatcher(hook.matcher)}`).join(", ");
	}
};
function isMatcher(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Build the `on` function one `register` call receives and collect its
* registrations. Validation follows Claude Code: the event name must be a
* known name or glob, and one event may be registered without a matcher only
* once.
* @param mod - the mod registering.
* @returns `on` and the list it appends to.
*/
function createOn(mod) {
	const hooks = [];
	const unmatched = /* @__PURE__ */ new Set();
	const on = ((event, matcherOrHook, maybeHook) => {
		if (typeof event !== "string") throw new TypeError(`${mod.name}: the event name passed to on() is not a string literal`);
		if (!isEventPattern(event)) throw new Error(`${mod.name}: "${event}" is not an event`);
		const hook = maybeHook ?? matcherOrHook;
		const matcher = maybeHook === void 0 ? void 0 : matcherOrHook;
		if (typeof hook !== "function") throw new TypeError(`${mod.name}: on("${event}") needs a hook function`);
		if (matcher !== void 0 && !isMatcher(matcher)) throw new TypeError(`${mod.name}: on("${event}") matcher must be an object`);
		if (matcher === void 0) {
			if (unmatched.has(event)) throw new Error(`${mod.name}: on("${event}") is registered twice without a matcher`);
			unmatched.add(event);
		}
		const registered = {
			mod,
			event,
			matcher,
			hook,
			catchHandler: void 0,
			reported: /* @__PURE__ */ new Set()
		};
		hooks.push(registered);
		return { catch(handler) {
			if (typeof handler !== "function") throw new TypeError(`${mod.name}: on("${event}").catch needs a handler function`);
			registered.catchHandler = handler;
		} };
	});
	return {
		on,
		hooks
	};
}
/**
* Run one mod's `register` and collect its hooks. A `register` that throws
* fails the mod with Claude Code's wording; the caller decides whether the
* session continues without it.
* @param definition - the mod as its plugin defined it.
* @param order - the mod's position in the chain; earlier mods run outside later ones.
* @returns the loaded mod and its registrations.
*/
async function registerMod(definition, order) {
	if (!PLUGIN_NAME.test(definition.name)) throw new Error(`mod "${definition.name}" not loaded: a plugin name uses letters, digits, _ and - only`);
	const mod = Object.freeze({
		name: definition.name,
		version: definition.version,
		root: definition.root ?? process.cwd(),
		options: Object.freeze({ ...definition.options }),
		order
	});
	const { on, hooks } = createOn(mod);
	try {
		await definition.register(on, mod.options);
	} catch (error) {
		throw new Error(`${definition.name}: hooks module did not load: register threw ${messageOf(error)}`, { cause: error });
	}
	return {
		mod,
		hooks
	};
}
//#endregion
//#region lib/types/engine.js
/**
* The mods engine: loaded mods and their hooks, engine-raised events, mods
* API calls raised as events, per-session `$.state`, and the timers mods
* start. It knows nothing of Cordis; the plugin supplies the engine behavior
* for each mods API call and the test kit supplies stubs.
* @module
*/
/**
* Thrown by an engine behavior to answer a mods API call with `{ deny }`, so
* the calling mod's `$` call rejects with the reason.
*/
var OpDenied = class extends Error {
	reason;
	constructor(reason) {
		super(reason);
		this.reason = reason;
		this.name = "OpDenied";
	}
};
const NEVER_ABORTS = new AbortController().signal;
/** Wait `ms`, or reject with the signal's reason when the event is cancelled before or while waiting. */
function sleepUnless(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(abortReasonOf(signal));
			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			reject(abortReasonOf(signal));
		}
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
function abortReasonOf(signal) {
	const reason = signal.reason;
	return reason instanceof Error ? reason : /* @__PURE__ */ new Error(`$.clock.sleep cancelled: ${messageOf(reason)}`);
}
/** One named `$.state` slot: `<plugin>\u0000<key>`. */
function stateSlot(plugin, key) {
	if (typeof plugin !== "string" || typeof key !== "string") throw new TypeError("$.state needs { plugin, key } strings");
	return `${plugin}\u0000${key}`;
}
/**
* Timers owned by the engine on one mod's behalf. Closing cancels every
* scheduled timer, refuses new ones, and waits for the callbacks already
* running, so a mod cannot reschedule itself or touch the host after unload.
*/
var TimerSet = class {
	report;
	owner;
	active = /* @__PURE__ */ new Set();
	running = /* @__PURE__ */ new Set();
	closed = false;
	constructor(report, owner) {
		this.report = report;
		this.owner = owner;
	}
	after(ms, fn) {
		if (this.closed) return { cancel() {} };
		const handle = setTimeout(() => {
			this.active.delete(handle);
			this.run(fn);
		}, ms);
		handle.unref();
		this.active.add(handle);
		return { cancel: () => {
			clearTimeout(handle);
			this.active.delete(handle);
		} };
	}
	every(ms, fn) {
		if (this.closed) return { cancel() {} };
		const handle = setInterval(() => {
			this.run(fn);
		}, ms);
		handle.unref();
		this.active.add(handle);
		return { cancel: () => {
			clearInterval(handle);
			this.active.delete(handle);
		} };
	}
	/**
	* Cancel every scheduled timer, refuse new ones, and settle once the
	* callbacks already running have finished.
	*/
	async close() {
		this.closed = true;
		for (const handle of this.active) clearTimeout(handle);
		this.active.clear();
		await Promise.all(this.running);
	}
	run(fn) {
		const settled = Promise.resolve().then(fn).then(() => void 0, (error) => {
			this.report(`${this.owner}: timer callback failed: ${messageOf(error)}`);
		});
		this.running.add(settled);
		settled.finally(() => {
			this.running.delete(settled);
		});
	}
};
/**
* Loaded mods, their hooks, and the two ways events reach them: the engine
* raises one through every selected hook, and a mod's `$` call raises one
* through the mods loaded before it.
*/
var ModsEngine = class {
	options;
	/** The loaded mods and their registrations. */
	registry = new HookRegistry();
	state = /* @__PURE__ */ new Map();
	/** Timer sets by `<session key>\u0000<plugin>`: a mod's timers belong to the session whose event started them. */
	timers = /* @__PURE__ */ new Map();
	nextOrder = 0;
	constructor(options) {
		this.options = options;
	}
	/**
	* Run one mod's `register` and add its hooks beneath every mod added before it.
	* @param definition - the mod as its plugin defined it.
	* @returns the loaded mod.
	* @throws Error when the name is taken or invalid, or when `register` throws.
	*/
	async add(definition) {
		if (this.registry.list().some((loaded) => loaded.name === definition.name)) throw new Error(`mod "${definition.name}" not loaded: another mod of that name is already loaded`);
		const order = this.nextOrder;
		this.nextOrder += 1;
		const { mod, hooks } = await registerMod(definition, order);
		this.registry.add(mod, hooks);
		return mod;
	}
	/**
	* Raise one engine event through its hooks, outermost first.
	* @param event - the event name.
	* @param input - the event input; frozen before a hook sees it.
	* @param core - the engine behavior beneath every hook.
	* @param options - the binding events of this agent share, and its cancellation.
	* @returns the result as the outermost hook returned it.
	*/
	raise(event, input, core, options) {
		return this.raiseWith(event, this.registry.select(event), void 0, input, core, options);
	}
	/**
	* Raise one event through hooks the caller already selected, attributed to
	* the mod that caused it: the engine, or a mod whose `$` call the host turned
	* back into this event.
	* @param event - the event name.
	* @param hooks - the selected hooks, outermost first.
	* @param raisedBy - the mod the event is attributed to, or undefined for the engine.
	* @param input - the event input; frozen before a hook sees it.
	* @param core - the engine behavior beneath every hook.
	* @param options - the binding events of this agent share, and its cancellation.
	* @returns the result as the outermost hook returned it.
	*/
	raiseWith(event, hooks, raisedBy, input, core, options) {
		const signal = options.signal ?? NEVER_ABORTS;
		return dispatch({
			event,
			input,
			core,
			origin: raisedBy === void 0 ? ENGINE_ORIGIN : {
				plugin: raisedBy.name,
				tier: "user"
			},
			hooks,
			api: (hook, clock) => this.api(hook.mod, clock, options.binding, signal),
			budgetMs: this.options.budgetMs,
			catchBudgetMs: this.options.catchBudgetMs,
			signal,
			report: this.options.report,
			...options.validateNext === void 0 ? {} : { validateNext: options.validateNext }
		});
	}
	/**
	* Raise one mods API call as its event through the mods loaded before the
	* caller, then answer it with the engine behavior.
	* @param mod - the calling mod.
	* @param op - the event name, `<namespace>.<method>`.
	* @param input - the call's input.
	* @param binding - the binding of the event the caller is handling.
	* @param signal - cancellation of that event.
	* @returns the value the chain answered with.
	* @throws Error with the reason when a hook or the engine answered `{ deny }`.
	*/
	async invoke(mod, op, input, binding, signal) {
		const answer = await dispatch({
			event: op,
			input,
			hooks: op === "tool.call" ? [] : this.registry.select(op, mod),
			core: async (e) => {
				try {
					return { value: await this.opCore(op, e, {
						mod,
						binding,
						signal,
						engine: this
					}) };
				} catch (error) {
					if (error instanceof OpDenied) return { deny: error.reason };
					throw error;
				}
			},
			origin: {
				plugin: mod.name,
				tier: "user"
			},
			api: (hook, clock) => this.api(hook.mod, clock, binding, signal),
			budgetMs: this.options.budgetMs,
			catchBudgetMs: this.options.catchBudgetMs,
			signal,
			report: this.options.report
		});
		if (answer === null || !("value" in answer) && !("deny" in answer)) throw new Error(`${op}: a hook returned neither { value } nor { deny }`);
		if (typeof answer.deny === "string") throw new Error(`${op} refused: ${answer.deny}`);
		return answer.value;
	}
	/**
	* Build the `$` for one mod inside one event.
	* @param mod - the mod the instance belongs to.
	* @param clock - the running hook's clock, or undefined outside a hook.
	* @param binding - the event's binding.
	* @param signal - the event's cancellation.
	* @returns the mods API.
	*/
	api(mod, clock, binding, signal) {
		return createModsApi({
			mod,
			clock,
			invoke: (op, input) => this.invoke(mod, op, input, binding, signal),
			timers: this.timersOf(mod, this.options.stateKey(binding)),
			report: this.options.report
		});
	}
	/**
	* Forget one session's `$.state` values and close the timers its events started.
	* @param key - the session key the values and timers were kept under.
	* @returns settles once the session's timer callbacks have finished.
	*/
	async forgetSession(key) {
		this.state.delete(key);
		const closing = [];
		for (const [timerKey, timers] of this.timers) if (timerKey.startsWith(`${key}\u0000`)) {
			this.timers.delete(timerKey);
			closing.push(timers.close());
		}
		await Promise.all(closing);
	}
	/**
	* The `claude plugin validate` style `hooks:` line for one mod.
	* @param mod - the loaded mod.
	* @returns its events with matchers, comma-separated.
	*/
	describe(mod) {
		return this.registry.describe(mod);
	}
	/**
	* Drop one mod: its hooks stop receiving events, its timers are cancelled,
	* and its running timer callbacks are awaited.
	* @param name - the plugin name.
	* @returns settles once the mod's timer callbacks have finished.
	*/
	async unload(name) {
		this.registry.remove(name);
		const closing = [];
		for (const [timerKey, timers] of this.timers) if (timerKey.endsWith(`\u0000${name}`)) {
			this.timers.delete(timerKey);
			closing.push(timers.close());
		}
		await Promise.all(closing);
	}
	/**
	* Drop every registration and close every mod's timers.
	* @returns settles once every timer callback has finished.
	*/
	async dispose() {
		await Promise.all([...this.registry.list()].map((mod) => this.unload(mod.name)));
		this.state.clear();
	}
	timersOf(mod, sessionKey) {
		const timerKey = `${sessionKey}\u0000${mod.name}`;
		let timers = this.timers.get(timerKey);
		if (timers === void 0) {
			timers = new TimerSet(this.options.report, mod.name);
			this.timers.set(timerKey, timers);
		}
		return timers;
	}
	opCore(op, input, context) {
		const served = this.options.ops(op);
		if (served !== void 0) return served(input, context);
		const fields = record(input);
		switch (op) {
			case "state.get": {
				const slot = stateSlot(fields.plugin, fields.key);
				const key = this.options.stateKey(context.binding);
				this.options.onStateRead?.(key, slot);
				return { value: this.state.get(key)?.get(slot) };
			}
			case "state.set": {
				const slot = stateSlot(fields.plugin, fields.key);
				const key = this.options.stateKey(context.binding);
				let values = this.state.get(key);
				if (values === void 0) {
					values = /* @__PURE__ */ new Map();
					this.state.set(key, values);
				}
				values.set(slot, fields.value);
				this.options.onStateWritten?.(key, slot);
				return;
			}
			case "clock.now": return Date.now();
			case "clock.sleep": {
				const ms = fields.ms;
				if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) throw new TypeError("$.clock.sleep needs a non-negative number of milliseconds");
				return sleepUnless(ms, context.signal);
			}
			default: throw new Error(`no implementation for ${op}`);
		}
	}
};
//#endregion
//#region lib/types/host-ops.js
/**
* The engine behavior for each mods API call this bridge serves, mapped onto
* harness services: commands and tools on the agent's scoped registries,
* `ui.ask` on the user-questions answerer, files on `ctx.fs`, processes on
* `ctx.subprocess`, the store on a storage domain, session facts on the
* agent's Session and projections. A service a deployment did not compose
* fails the call with the service name.
* @module
*/
/** The mods API version string `$.session.version()` reports. */
const MODS_API_VERSION = Object.freeze({
	version: "claude-code-mods/0.1",
	engine: "deepseek-harness"
});
/** Largest file `$.fs.read` returns and `$.fs.write` accepts, Claude Code's own limit. */
const FS_MAX_BYTES = 4 * 1024 * 1024;
/** Largest JSON a plugin's `$.store` holds in total, Claude Code's own limit. */
const STORE_MAX_BYTES = 4 * 1024 * 1024;
/** Largest stdout or stderr `$.process.run` keeps. */
const PROCESS_OUTPUT_MAX_BYTES = 1024 * 1024;
/** Largest response body `$.http.fetch` returns. */
const HTTP_MAX_BYTES = 4 * 1024 * 1024;
/**
* Full name the model sees for a mod-registered tool: Claude Code's MCP-style spelling.
* @param plugin - the registering plugin's name.
* @param tool - the name the mod registered.
* @returns `mcp__<plugin>__<tool>`.
*/
function modToolName(plugin, tool) {
	return `mcp__${plugin}__${tool}`;
}
/** Tool-local names stay short and id-safe, Claude Code's own rule. */
const REGISTERED_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
/** Per-plugin `$.store` records: one JSON object of keys per plugin. */
const storeDomainSpec = defineDomain({
	name: "claude_code_mods",
	version: 1,
	tables: { store: domainTable(z$1.record(z$1.string(), z$1.json())) }
});
function requireAgent(context, op) {
	const agent = context.binding.agent;
	if (agent === void 0) throw new Error(`$.${op} needs a session, and this event has none`);
	return agent;
}
function textOf$1(content) {
	return content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/**
* Project one tool outcome onto Claude Code's `tool.call` result.
* @param result - the harness tool outcome.
* @returns its text as `result`, with `isError` on a failure.
*/
function toolCallResultOf(result) {
	return result.isError ? {
		result: textOf$1(result.content),
		isError: true
	} : { result: textOf$1(result.content) };
}
/** The model's raw JSON arguments as an object; an unparsable string is an empty input. */
function argumentsOf(raw) {
	try {
		return record(JSON.parse(raw));
	} catch {
		return {};
	}
}
function sessionMessages(messages, aliases) {
	const out = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		const toolUses = message.content.filter((block) => block.type === "tool-call").map((block) => ({
			tool_use_id: block.id,
			tool: aliases.toMod(block.name),
			input: argumentsOf(block.arguments)
		}));
		out.push({
			role: message.role,
			text: textOf$1(message.content),
			toolUses
		});
	}
	return out;
}
/** Entry kind in Claude Code's vocabulary. */
function kindOf(type) {
	return type === "file" ? "file" : type === "directory" ? "dir" : "other";
}
function readOutput(reader) {
	/* v8 ignore next -- both streams are spawned collected, so their readers exist */
	return reader === void 0 ? "" : reader.readFrom(0).text;
}
/** An entry's size, or 0 where the provider reports none. */
function sizeOf(info) {
	return info?.size ?? 0;
}
/**
* Build the op table over the composed harness services.
* @param options - the context, aliases, limits, and registration tracking.
* @returns engine behaviors by event name.
*/
function createHostOps(options) {
	const { ctx, aliases } = options;
	let storeDomain;
	function store() {
		if (storeDomain !== void 0) return storeDomain;
		const domains = ctx.get("storageDomain");
		if (domains === void 0) throw new Error("$.store needs a storage domain service (dsh-storage-domain), which this deployment did not compose");
		const opened = domains.open(storeDomainSpec);
		storeDomain = opened;
		ctx.effect(() => () => opened.then((domain) => domain.close()), "claude-code-mods: close store domain");
		return opened;
	}
	async function target(path, agent, signal) {
		const cwd = await currentDirectory(agent, signal);
		return fs().resolve(path, {
			...cwd === void 0 ? {} : { cwd },
			signal
		});
	}
	function directories() {
		const service = ctx.get("workingDirectory");
		if (service === void 0) throw new Error("$.session.cwd and session-owned operations need dsh-working-directory, which this deployment did not compose");
		return service;
	}
	function currentDirectory(agent, signal) {
		return agent === void 0 ? Promise.resolve(void 0) : directories().ensure(agent, signal);
	}
	function fs() {
		const service = ctx.get("fs");
		if (service === void 0) throw new Error("$.fs needs a filesystem service (dsh-fs), which this deployment did not compose");
		return service;
	}
	function track(dispose, agent) {
		const key = agent?.session.id ?? "";
		let owned = options.registrations.get(key);
		if (owned === void 0) {
			owned = /* @__PURE__ */ new Set();
			options.registrations.set(key, owned);
		}
		owned.add(dispose);
	}
	/** Per-plugin write chains: `$.store` read-modify-write runs one at a time per plugin. */
	const storeWrites = /* @__PURE__ */ new Map();
	function serializeStore(plugin, write) {
		const next = (storeWrites.get(plugin) ?? Promise.resolve()).then(write, write);
		storeWrites.set(plugin, next.catch(() => void 0));
		return next;
	}
	/** Ask the band of the event's session to redraw, when a surface is drawn at all. */
	function redraw(agent) {
		if (agent !== void 0) options.redraw?.(agent.session.id);
	}
	/** One projection's state, or undefined when the registry or the projection's owning plugin is not composed. */
	function projection(session, key) {
		return ctx.get("sessionProjections")?.stateOf(session, key);
	}
	return {
		"ui.log": (input, { mod }) => {
			const { text, to } = record(input);
			const line = `${mod.name}: ${requireString(text, "$.ui.log text")}`;
			if (to === "debug") ctx.logger.debug(line);
			else ctx.logger.info(line);
		},
		"ui.toast": (input, { mod }) => {
			ctx.logger.info(`${mod.name} (toast): ${requireString(record(input).text, "$.ui.toast text")}`);
		},
		"ui.status": (input, { mod }) => {
			const { text } = record(input);
			ctx.logger.info(`${mod.name} (status): ${text === void 0 ? "(cleared)" : requireString(text, "$.ui.status text")}`);
		},
		"ui.invalidate": (_input, { binding }) => {
			redraw(binding.agent);
		},
		"ui.open": (input, { binding }) => {
			redraw(binding.agent);
			return {
				id: requireString(record(input).id, "$.ui.open id"),
				isPlaced: false,
				reason: "this host places no panes; draw in AbovePrompt"
			};
		},
		"ui.close": (_input, { binding }) => {
			redraw(binding.agent);
		},
		"ui.panes": () => [],
		"ui.ask": async (input, context) => {
			const agent = requireAgent(context, "ui.ask");
			const questions = ctx.get("userQuestions");
			if (questions === void 0) throw new Error("$.ui.ask needs a user-questions service (dsh-user-questions), which this deployment did not compose");
			const { question, options: labels, header, multiSelect } = record(input);
			const choices = Array.isArray(labels) ? labels.map((label) => ({ label: requireString(label, "$.ui.ask option") })) : void 0;
			const item = (await questions.ask({
				questions: [{
					id: "answer",
					question: requireString(question, "$.ui.ask question"),
					...typeof header === "string" ? { header } : {},
					...choices === void 0 ? {} : { options: choices },
					...multiSelect === true ? { multiSelect: true } : {}
				}],
				agent,
				signal: context.signal
			})).answers[0];
			if (item === void 0) throw new Error("$.ui.ask: the user dismissed the question");
			return item.custom ?? item.selected.join(", ");
		},
		"command.register": (input, { mod, binding, engine }) => {
			const spec = record(input);
			const name = requireString(spec.name, "$.command.register name");
			if (!REGISTERED_NAME.test(name)) throw new Error(`"/${name}" refused: command names are letters, digits, "_" and "-", up to 64 characters`);
			const description = requireString(spec.description, "$.command.register description");
			const registry = (binding.agent?.ctx ?? ctx).get("commands");
			if (registry === void 0) throw new Error("$.command.register needs a command registry (dsh-commands), which this deployment did not compose");
			const lowered = name.toLowerCase();
			const definition = {
				name: lowered,
				description,
				...typeof spec.argumentHint === "string" ? { input: { hint: spec.argumentHint } } : {},
				handler: async (invocation) => {
					const run = await engine.raise("command.run", {
						command: lowered,
						args: invocation.rawInput.trim(),
						origin: { kind: "composer" }
					}, () => ({ text: `${mod.name} registered /${lowered} but no command.run hook answered it; add on('command.run', { command: '${lowered}' }, hook)` }), {
						binding: { agent: invocation.agent },
						signal: invocation.signal
					});
					return {
						kind: "success",
						...run.text === void 0 ? {} : { text: `${mod.name}: ${run.text}` }
					};
				}
			};
			const dispose = registry.register(definition);
			options.modCommands.add(lowered);
			track(dispose, binding.agent);
		},
		"command.run": async (input, context) => {
			const agent = requireAgent(context, "command.run");
			const registry = ctx.get("commands");
			if (registry === void 0) throw new Error("$.command.run needs a command registry (dsh-commands), which this deployment did not compose");
			const { command, args } = record(input);
			const name = requireString(command, "$.command.run command");
			const line = typeof args === "string" && args.length > 0 ? `/${name} ${args}` : `/${name}`;
			const execution = await registry.execute(agent, line, [], context.signal);
			if (execution === void 0) throw new Error(`/${name} is not a command`);
			const { result } = execution;
			if (result.kind === "error") throw new Error(result.text);
			return { ...result.text === void 0 ? {} : { text: result.text } };
		},
		"command.list": (_input, context) => {
			const agent = requireAgent(context, "command.list");
			const registry = ctx.get("commands");
			if (registry === void 0) return [];
			return registry.list(agent).map((descriptor) => ({
				name: descriptor.name,
				description: descriptor.description,
				source: options.modCommands.has(descriptor.name) ? "plugin" : "builtin"
			}));
		},
		"tool.register": (input, { mod, binding }) => {
			const spec = record(input);
			const name = requireString(spec.name, "$.tool.register name");
			if (!REGISTERED_NAME.test(name)) throw new Error(`tool "${name}" refused: tool names are letters, digits, "_" and "-", up to 64 characters`);
			const description = requireString(spec.description, "$.tool.register description");
			const inputSchema = spec.inputSchema === void 0 ? {
				type: "object",
				properties: {}
			} : record(spec.inputSchema);
			assertObjectJsonSchema(inputSchema);
			const registry = (binding.agent?.ctx ?? ctx).get("tools");
			if (registry === void 0) throw new Error("$.tool.register needs a tool registry (dsh-tools), which this deployment did not compose");
			const fullName = modToolName(mod.name, name);
			const definition = {
				name: fullName,
				description,
				parameters: inputSchema,
				output: {
					schema: { type: "string" },
					render: (_args, value) => [{
						type: "text",
						text: value
					}]
				},
				execute() {
					return Promise.reject(/* @__PURE__ */ new Error(`${mod.name} registered ${fullName} but no tool.call hook answered it; add on('tool.call', { tool: '${fullName}' }, hook)`));
				}
			};
			track(registry.register(definition), binding.agent);
			options.modTools.add(fullName);
		},
		"tool.call": async (input, context) => {
			const agent = context.binding.agent;
			const registry = ctx.get("tools");
			if (registry === void 0) throw new Error("$.tool.call needs a tool registry (dsh-tools), which this deployment did not compose");
			const { tool, tool_use_id: _ignored, agentId: _agent, ...args } = record(input);
			const callId = ToolCallId(`mod-${randomUUID()}`);
			options.callOrigins.set(callId, context.mod);
			try {
				const result = await registry.execute({
					callId,
					name: aliases.toHarness(requireString(tool, "$.tool.call tool")),
					arguments: args,
					...agent === void 0 ? {} : { agent },
					signal: context.signal
				});
				if (agent !== void 0) for (const context of result.additionalContexts ?? []) agent.inject(context);
				return toolCallResultOf(result);
			} finally {
				options.callOrigins.delete(callId);
			}
		},
		"tool.list": (_input, context) => {
			const registry = ctx.get("tools");
			if (registry === void 0) return [];
			const agent = context.binding.agent;
			return registry.schemas(agent === void 0 ? void 0 : scopeOf(agent.ctx)).map((schema) => ({
				name: aliases.toMod(schema.name),
				description: schema.description
			}));
		},
		"prompt.submit": (input, context) => {
			const agent = requireAgent(context, "prompt.submit");
			const { text, asUser } = record(input);
			const body = requireString(text, "$.prompt.submit text");
			const framed = asUser === true ? body : `Message from the "${context.mod.name}" mod:\n${body}`;
			const message = createUserMessage({
				content: [{
					type: "text",
					text: framed
				}],
				source: { kind: "user" }
			});
			options.submitted?.(message.id, context.mod.name);
			agent.followup(message);
			return { text: framed };
		},
		"session.id": (_input, context) => requireAgent(context, "session.id").session.id,
		"session.cwd": (_input, context) => {
			const agent = requireAgent(context, "session.cwd");
			return directories().get(agent.session);
		},
		"session.root": (_input, context) => requireAgent(context, "session.root").session.header.cwd ?? process.cwd(),
		"session.model": (_input, context) => {
			const agent = requireAgent(context, "session.model");
			return agent.session.requestHeader()?.config.model ?? agent.options.model ?? "";
		},
		"session.turns": (_input, context) => {
			const boundary = projection(requireAgent(context, "session.turns").session, "turnBoundary");
			if (boundary === void 0) throw new Error("$.session.turns needs the turnBoundary projection, which this deployment did not compose");
			return boundary.lastTurn;
		},
		"session.messages": (_input, context) => sessionMessages(requireAgent(context, "session.messages").session.deriveMessages(), aliases),
		"session.usage": (_input, context) => {
			const agent = requireAgent(context, "session.usage");
			const pressure = projection(agent.session, "contextPressure");
			const tokens = pressure?.pressureTokens;
			const window = pressure?.contextWindow ?? 0;
			return {
				startedAt: agent.session.header.createdAt,
				context: {
					...tokens === void 0 ? {} : { tokens },
					window,
					...tokens === void 0 || window === 0 ? {} : { percent: Math.round(tokens / window * 100) }
				},
				rateLimits: []
			};
		},
		"session.version": () => MODS_API_VERSION,
		"store.get": async (input, { mod }) => (await store()).table("store").get(mod.name)?.[requireString(record(input).key, "$.store.get key")],
		"store.set": async (input, { mod }) => {
			const { key, value } = record(input);
			const name = requireString(key, "$.store.set key");
			await serializeStore(mod.name, async () => {
				const table = (await store()).table("store");
				const encoded = stringify({
					...table.get(mod.name),
					[name]: value
				});
				if (encoded === void 0 || Buffer.byteLength(encoded, "utf8") > 4194304) throw new Error(`$.store.set: ${mod.name}'s store would exceed ${STORE_MAX_BYTES} bytes of JSON`);
				await table.put(mod.name, JSON.parse(encoded));
			});
		},
		"store.delete": async (input, { mod }) => {
			const name = requireString(record(input).key, "$.store.delete key");
			await serializeStore(mod.name, async () => {
				const table = (await store()).table("store");
				const current = table.get(mod.name);
				if (current === void 0 || !(name in current)) return;
				const { [name]: _removed, ...rest } = current;
				await table.put(mod.name, rest);
			});
		},
		"store.keys": async (_input, { mod }) => Object.keys((await store()).table("store").get(mod.name) ?? {}),
		"fs.read": async (input, context) => {
			const path = requireString(record(input).path, "$.fs.read path");
			const resolved = await target(path, context.binding.agent, context.signal);
			const info = await fs().stat(resolved, context.signal);
			if (info?.size !== void 0 && info.size > 4194304) throw new Error(`$.fs.read: ${path} is larger than ${FS_MAX_BYTES} bytes`);
			return fs().readText(resolved, context.signal);
		},
		"fs.write": async (input, context) => {
			const { path, text } = record(input);
			const body = requireString(text, "$.fs.write text");
			if (Buffer.byteLength(body, "utf8") > 4194304) throw new Error(`$.fs.write: content is larger than ${FS_MAX_BYTES} bytes`);
			const resolved = await target(requireString(path, "$.fs.write path"), context.binding.agent, context.signal);
			await fs().writeText(resolved, body, void 0, context.signal);
		},
		"fs.list": async (input, context) => {
			const resolved = await target(requireString(record(input).path, "$.fs.list path"), context.binding.agent, context.signal);
			return (await fs().listDir(resolved, context.signal)).map((entry) => ({
				name: entry.name,
				kind: kindOf(entry.type),
				size: sizeOf(entry),
				isLink: false
			}));
		},
		"fs.exists": async (input, context) => {
			const resolved = await target(requireString(record(input).path, "$.fs.exists path"), context.binding.agent, context.signal);
			return await fs().stat(resolved, context.signal) !== void 0;
		},
		"fs.stat": async (input, context) => {
			const path = requireString(record(input).path, "$.fs.stat path");
			const cwd = await currentDirectory(context.binding.agent, context.signal);
			const info = await fs().lstat(path, cwd === void 0 ? {} : { cwd }, context.signal);
			if (info === void 0) throw new Error(`$.fs.stat: ${path} does not exist`);
			if (info.type !== "symlink") return {
				kind: kindOf(info.type),
				size: sizeOf(info),
				mtimeMs: 0,
				isLink: false
			};
			const resolved = await fs().resolve(path, {
				...cwd === void 0 ? {} : { cwd },
				signal: context.signal
			});
			const followed = await fs().stat(resolved, context.signal);
			return {
				kind: kindOf(followed?.type ?? "other"),
				size: sizeOf(followed),
				mtimeMs: 0,
				isLink: true
			};
		},
		"process.run": async (input, context) => {
			const subprocess = ctx.get("subprocess");
			if (subprocess === void 0) throw new Error("$.process.run needs a subprocess service (dsh-subprocess), which this deployment did not compose");
			const { argv, init } = record(input);
			if (!Array.isArray(argv) || argv.length === 0 || !argv.every((item) => typeof item === "string")) throw new TypeError("$.process.run needs a non-empty argv list of strings");
			const settings = record(init);
			const timeoutMs = typeof settings.timeoutMs === "number" ? settings.timeoutMs : options.processTimeoutMs;
			const cwd = typeof settings.cwd === "string" ? settings.cwd : await currentDirectory(context.binding.agent, context.signal) ?? process.cwd();
			const env = typeof settings.env === "object" && settings.env !== null ? settings.env : void 0;
			const deadline = AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)]);
			const handle = subprocess.spawn({
				argv,
				cwd,
				stdio: {
					stdin: "ignore",
					stdout: { maxBytes: PROCESS_OUTPUT_MAX_BYTES },
					stderr: { maxBytes: PROCESS_OUTPUT_MAX_BYTES }
				},
				graceMs: 1e3,
				signal: deadline,
				...env === void 0 ? {} : { env }
			});
			const outcome = await handle.done;
			if (deadline.aborted) throw new Error(`$.process.run: ${argv[0]} did not exit within ${timeoutMs} ms`);
			/* v8 ignore next -- a Windows child reports an exit code even when terminated; POSIX coverage owns this branch */
			if (outcome.exitCode === null) throw new Error(`$.process.run: ${argv[0]} was terminated by signal ${String(outcome.signal)}`);
			return {
				exitCode: outcome.exitCode,
				stdout: readOutput(handle.collected.stdout),
				stderr: readOutput(handle.collected.stderr)
			};
		},
		"http.fetch": async (input, context) => {
			const { url, init } = record(input);
			const settings = record(init);
			const timeoutMs = typeof settings.timeoutMs === "number" ? settings.timeoutMs : options.processTimeoutMs;
			const response = await fetch(requireString(url, "$.http.fetch url"), {
				...typeof settings.method === "string" ? { method: settings.method } : {},
				...typeof settings.headers === "object" && settings.headers !== null ? { headers: settings.headers } : {},
				...typeof settings.body === "string" ? { body: settings.body } : {},
				signal: AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)])
			});
			const headers = {};
			response.headers.forEach((value, name) => {
				headers[name] = value;
			});
			const body = await readBounded(response, HTTP_MAX_BYTES);
			return {
				status: response.status,
				ok: response.ok,
				headers,
				text: body
			};
		},
		"env.get": (input) => process.env[requireString(record(input).name, "$.env.get name")],
		"env.set": (input) => {
			const { name, value } = record(input);
			const key = requireString(name, "$.env.set name");
			if (value === void 0) Reflect.deleteProperty(process.env, key);
			else process.env[key] = requireString(value, "$.env.set value");
		}
	};
}
/** Read a response body up to the bound, cancelling the stream at the first byte past it. */
async function readBounded(response, maxBytes) {
	const reader = response.body?.getReader();
	if (reader === void 0) return "";
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(`$.http.fetch: the response body is larger than ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
//#endregion
//#region lib/types/surfaces.js
/**
* The band above the prompt as the host draws it for one session: renders
* through the mods' `ui.render` hooks, keeps the latest tree with its button
* callbacks held host-side, redraws when a `$.state` value a render read
* changes or a mod asks, and hands watchers each new generation.
* @module
*/
var SessionBand = class {
	generation = 0;
	tree = null;
	/** `$.state` slots the last render read, as `<plugin>\u0000<key>`. */
	subscribed = /* @__PURE__ */ new Set();
	/** Button callbacks of the current generation, by the `actionId` the serialized tree carries. */
	actions = /* @__PURE__ */ new Map();
	watchers = /* @__PURE__ */ new Set();
	/** The render in flight; a refresh during it joins one more pass that starts when it ends. */
	rendering;
	pending;
	/** Set by `forget`: watchers end at their next wake and no further pass renders. */
	closed = false;
	/** Wakes every parked watcher, so a closed band ends its streams. */
	wakers = /* @__PURE__ */ new Set();
	/** Set while a render runs: `$.state` reads subscribe. */
	collecting;
	snapshot() {
		return {
			generation: this.generation,
			tree: this.tree
		};
	}
};
/**
* Bands by session id.
*/
var SurfaceTable = class {
	host;
	bands = /* @__PURE__ */ new Map();
	disposed = false;
	constructor(host) {
		this.host = host;
	}
	/**
	* The latest snapshot of a session's band, drawing it first when nothing was drawn yet.
	* @param sessionId - the session.
	* @returns the current generation.
	*/
	async current(sessionId) {
		const band = this.bandOf(sessionId);
		if (band.generation === 0) await this.refresh(sessionId);
		return band.snapshot();
	}
	/**
	* Watch a session's band: the current snapshot first, then every redraw, until the signal aborts.
	* @param sessionId - the session.
	* @param signal - ends the watch.
	* @returns the snapshots.
	*/
	async *watch(sessionId, signal) {
		const band = this.bandOf(sessionId);
		const queue = [];
		let wake;
		const watcher = (snapshot) => {
			queue.push(snapshot);
			wake?.();
		};
		band.watchers.add(watcher);
		const onAbort = () => {
			wake?.();
		};
		const waker = () => {
			wake?.();
		};
		band.wakers.add(waker);
		signal.addEventListener("abort", onAbort, { once: true });
		try {
			const first = await this.current(sessionId);
			let delivered = first.generation;
			yield first;
			while (!signal.aborted && !band.closed) {
				const next = queue.shift();
				if (next !== void 0) {
					if (next.generation <= delivered) continue;
					delivered = next.generation;
					yield next;
					continue;
				}
				await new Promise((resolve) => {
					wake = resolve;
				});
				wake = void 0;
			}
		} finally {
			band.watchers.delete(watcher);
			band.wakers.delete(waker);
			signal.removeEventListener("abort", onAbort);
		}
	}
	/**
	* Redraw a session's band through the mods and notify watchers when the tree changed.
	* @param sessionId - the session.
	* @returns settles once the redraw landed.
	*/
	refresh(sessionId) {
		const band = this.bandOf(sessionId);
		if (band.rendering === void 0) {
			band.rendering = this.renderOnce(sessionId, band).finally(() => {
				band.rendering = void 0;
			});
			return band.rendering;
		}
		band.pending ??= band.rendering.then(() => {
			band.pending = void 0;
			return this.refresh(sessionId);
		});
		return band.pending;
	}
	/**
	* Run the callback a button holds and redraw. A press from an earlier
	* generation is ignored: the button it names may no longer exist.
	* @param sessionId - the session.
	* @param generation - the generation the client saw.
	* @param actionId - the id the serialized Button carried.
	* @returns the snapshot after the press.
	*/
	async press(sessionId, generation, actionId) {
		const band = this.bandOf(sessionId);
		const action = generation === band.generation ? band.actions.get(actionId) : void 0;
		if (action === void 0) {
			this.host.report(`band press ignored: ${actionId} of generation ${generation} is not on the current drawing (${band.generation})`);
			return band.snapshot();
		}
		await this.host.runAction(sessionId, action);
		await this.refresh(sessionId);
		return band.snapshot();
	}
	/**
	* Note a `$.state` read: during a render it subscribes the band to the slot.
	* @param sessionId - the session the state belongs to.
	* @param slot - the `<plugin>\u0000<key>` slot.
	*/
	stateRead(sessionId, slot) {
		this.bands.get(sessionId)?.collecting?.add(slot);
	}
	/**
	* Note a `$.state` write: a subscribed band redraws.
	* @param sessionId - the session the state belongs to.
	* @param slot - the `<plugin>\u0000<key>` slot.
	*/
	stateWritten(sessionId, slot) {
		const band = this.bands.get(sessionId);
		if (band === void 0 || !band.subscribed.has(slot)) return;
		this.refresh(sessionId);
	}
	/**
	* Forget a session's band: its watch streams end and no further pass renders it.
	* @param sessionId - the disposed session.
	*/
	forget(sessionId) {
		const band = this.bands.get(sessionId);
		if (band === void 0) return;
		this.bands.delete(sessionId);
		band.closed = true;
		band.watchers.clear();
		for (const waker of [...band.wakers]) waker();
	}
	/** Stop drawing: every band is forgotten and its watch streams end. */
	dispose() {
		this.disposed = true;
		for (const sessionId of [...this.bands.keys()]) this.forget(sessionId);
	}
	bandOf(sessionId) {
		let band = this.bands.get(sessionId);
		if (band === void 0) {
			band = new SessionBand();
			this.bands.set(sessionId, band);
		}
		return band;
	}
	async renderOnce(sessionId, band) {
		if (this.disposed || band.closed) return;
		const input = {
			component: "AbovePrompt",
			surface: "AbovePrompt",
			props: {
				bodyColumns: this.host.columns,
				hasSurvey: false,
				isWorking: false,
				maxRows: this.host.rows
			},
			viewport: { columns: this.host.columns }
		};
		band.collecting = /* @__PURE__ */ new Set();
		let tree;
		try {
			tree = await this.host.render(sessionId, input);
		} catch (error) {
			this.host.report(`band render failed: ${messageOf(error)}`);
			tree = null;
		}
		band.subscribed.clear();
		for (const slot of band.collecting) band.subscribed.add(slot);
		band.collecting = void 0;
		const problem = treeProblem(tree);
		if (problem !== void 0) {
			this.host.report(`a ui.render hook returned a tree that does not validate: ${problem}`);
			tree = null;
		}
		const actions = /* @__PURE__ */ new Map();
		const serialized = serializeTree(tree, (callback) => {
			const id = `a${actions.size}`;
			actions.set(id, callback);
			return id;
		});
		const next = serialized.length === 0 ? null : serialized;
		if (band.generation > 0 && JSON.stringify(next) === JSON.stringify(band.tree)) {
			band.actions.clear();
			for (const [id, action] of actions) band.actions.set(id, action);
			return;
		}
		band.generation += 1;
		band.tree = next;
		band.actions.clear();
		for (const [id, action] of actions) band.actions.set(id, action);
		for (const watcher of band.watchers) watcher(band.snapshot());
	}
};
//#endregion
//#region lib/types/tool-names.js
/**
* Tool-name aliases between Claude Code's built-in tool names, which a mod's
* matchers and `e.tool` use, and the harness tool names the registry knows.
* @module
*/
/** Claude Code tool name → harness tool name, for the built-in tools both products ship. */
const DEFAULT_TOOL_ALIASES = Object.freeze({
	Bash: "bash",
	Read: "read",
	Edit: "edit",
	Write: "write",
	Glob: "glob",
	Grep: "grep",
	WebFetch: "web_fetch",
	WebSearch: "web_search",
	Task: "subagent",
	TodoWrite: "todo_write",
	AskUserQuestion: "ask_user_question",
	ExitPlanMode: "exit_plan_mode",
	Skill: "skill"
});
/**
* Build the translation from the built-in table plus deployment overrides.
* @param overrides - Claude Code name → harness name entries that extend or replace the defaults.
* @returns the two-way translation.
*/
function createToolNameAliases(overrides = {}) {
	const forward = new Map(Object.entries({
		...DEFAULT_TOOL_ALIASES,
		...overrides
	}));
	const reverse = /* @__PURE__ */ new Map();
	for (const [modName, harnessName] of forward) reverse.set(harnessName, modName);
	return {
		toMod: (harnessName) => reverse.get(harnessName) ?? harnessName,
		toHarness: (modName) => forward.get(modName) ?? modName
	};
}
//#endregion
//#region lib/types/define-mod.js
/**
* `defineMod`: wrap a Claude Code mod's `register(on, options)` as a DSH
* plugin. Mounting the plugin registers the mod with the bridge service
* (`ctx.claudeCodeMods`); unmounting it removes the mod's hooks, timers, and
* registrations. Mods load in composition order, which is their chain order.
* @module
*/
const optionValue = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string())
]);
/**
* Wrap one mod as a DSH plugin.
* @param spec - the mod's identity, `userConfig` defaults, and `register`.
* @returns a plugin object for `cordis.yml` or `ctx.plugin`; its `config` overlays `userConfig` as `register`'s `options`.
*/
function defineMod(spec) {
	const userConfig = Object.freeze({ ...spec.userConfig });
	const definition = Object.freeze({
		name: spec.name,
		...spec.version === void 0 ? {} : { version: spec.version },
		...spec.root === void 0 ? {} : { root: spec.root },
		options: userConfig,
		register: spec.register
	});
	return {
		name: `claude-code-mod-${spec.name}`,
		inject: ["claudeCodeMods"],
		Config: z.dict(optionValue).default({}),
		definition,
		apply(ctx, config) {
			return ctx.claudeCodeMods.add({
				...definition,
				options: Object.freeze({
					...userConfig,
					...config
				})
			});
		}
	};
}
//#endregion
//#region lib/types/index.js
/**
* Experimental bridge for Claude Code mods. A mod is a DSH plugin built with
* {@link defineMod} around the mod's `register(on, options)`; this service
* keeps the loaded mods and raises their events from harness extension
* points — `session.start` on `agent/created`, `prompt.submit` and
* `turn.start` on `agent/pre-step`, `tool.call` around `tools/execute`,
* `turn.complete` on `turn/end`, `session.end` on `agent/disposed`, and
* `command.run` from the commands a mod registers. The `$` a hook receives is
* served by {@link createHostOps} over the composed harness services.
* @module @deepseek-ai/dsh-experimental-claude-code-mods
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Engine events this host raises; a hook on any other known event registers and is reported as unserved. */
const SERVED_EVENTS = new Set([
	"session.start",
	"session.end",
	"prompt.submit",
	"turn.start",
	"turn.complete",
	"tool.call",
	"command.run",
	"ui.render"
]);
/** Where the deferred argument-rewrite mechanism is specified. */
const REWRITE_NOTE = ".agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md";
function assertPositive(field, value) {
	if (!Number.isFinite(value) || value <= 0) throw new Error(`claude-code-mods: ${field} must be a positive number of milliseconds`);
}
function textOf(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/** The human's own messages among a claim: the prompt a `prompt.submit` hook sees and may rewrite. */
function promptMessages(claimed) {
	return claimed.filter((message) => message.source.kind === "user");
}
/**
* Replace the prompt text across the human's messages with one rewritten
* text: the first text block carries it, other text blocks go, every
* non-text block stays in place. A prompt without any text block, such as an
* image alone, gains the text after its blocks.
*/
function rewritePromptText(prompt, text) {
	const placement = { placed: false };
	const rewritten = prompt.map((message) => {
		if (!message.content.some((block) => block.type === "text")) return message;
		const content = [];
		for (const block of message.content) if (block.type !== "text") content.push(block);
		else if (!placement.placed) {
			placement.placed = true;
			content.push({
				type: "text",
				text
			});
		}
		return {
			...message,
			content
		};
	});
	const first = rewritten[0];
	if (placement.placed || text.length === 0 || first === void 0) return rewritten;
	return [{
		...first,
		content: [...first.content, {
			type: "text",
			text
		}]
	}, ...rewritten.slice(1)];
}
/** Append the context a hook attached as blocks after the prompt as typed, on the last of the human's messages. */
function appendContext(prompt, context) {
	const last = prompt.at(-1);
	/* v8 ignore next -- the caller only appends context to a prompt it raised, which has at least one human message */
	if (last === void 0) return [...prompt];
	const blocks = context.map((line) => ({
		type: "text",
		text: line
	}));
	return [...prompt.slice(0, -1), {
		...last,
		content: [...last.content, ...blocks]
	}];
}
/** Keep only the fields of a `prompt.submit` result a mod may set, each with its declared type. */
function acceptPromptSubmit(result, original) {
	if (typeof result.drop === "string") return { drop: result.drop };
	const context = Array.isArray(result.context) ? result.context.filter((line) => typeof line === "string") : [];
	return {
		text: typeof result.text === "string" ? result.text : original,
		...context.length === 0 ? {} : { context }
	};
}
/** Fold one committed assistant message into the turn's answer and usage. */
function foldAssistantMessage(turnRecord, data) {
	turnRecord.answer = textOf(data.message.content);
	if (data.usage === void 0) return;
	const { model } = data.message.source;
	const usage = turnRecord.usage ?? {
		input_tokens: 0,
		output_tokens: 0,
		cache_read_input_tokens: 0,
		cache_creation_input_tokens: 0,
		model
	};
	usage.input_tokens += data.usage.inputTokens;
	usage.output_tokens += data.usage.outputTokens;
	usage.cache_read_input_tokens += data.usage.cacheReadTokens ?? 0;
	usage.cache_creation_input_tokens += data.usage.cacheWriteTokens ?? 0;
	usage.model = model;
	turnRecord.usage = usage;
}
/** Detached mod runs the bridge tracks so disposal can await them; a rejection is reported, never unhandled. */
var DetachedRuns = class {
	report;
	pending = /* @__PURE__ */ new Set();
	controller = new AbortController();
	constructor(report) {
		this.report = report;
	}
	track(label, run) {
		/* v8 ignore next -- the engine behaviors beneath these runs are total; the report guards a future rejecting one */
		const settled = run.then(() => void 0, (error) => {
			this.report(`${label} failed: ${messageOf(error)}`);
		});
		this.pending.add(settled);
		settled.finally(() => {
			this.pending.delete(settled);
		});
	}
	/** Abort every run's signal; `drain` then waits for them to settle. */
	cancel() {
		this.controller.abort(/* @__PURE__ */ new Error("claude-code-mods disposed"));
	}
	async drain() {
		this.cancel();
		await Promise.allSettled([...this.pending]);
	}
};
/** The lossless-JSON copy of a mod's answer, or undefined when it has none. */
function jsonValueOf(value) {
	const text = stringify(value);
	return text === void 0 ? void 0 : JSON.parse(text);
}
/** An error-shaped tool result carrying a mod's text in place of the tool's own. */
function modAnswered(text, code, rendered = text) {
	return {
		isError: true,
		error: {
			message: text,
			info: {
				name: code === "MOD_DENIED" ? "ModDenied" : "ModAnswered",
				code
			}
		},
		content: [{
			type: "text",
			text: rendered
		}]
	};
}
/**
* The bridge service: loaded mods, their hooks, and the harness listeners
* that raise their events. Mods join through {@link ClaudeCodeMods.add},
* which {@link defineMod} calls when a mod plugin mounts. The Remote methods
* let a Client draw each session's band above the prompt and press its buttons.
*/
let ClaudeCodeMods = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _watchBand_decorators;
	let _pressBand_decorators;
	return class ClaudeCodeMods extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_watchBand_decorators = [Remote({ mode: "stream" })];
			_pressBand_decorators = [Remote];
			__esDecorate(this, null, _watchBand_decorators, {
				kind: "method",
				name: "watchBand",
				static: false,
				private: false,
				access: {
					has: (obj) => "watchBand" in obj,
					get: (obj) => obj.watchBand
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _pressBand_decorators, {
				kind: "method",
				name: "pressBand",
				static: false,
				private: false,
				access: {
					has: (obj) => "pressBand" in obj,
					get: (obj) => obj.pressBand
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static Config = z.object({
			hookTimeoutMs: z.number().default(1e4),
			catchTimeoutMs: z.number().default(1e3),
			processTimeoutMs: z.number().default(3e4),
			toolAliases: z.dict(z.string()),
			bandColumns: z.number().default(120),
			bandRows: z.number().default(10)
		});
		static inject = ["workingDirectory"];
		engine = __runInitializers(this, _instanceExtraInitializers);
		registrations = /* @__PURE__ */ new Map();
		surfaces;
		constructor(ctx, config) {
			super(ctx, "claudeCodeMods", { namespace: "claudeCodeMods" });
			const { hookTimeoutMs = 1e4, catchTimeoutMs = 1e3, processTimeoutMs = 3e4, bandColumns = 120, bandRows = 10 } = config;
			assertPositive("hookTimeoutMs", hookTimeoutMs);
			assertPositive("catchTimeoutMs", catchTimeoutMs);
			assertPositive("processTimeoutMs", processTimeoutMs);
			assertPositive("bandColumns", bandColumns);
			assertPositive("bandRows", bandRows);
			const aliases = createToolNameAliases(config.toolAliases);
			const callOrigins = /* @__PURE__ */ new Map();
			const modCommands = /* @__PURE__ */ new Set();
			const modTools = /* @__PURE__ */ new Set();
			const report = (line) => {
				ctx.logger.warn(`claude-code-mods: ${line}`);
			};
			const agentOf = (sessionId) => ctx.get("agents")?.get(SessionId(sessionId));
			const detached = new DetachedRuns(report);
			const surfaces = new SurfaceTable({
				columns: bandColumns,
				rows: bandRows,
				render: (sessionId, input) => {
					const agent = agentOf(sessionId);
					/* v8 ignore next -- agent/disposed forgets the band before the registry drops the agent; a redraw racing it draws nothing */
					if (agent === void 0) return Promise.resolve(null);
					return engine.raise("ui.render", input, () => null, {
						binding: { agent },
						signal: detached.controller.signal
					});
				},
				runAction: async (_sessionId, callback) => {
					try {
						await callback();
					} catch (error) {
						report(`a button's onPress failed: ${messageOf(error)}`);
					}
				},
				report
			});
			this.surfaces = surfaces;
			const redraw = (sessionId) => {
				setTimeout(() => {
					if (agentOf(sessionId) !== void 0) surfaces.refresh(sessionId);
				}, 0).unref();
			};
			const modSubmissions = /* @__PURE__ */ new Map();
			const ops = createHostOps({
				ctx,
				aliases,
				processTimeoutMs,
				registrations: this.registrations,
				callOrigins,
				modCommands,
				modTools,
				redraw,
				submitted: (messageId, mod) => {
					modSubmissions.set(messageId, mod);
				}
			});
			const engine = new ModsEngine({
				ops: (op) => ops[op],
				stateKey: (binding) => binding.agent?.session.id ?? "",
				budgetMs: hookTimeoutMs,
				catchBudgetMs: catchTimeoutMs,
				report,
				onStateRead: (key, slot) => {
					surfaces.stateRead(key, slot);
				},
				onStateWritten: (key, slot) => {
					surfaces.stateWritten(key, slot);
				}
			});
			this.engine = engine;
			const registrations = this.registrations;
			ctx.effect(() => async () => {
				detached.cancel();
				surfaces.dispose();
				for (const owned of registrations.values()) for (const dispose of owned) dispose();
				registrations.clear();
				await engine.dispose();
				await detached.drain();
			}, "claude-code-mods: unload mods");
			const isRoot = (agent) => {
				const agents = ctx.get("agents");
				return agents === void 0 || agents.roots().includes(agent);
			};
			/** Root agents that received `session.start`; the registry no longer lists an agent once it is disposed. */
			const startedRoots = /* @__PURE__ */ new Set();
			const agentIdOf = (agent) => agent !== void 0 && !isRoot(agent) ? { agentId: agent.id } : {};
			/** Per-session fold of the open turn, keyed by session id. */
			const turns = /* @__PURE__ */ new Map();
			/** Turns whose first pre-step already raised `turn.start`, by session id. */
			const startedTurns = /* @__PURE__ */ new Map();
			/** Rewritten tool results the post-execute listener installs as content. */
			const replacements = /* @__PURE__ */ new Map();
			ctx.on("agent/created", async ({ agent, signal }) => {
				if (!isRoot(agent)) return;
				startedRoots.add(agent.session.id);
				/* v8 ignore next -- the loop always supplies an initialization signal; the payload type keeps it optional */
				const abandon = signal === void 0 ? detached.controller.signal : AbortSignal.any([signal, detached.controller.signal]);
				const input = {
					cwd: await ctx.workingDirectory.ensure(agent, abandon),
					surface: null,
					isInteractive: ctx.get("userQuestions") !== void 0
				};
				await engine.raise("session.start", input, (e) => ({ cwd: e.cwd }), {
					binding: { agent },
					signal: abandon
				});
				redraw(agent.session.id);
			});
			ctx.on("agent/disposed", ({ agent }) => {
				const sessionId = agent.session.id;
				turns.delete(sessionId);
				startedTurns.delete(sessionId);
				registrations.delete(sessionId);
				surfaces.forget(sessionId);
				const forget = () => engine.forgetSession(sessionId);
				if (!startedRoots.delete(sessionId)) {
					detached.track("session cleanup", forget());
					return;
				}
				const input = {
					reason: "other",
					sessionId
				};
				detached.track("session.end", engine.raise("session.end", input, (e) => ({ sessionId: e.sessionId }), {
					binding: { agent },
					signal: detached.controller.signal
				}).then(forget, forget));
			});
			ctx.on("agent/pre-step", async ({ agent, messages, turn, signal }, next) => {
				const binding = { agent };
				const started = startedTurns.get(agent.session.id) ?? /* @__PURE__ */ new Set();
				startedTurns.set(agent.session.id, started);
				const first = !started.has(turn);
				started.add(turn);
				const prompt = promptMessages(messages);
				const text = textOf(prompt.flatMap((message) => message.content));
				let submitted = { text };
				if (prompt.length > 0) {
					const submitter = prompt.map((message) => modSubmissions.get(message.id)).find((name) => name !== void 0);
					for (const message of prompt) modSubmissions.delete(message.id);
					const input = {
						text,
						wait: false,
						origin: submitter === void 0 ? { kind: "composer" } : {
							kind: "plugin",
							name: submitter
						}
					};
					submitted = acceptPromptSubmit(await engine.raise("prompt.submit", input, (e) => ({
						text: e.text,
						...e.context === void 0 ? {} : { context: e.context }
					}), {
						binding,
						signal
					}), text);
					if (submitted.drop !== void 0) {
						ctx.logger.info(`claude-code-mods: prompt dropped: ${submitted.drop}`);
						return { kind: "reject" };
					}
				}
				if (first) {
					const input = {
						text: submitted.text,
						turnId: String(turn),
						...agentIdOf(agent)
					};
					await engine.raise("turn.start", input, (e) => ({ turnId: e.turnId }), {
						binding,
						signal
					});
				}
				const downstream = await next();
				if (downstream.kind !== "enter" || messages.length === 0) return downstream;
				const context = submitted.context ?? [];
				if (submitted.text === text && context.length === 0) return downstream;
				let edited = submitted.text === text ? [...prompt] : rewritePromptText(prompt, submitted.text);
				if (context.length > 0) edited = appendContext(edited, context);
				const rewritten = /* @__PURE__ */ new Map();
				edited.forEach((message, index) => {
					rewritten.set(prompt[index], message);
				});
				return {
					...downstream,
					messages: downstream.messages.map((message) => rewritten.get(message) ?? message)
				};
			});
			ctx.on("tools/execute", async (exec, next) => {
				const raisedBy = callOrigins.get(exec.callId);
				const hooks = engine.registry.select("tool.call", raisedBy);
				if (hooks.length === 0) return next();
				const agent = exec.agent;
				const callArguments = record(exec.arguments);
				const modName = aliases.toMod(exec.name);
				const input = {
					...callArguments,
					tool: modName,
					tool_use_id: exec.callId,
					...agentIdOf(agent)
				};
				const logged = JSON.stringify(callArguments);
				let beneath;
				const answer = await engine.raiseWith("tool.call", hooks, raisedBy, input, async () => {
					beneath = await next();
					return toolCallResultOf(beneath);
				}, {
					binding: { agent },
					signal: exec.signal,
					validateNext: (e) => {
						const { tool, tool_use_id: _id, agentId: _agentId, ...rest } = e;
						if (tool !== modName) throw new RewriteRefusedError(`rerouted the call from ${modName} to ${tool}; the logged call runs the tool it named`);
						if (JSON.stringify(rest) !== logged) throw new RewriteRefusedError(`rewrote the arguments of ${modName}; argument rewrites need the pre-tool input rewrite mechanism (${REWRITE_NOTE})`);
					}
				});
				if (agent !== void 0) redraw(agent.session.id);
				if (answer.deny !== void 0) return modAnswered(answer.deny, "MOD_DENIED", `Error: ${answer.deny}`);
				const text = typeof answer.result === "string" ? answer.result : stringify(answer.result) ?? "";
				if (beneath !== void 0) {
					const mapped = toolCallResultOf(beneath);
					if (mapped.result === answer.result && mapped.isError === answer.isError) return beneath;
					if (answer.isError === true && !beneath.isError) return modAnswered(text, "MOD_ANSWERED");
					replacements.set(exec.token, text);
					return beneath;
				}
				if (answer.isError === true) return modAnswered(text, "MOD_ANSWERED");
				if (modTools.has(exec.name)) return {
					isError: false,
					value: text,
					content: [{
						type: "text",
						text
					}]
				};
				const definition = ctx.get("tools")?.get(exec.name, agent === void 0 ? void 0 : scopeOf(agent.ctx));
				const value = jsonValueOf(answer.result);
				if (definition !== void 0 && value !== void 0 && validateJsonSchemaValue(definition.output.schema, value).length === 0) return {
					isError: false,
					value,
					content: definition.output.render(exec.arguments, value)
				};
				return modAnswered(text, "MOD_ANSWERED");
			});
			ctx.on("tools/result", (exec) => {
				replacements.delete(exec.token);
			});
			ctx.on("tools/post-execute", async (exec, _result, next) => {
				const replacement = replacements.get(exec.token);
				if (replacement === void 0) return next();
				replacements.delete(exec.token);
				const downstream = await next();
				if (downstream.kind === "block") return downstream;
				return {
					kind: "accept",
					content: [{
						type: "text",
						text: replacement
					}],
					...downstream.additionalContexts === void 0 ? {} : { additionalContexts: downstream.additionalContexts }
				};
			});
			ctx.on("session/event", (session, event) => {
				if (event.type === "turn/start") {
					turns.set(session.id, {
						turn: event.data.turn,
						startedAt: Date.now(),
						answer: "",
						usage: void 0
					});
					return;
				}
				if (event.type === "assistant/message") {
					const turnRecord = turns.get(session.id);
					if (turnRecord !== void 0) foldAssistantMessage(turnRecord, event.data);
					return;
				}
				if (event.type !== "turn/end") return;
				const { turn, reason } = event.data;
				startedTurns.get(session.id)?.delete(turn);
				const agent = ctx.get("agents")?.get(session.id);
				if (agent === void 0) return;
				const turnRecord = turns.get(session.id);
				const folded = turnRecord?.turn === turn ? turnRecord : void 0;
				const input = {
					turnId: String(turn),
					answer: folded?.answer ?? "",
					durationMs: folded === void 0 ? 0 : Date.now() - folded.startedAt,
					isAborted: reason.kind === "aborted",
					reason: reason.kind === "aborted" ? "aborted" : reason.kind === "error" ? "error" : "answer",
					...agentIdOf(agent),
					...folded?.usage === void 0 ? {} : { usage: { ...folded.usage } }
				};
				if (folded !== void 0) turns.delete(session.id);
				detached.track("turn.complete", engine.raise("turn.complete", input, () => ({ text: "" }), {
					binding: { agent },
					signal: detached.controller.signal
				}).then((result) => {
					if (typeof result.text === "string" && result.text.length > 0) ctx.logger.info(`claude-code-mods: ${result.text}`);
					redraw(session.id);
				}));
			});
		}
		/**
		* Watch the band above the prompt of one session: the current drawing, then
		* every redraw, until the Client stops watching.
		* @param agent - the session's agent, resolved by the Gateway.
		* @param signal - carrier cancellation.
		* @returns the band's snapshots.
		*/
		watchBand(agent, signal) {
			return this.surfaces.watch(agent.session.id, signal);
		}
		/**
		* Press a button of the band's current drawing: runs the mod's `onPress` and redraws.
		* @param agent - the session's agent, resolved by the Gateway.
		* @param generation - the drawing the Client saw.
		* @param actionId - the button's action id in that drawing.
		* @returns the snapshot after the press.
		*/
		pressBand(agent, generation, actionId) {
			return this.surfaces.press(agent.session.id, generation, actionId);
		}
		/**
		* Load one mod beneath every mod loaded before it: run its `register`,
		* keep its hooks, and report which of its events this host never raises.
		* @param definition - the mod as its plugin defined it.
		* @returns the disposer that removes the mod's hooks, closes its timers, and releases its registrations.
		* @throws Error when the name is invalid or taken, or when `register` throws (Claude Code's `hooks module did not load` wording).
		*/
		async add(definition) {
			const mod = await this.engine.add(definition);
			const unserved = this.engine.registry.unserved(mod, SERVED_EVENTS);
			this.ctx.logger.info(`claude-code-mods: hooks module ${mod.name}@inline loaded (tier user); events: ${this.engine.describe(mod) || "(none)"}`);
			if (unserved.length > 0) this.ctx.logger.warn(`claude-code-mods: ${mod.name}: on(${unserved.map((event) => JSON.stringify(event)).join(", ")}) registered, but this host never raises ${unserved.length === 1 ? "that event" : "those events"}`);
			return async () => {
				await this.engine.unload(mod.name);
			};
		}
		/** The loaded mods in chain order. */
		get mods() {
			return this.engine.registry.list();
		}
	};
})();
//#endregion
export { ClaudeCodeMods, ClaudeCodeMods as default, DEFAULT_TOOL_ALIASES, KNOWN_EVENTS, MODS_API_VERSION, SERVED_EVENTS, defineMod };
