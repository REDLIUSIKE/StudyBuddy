/**
 * Mod registration: run a mod's `register(on, options)` and keep every
 * `on(...)` registration in one ordered registry that dispatch selects from.
 * @module
 */
import type { LoadedMod, RegisteredHook } from './chain.ts';
import type { ModDefinition, ModOn } from './types.ts';
/** Mods ordered by load; hooks ordered by mod, then by registration. */
export declare class HookRegistry {
    private readonly hooks;
    private readonly mods;
    /**
     * The loaded mods.
     * @returns the mods in load order.
     */
    list(): readonly LoadedMod[];
    /**
     * Add one mod and its registrations; a mod of the same name must be removed first.
     * @param mod - the mod the hooks belong to.
     * @param hooks - its registrations in `on` order.
     */
    add(mod: LoadedMod, hooks: readonly RegisteredHook[]): void;
    /**
     * Drop one mod and its hooks.
     * @param name - the plugin name.
     */
    remove(name: string): void;
    /**
     * Hooks whose pattern selects `event`, outermost first. A mods API call a mod
     * raised is seen only by the mods loaded before it.
     * @param event - the event name.
     * @param raisedBy - the mod whose `$` call became the event, or undefined for the engine.
     * @returns the ordered hooks; matchers are evaluated at run time.
     */
    select(event: string, raisedBy?: LoadedMod): RegisteredHook[];
    /**
     * The engine events one mod hooks by exact name that the host never raises.
     * @param mod - the loaded mod.
     * @param served - the engine events the host raises.
     * @returns the unserved event names in registration order, each once.
     */
    unserved(mod: LoadedMod, served: ReadonlySet<string>): string[];
    /**
     * Event names with matchers, as `claude plugin validate` prints the `hooks:` line.
     * @param mod - the loaded mod.
     * @returns its events with matchers, comma-separated.
     */
    describe(mod: LoadedMod): string;
}
/**
 * Build the `on` function one `register` call receives and collect its
 * registrations. Validation follows Claude Code: the event name must be a
 * known name or glob, and one event may be registered without a matcher only
 * once.
 * @param mod - the mod registering.
 * @returns `on` and the list it appends to.
 */
export declare function createOn(mod: LoadedMod): {
    on: ModOn;
    hooks: RegisteredHook[];
};
/**
 * Run one mod's `register` and collect its hooks. A `register` that throws
 * fails the mod with Claude Code's wording; the caller decides whether the
 * session continues without it.
 * @param definition - the mod as its plugin defined it.
 * @param order - the mod's position in the chain; earlier mods run outside later ones.
 * @returns the loaded mod and its registrations.
 */
export declare function registerMod(definition: ModDefinition, order: number): Promise<{
    mod: LoadedMod;
    hooks: RegisteredHook[];
}>;
//# sourceMappingURL=module.d.ts.map