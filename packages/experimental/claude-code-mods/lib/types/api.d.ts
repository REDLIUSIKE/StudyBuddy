/**
 * The `$` a hook receives. Each method shapes its arguments into the mods API
 * event of the same name and hands it to the binding's `invoke`, which runs
 * the mods loaded before this one and then the engine's implementation. The
 * hook's running-time clock pauses while a call is awaited, except for
 * `$.clock.sleep`, which Claude Code counts as the hook's own time.
 * @module
 */
import type { BudgetClock, LoadedMod } from './chain.ts';
import type { ModsApi, ModTimer } from './types.ts';
/** Timers the engine owns on a mod's behalf, so disposal and reload can cancel them. */
export interface TimerHost {
    after(ms: number, fn: () => unknown): ModTimer;
    every(ms: number, fn: () => unknown): ModTimer;
}
/** What one `$` instance is bound to. */
export interface ApiBinding {
    readonly mod: LoadedMod;
    /** The running hook's clock, paused while mods API calls are awaited; absent outside a hook. */
    readonly clock: BudgetClock | undefined;
    /**
     * Raise one mods API call as its event and resolve to the value the chain
     * answered with; a `{ deny }` answer rejects with the reason.
     */
    readonly invoke: (op: string, input: unknown) => Promise<unknown>;
    readonly timers: TimerHost;
    /** Receives a rejected fire-and-forget call's reason. */
    readonly report: (line: string) => void;
}
/**
 * Build the `$` for one hook invocation.
 * @param binding - the mod, clock, and engine entry points this instance uses.
 * @returns the mods API.
 */
export declare function createModsApi(binding: ApiBinding): ModsApi;
//# sourceMappingURL=api.d.ts.map