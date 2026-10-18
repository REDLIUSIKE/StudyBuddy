/**
 * The mods engine: loaded mods and their hooks, engine-raised events, mods
 * API calls raised as events, per-session `$.state`, and the timers mods
 * start. It knows nothing of Cordis; the plugin supplies the engine behavior
 * for each mods API call and the test kit supplies stubs.
 * @module
 */
import type { BudgetClock, LoadedMod, RegisteredHook } from './chain.ts';
import { HookRegistry } from './module.ts';
import type { ModDefinition, ModsApi } from './types.ts';
/** The engine behavior for one mods API call. */
export type OpCore<B> = (input: unknown, context: OpContext<B>) => unknown;
/** Engine behaviors by event name, `<namespace>.<method>`. */
export type OpTable<B> = Readonly<Record<string, OpCore<B>>>;
/** Looks up the engine behavior for one mods API call; `undefined` means none is served. */
export type OpResolver<B> = (op: string) => OpCore<B> | undefined;
/**
 * Thrown by an engine behavior to answer a mods API call with `{ deny }`, so
 * the calling mod's `$` call rejects with the reason.
 */
export declare class OpDenied extends Error {
    readonly reason: string;
    constructor(reason: string);
}
/** What an op core and a `$` instance know about the raising hook's surroundings. */
export interface OpContext<B> {
    readonly mod: LoadedMod;
    /** The engine-specific binding of the event that is running: the plugin's agent, or the test kit's fixture. */
    readonly binding: B;
    readonly signal: AbortSignal;
    readonly engine: ModsEngine<B>;
}
/** Engine construction options. */
export interface ModsEngineOptions<B> {
    /**
     * Engine behaviors for mods API calls. The engine answers `state.*`,
     * `clock.now`, and `clock.sleep` itself when the resolver serves none.
     */
    readonly ops: OpResolver<B>;
    /**
     * The key `$.state` values and a mod's timers live under: Claude Code's "for
     * the whole session". The empty string is the sessionless scope.
     */
    readonly stateKey: (binding: B) => string;
    /** A hook's own running-time limit in milliseconds. */
    readonly budgetMs: number;
    /** A `.catch` handler's running-time limit in milliseconds. */
    readonly catchBudgetMs: number;
    /** Receives diagnostics: skipped hooks, failed fire-and-forget calls, timer callback errors. */
    readonly report: (line: string) => void;
    /** Observes `$.state` reads, by session key and `<plugin>\u0000<key>` slot, so a drawing can subscribe to what it read. */
    readonly onStateRead?: (key: string, slot: string) => void;
    /** Observes `$.state` writes, by session key and slot. */
    readonly onStateWritten?: (key: string, slot: string) => void;
}
/** Options for raising one engine event. */
export interface RaiseOptions<B, E = unknown> {
    readonly binding: B;
    readonly signal?: AbortSignal;
    /** Checks the input a hook passes to `next`; a throw skips that hook and continues with the input it received. */
    readonly validateNext?: (e: E, hook: RegisteredHook) => void;
}
/**
 * Loaded mods, their hooks, and the two ways events reach them: the engine
 * raises one through every selected hook, and a mod's `$` call raises one
 * through the mods loaded before it.
 */
export declare class ModsEngine<B> {
    private readonly options;
    /** The loaded mods and their registrations. */
    readonly registry: HookRegistry;
    private readonly state;
    /** Timer sets by `<session key>\u0000<plugin>`: a mod's timers belong to the session whose event started them. */
    private readonly timers;
    private nextOrder;
    constructor(options: ModsEngineOptions<B>);
    /**
     * Run one mod's `register` and add its hooks beneath every mod added before it.
     * @param definition - the mod as its plugin defined it.
     * @returns the loaded mod.
     * @throws Error when the name is taken or invalid, or when `register` throws.
     */
    add(definition: ModDefinition): Promise<LoadedMod>;
    /**
     * Raise one engine event through its hooks, outermost first.
     * @param event - the event name.
     * @param input - the event input; frozen before a hook sees it.
     * @param core - the engine behavior beneath every hook.
     * @param options - the binding events of this agent share, and its cancellation.
     * @returns the result as the outermost hook returned it.
     */
    raise<E, R>(event: string, input: E, core: (e: E) => Promise<R> | R, options: RaiseOptions<B, E>): Promise<R>;
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
    raiseWith<E, R>(event: string, hooks: readonly RegisteredHook[], raisedBy: LoadedMod | undefined, input: E, core: (e: E) => Promise<R> | R, options: RaiseOptions<B, E>): Promise<R>;
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
    invoke(mod: LoadedMod, op: string, input: unknown, binding: B, signal: AbortSignal): Promise<unknown>;
    /**
     * Build the `$` for one mod inside one event.
     * @param mod - the mod the instance belongs to.
     * @param clock - the running hook's clock, or undefined outside a hook.
     * @param binding - the event's binding.
     * @param signal - the event's cancellation.
     * @returns the mods API.
     */
    api(mod: LoadedMod, clock: BudgetClock | undefined, binding: B, signal: AbortSignal): ModsApi;
    /**
     * Forget one session's `$.state` values and close the timers its events started.
     * @param key - the session key the values and timers were kept under.
     * @returns settles once the session's timer callbacks have finished.
     */
    forgetSession(key: string): Promise<void>;
    /**
     * The `claude plugin validate` style `hooks:` line for one mod.
     * @param mod - the loaded mod.
     * @returns its events with matchers, comma-separated.
     */
    describe(mod: LoadedMod): string;
    /**
     * Drop one mod: its hooks stop receiving events, its timers are cancelled,
     * and its running timer callbacks are awaited.
     * @param name - the plugin name.
     * @returns settles once the mod's timer callbacks have finished.
     */
    unload(name: string): Promise<void>;
    /**
     * Drop every registration and close every mod's timers.
     * @returns settles once every timer callback has finished.
     */
    dispose(): Promise<void>;
    private timersOf;
    private opCore;
}
export type { RegisteredHook };
//# sourceMappingURL=engine.d.ts.map