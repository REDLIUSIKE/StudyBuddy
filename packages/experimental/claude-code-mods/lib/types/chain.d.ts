/**
 * The middleware chain: runs the hooks selected for one event in order, each
 * hook's `next` reaching the hooks beneath and then the engine behavior, under
 * Claude Code's failure rules (skip a hook that throws, times out, or returns
 * no result; keep the result from beneath when it had already called `next`;
 * give a `.catch` handler the chance to answer in its place).
 * @module
 */
import type { AnyHook, HookOrigin, HookMatcher, ModsApi, PluginOptions } from './types.ts';
/** One loaded mod: its plugin identity and the `register` options it received. */
export interface LoadedMod {
    readonly name: string;
    readonly version: string | undefined;
    /** Absolute directory the mod ships in, as `$.plugin.root` reports it. */
    readonly root: string;
    readonly options: PluginOptions;
    /** Load order; hooks of an earlier mod run outside those of a later one. */
    readonly order: number;
}
/** One `on(...)` registration. */
export interface RegisteredHook {
    readonly mod: LoadedMod;
    readonly event: string;
    readonly matcher: HookMatcher | undefined;
    readonly hook: AnyHook;
    catchHandler: AnyHook | undefined;
    /** Failure kinds already reported for this hook; one line per kind until the mod reloads. */
    readonly reported: Set<string>;
}
/** The `next.error.kind === 'timeout'` failure. */
export declare class HookTimeoutError extends Error {
    constructor(budgetMs: number);
}
/**
 * Accounts a hook's own running time: the clock runs while the hook is busy
 * and pauses while it awaits `next` or a mods API call. The deadline promise
 * rejects once the busy time reaches the limit.
 */
export declare class BudgetClock {
    readonly ms: number;
    private readonly now;
    private spent;
    private busySince;
    private pauses;
    private stopped;
    private timer;
    private readonly deadline;
    /**
     * @param ms - the running-time limit in milliseconds.
     * @param now - monotonic clock in milliseconds.
     */
    constructor(ms: number, now?: () => number);
    /** Rejects with {@link HookTimeoutError} when the busy time reaches the limit. */
    get expired(): Promise<never>;
    /** Milliseconds left before the deadline fires. */
    get remainingMs(): number;
    /** Start counting; the hook is busy from now on. */
    start(): void;
    /** Stop counting while the hook awaits `next` or a mods API call. Nested pauses are counted. */
    pause(): void;
    /** Resume counting after the awaited call settled. */
    resume(): void;
    /** The hook settled: no deadline can fire from now on. */
    stop(): void;
    private arm;
    private disarm;
}
/** Everything one dispatch needs besides the hooks themselves. */
export interface DispatchRequest<E, R> {
    readonly event: string;
    readonly input: E;
    /** The engine behavior at the bottom of the chain; receives the input as the chain left it. */
    readonly core: (e: E) => Promise<R> | R;
    readonly origin: HookOrigin;
    /** Hooks whose event pattern selects this event, outermost first; matchers are evaluated per hook. */
    readonly hooks: readonly RegisteredHook[];
    /** Builds the `$` a hook receives; the clock pauses while its calls are awaited. */
    readonly api: (hook: RegisteredHook, clock: BudgetClock) => ModsApi;
    /** A hook's own running-time limit. */
    readonly budgetMs: number;
    /** A `.catch` handler's running-time limit. */
    readonly catchBudgetMs: number;
    readonly signal: AbortSignal;
    /** Receives one diagnostic line per skipped hook and failure kind. */
    readonly report: (line: string) => void;
    /**
     * Checks the input a hook passes to `next` before anything beneath runs; a
     * throw skips that hook as a failure of its own and the chain continues with
     * the input the hook received.
     */
    readonly validateNext?: (e: E, hook: RegisteredHook) => void;
}
/** Thrown by {@link DispatchRequest.validateNext}: the hook asked for a rewrite this host does not serve. */
export declare class RewriteRefusedError extends Error {
    constructor(message: string);
}
/** The engine's own origin. */
export declare const ENGINE_ORIGIN: HookOrigin;
/**
 * Run one event through its hooks and the engine behavior.
 * @param request - the event, its hooks, and the engine behavior beneath them.
 * @returns the event's result as the outermost hook returned it.
 */
export declare function dispatch<E, R>(request: DispatchRequest<E, R>): Promise<R>;
//# sourceMappingURL=chain.d.ts.map