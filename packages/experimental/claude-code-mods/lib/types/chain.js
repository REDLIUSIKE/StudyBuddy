/**
 * The middleware chain: runs the hooks selected for one event in order, each
 * hook's `next` reaching the hooks beneath and then the engine behavior, under
 * Claude Code's failure rules (skip a hook that throws, times out, or returns
 * no result; keep the result from beneath when it had already called `next`;
 * give a `.catch` handler the chance to answer in its place).
 * @module
 */
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { messageOf } from "./values.js";
import { matcherMatches } from "./matcher.js";
/** The `next.error.kind === 'timeout'` failure. */
export class HookTimeoutError extends Error {
    constructor(budgetMs) {
        super(`ran past its ${budgetMs} ms limit`);
        this.name = 'HookTimeoutError';
    }
}
/**
 * Accounts a hook's own running time: the clock runs while the hook is busy
 * and pauses while it awaits `next` or a mods API call. The deadline promise
 * rejects once the busy time reaches the limit.
 */
export class BudgetClock {
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
        // The deadline only matters while a race awaits it; an unobserved
        // rejection after the hook settled must not surface.
        this.deadline.promise.catch(() => { });
    }
    /** Rejects with {@link HookTimeoutError} when the busy time reaches the limit. */
    get expired() {
        return this.deadline.promise;
    }
    /** Milliseconds left before the deadline fires. */
    get remainingMs() {
        const busy = this.busySince === undefined ? 0 : this.now() - this.busySince;
        return Math.max(0, this.ms - this.spent - busy);
    }
    /** Start counting; the hook is busy from now on. */
    start() {
        if (this.stopped)
            return;
        this.busySince = this.now();
        this.arm();
    }
    /** Stop counting while the hook awaits `next` or a mods API call. Nested pauses are counted. */
    pause() {
        if (this.stopped)
            return;
        this.pauses += 1;
        if (this.busySince !== undefined) {
            this.spent += this.now() - this.busySince;
            this.busySince = undefined;
        }
        this.disarm();
    }
    /** Resume counting after the awaited call settled. */
    resume() {
        if (this.stopped || this.pauses === 0)
            return;
        this.pauses -= 1;
        if (this.pauses === 0) {
            this.busySince = this.now();
            this.arm();
        }
    }
    /** The hook settled: no deadline can fire from now on. */
    stop() {
        if (this.busySince !== undefined)
            this.spent += this.now() - this.busySince;
        this.stopped = true;
        this.busySince = undefined;
        this.disarm();
    }
    arm() {
        this.disarm();
        const remaining = this.remainingMs;
        this.timer = setTimeout(() => {
            this.stopped = true;
            this.busySince = undefined;
            this.spent = this.ms;
            this.deadline.reject(new HookTimeoutError(this.ms));
        }, remaining);
        this.timer.unref();
    }
    disarm() {
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
    }
}
/** Thrown by {@link DispatchRequest.validateNext}: the hook asked for a rewrite this host does not serve. */
export class RewriteRefusedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RewriteRefusedError';
    }
}
/** The engine's own origin. */
export const ENGINE_ORIGIN = Object.freeze({ plugin: 'engine', tier: 'core' });
/** A hook settled with something other than a result object. */
class NoResultError extends Error {
    constructor() {
        super('returned no result');
        this.name = 'NoResultError';
    }
}
/** Classify a failed hook and word the diagnostic line's tail. */
function failureOf(error) {
    if (error instanceof HookTimeoutError)
        return { kind: 'timeout', message: error.message, line: `timeout, ${error.message}` };
    if (error instanceof NoResultError || error instanceof RewriteRefusedError)
        return { kind: 'throw', message: error.message, line: error.message };
    const message = error instanceof Error ? `${error.name}: ${error.message}` : messageOf(error);
    return { kind: 'throw', message, line: `threw ${message}` };
}
/** Freeze the event input in place at every depth, as the mods API promises. */
function freezeInput(input) {
    return typeof input === 'object' && input !== null ? deepFreeze(input) : input;
}
/**
 * Run one event through its hooks and the engine behavior.
 * @param request - the event, its hooks, and the engine behavior beneath them.
 * @returns the event's result as the outermost hook returned it.
 */
export async function dispatch(request) {
    const { hooks } = request;
    async function runFrom(index, input) {
        for (let i = index; i < hooks.length; i += 1) {
            const hook = hooks[i];
            if (hook.matcher !== undefined && !matcherMatches(hook.matcher, input))
                continue;
            return runHook(hook, i, input);
        }
        return request.core(input);
    }
    async function runHook(hook, index, input) {
        const frozen = freezeInput(input);
        const clock = new BudgetClock(request.budgetMs);
        // Closure-written flags live on one object so the catch path reads their current values.
        const state = { abandoned: false, called: false, beneath: undefined, beneathError: undefined, refused: undefined };
        const next = Object.assign((e) => {
            state.called = true;
            // One run beneath per hook: a second call hands back the first run.
            if (state.beneath !== undefined)
                return state.beneath;
            if (state.abandoned)
                return Promise.resolve(undefined);
            if (request.validateNext !== undefined) {
                try {
                    request.validateNext(e, hook);
                }
                catch (error) {
                    const refused = error instanceof Error ? error : new Error(messageOf(error));
                    state.refused = { error: refused };
                    return Promise.reject(refused);
                }
            }
            clock.pause();
            state.beneath = runFrom(index + 1, e)
                .catch((error) => {
                state.beneathError = { error };
                throw error;
            })
                .finally(() => { clock.resume(); });
            return state.beneath;
        }, {
            signal: request.signal,
            origin: request.origin,
            budget: { ms: request.budgetMs, get remainingMs() { return clock.remainingMs; } },
            to() {
                return Promise.reject(new Error('next.to is only available to mods in managed prependPlugins or appendPlugins'));
            },
        });
        const api = request.api(hook, clock);
        clock.start();
        try {
            const running = Promise.resolve().then(() => hook.hook(api, frozen, next));
            // An abandoned hook's later rejection is not an unhandled rejection.
            running.catch(() => { });
            const result = await Promise.race([running, clock.expired]);
            // `null` is an answer (a surface drawn empty); only a hook that settles with no object at all is skipped.
            if (typeof result !== 'object')
                throw new NoResultError();
            // The hook answered; whatever it started beneath still runs to its end before the event settles.
            clock.stop();
            if (state.beneath !== undefined) {
                await state.beneath.catch((error) => {
                    request.report(`${hook.mod.name}: ${request.event}: the chain beneath failed after the hook answered: ${messageOf(error)}`);
                });
            }
            return result;
        }
        catch (error) {
            state.abandoned = true;
            // The engine beneath failed, not the hook: the failure is the event's own.
            if (state.beneathError !== undefined && error === state.beneathError.error)
                throw error;
            // A refused rewrite is the hook's failure even when the hook let the rejection through unchanged.
            const failure = failureOf(state.refused !== undefined && error === state.refused.error ? state.refused.error : error);
            if (!hook.reported.has(failure.kind)) {
                hook.reported.add(failure.kind);
                request.report(`${hook.mod.name}: ${request.event} hook skipped: ${failure.line}`);
            }
            if (hook.catchHandler !== undefined) {
                const answered = await runCatch(hook, index, frozen, { kind: failure.kind, message: failure.message }, state);
                if (answered !== undefined)
                    return answered;
            }
            // Whatever ran beneath, for the hook or its handler, ran once; its result stands.
            if (state.beneath !== undefined)
                return await state.beneath;
            return await runFrom(index + 1, input);
        }
        finally {
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
            if (state.beneath !== undefined)
                return state.beneath;
            if (handlerAbandoned)
                return Promise.resolve(undefined);
            if (request.validateNext !== undefined) {
                // The same check the hook's own next makes: a handler cannot pass a rewrite beneath either.
                try {
                    request.validateNext(e, hook);
                }
                catch (error) {
                    return Promise.reject(error instanceof Error ? error : new Error(messageOf(error)));
                }
            }
            clock.pause();
            state.beneath = runFrom(index + 1, e).finally(() => { clock.resume(); });
            return state.beneath;
        }, {
            signal: request.signal,
            origin: request.origin,
            budget: { ms: request.catchBudgetMs, get remainingMs() { return clock.remainingMs; } },
            to() { return Promise.reject(new Error('next.to is not available in a .catch handler')); },
            error: failure,
            called: state.called,
        });
        const api = request.api(hook, clock);
        clock.start();
        try {
            const handler = hook.catchHandler;
            const running = Promise.resolve()
                .then(() => handler(api, input, next));
            running.catch(() => { });
            const result = await Promise.race([running, clock.expired]);
            if (typeof result === 'object')
                return result;
        }
        catch (error) {
            request.report(`${hook.mod.name}: ${request.event} .catch handler skipped: ${failureOf(error).line}`);
        }
        finally {
            handlerAbandoned = true;
            clock.stop();
        }
        return undefined;
    }
    return runFrom(0, request.input);
}
//# sourceMappingURL=chain.js.map