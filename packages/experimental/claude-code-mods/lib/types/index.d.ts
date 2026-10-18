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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { LoadedMod } from './chain.ts';
import type { ModDefinition, SurfaceSnapshot } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        claudeCodeMods: ClaudeCodeMods;
    }
}
export type * from './types.ts';
export type { BoxProps, ButtonProps, TextProps, UiElement, UiElements, UiNode } from './elements.ts';
export { defineMod, type ModConfig, type ModPlugin, type ModSpec } from './define-mod.ts';
export { DEFAULT_TOOL_ALIASES } from './tool-names.ts';
export { KNOWN_EVENTS } from './matcher.ts';
export { MODS_API_VERSION } from './host-ops.ts';
/** Plugin config: the limits mod hooks run under. */
export interface Config {
    /** A hook's own running-time limit in milliseconds (Claude Code: 10 seconds). */
    hookTimeoutMs?: number;
    /** A `.catch` handler's running-time limit in milliseconds (Claude Code: 1 second). */
    catchTimeoutMs?: number;
    /** Default `$.process.run` and `$.http.fetch` timeout in milliseconds (Claude Code: 30 seconds). */
    processTimeoutMs?: number;
    /** Claude Code tool name → harness tool name entries added to the built-in alias table. */
    toolAliases?: Record<string, string>;
    /** Columns the band above the prompt reports to `ui.render` as `bodyColumns` and `viewport.columns`. */
    bandColumns?: number;
    /** Rows the band reports as `maxRows`. */
    bandRows?: number;
}
/** Engine events this host raises; a hook on any other known event registers and is reported as unserved. */
export declare const SERVED_EVENTS: ReadonlySet<string>;
/**
 * The bridge service: loaded mods, their hooks, and the harness listeners
 * that raise their events. Mods join through {@link ClaudeCodeMods.add},
 * which {@link defineMod} calls when a mod plugin mounts. The Remote methods
 * let a Client draw each session's band above the prompt and press its buttons.
 */
export declare class ClaudeCodeMods extends TypertRemoteService {
    static Config: z<Config>;
    static inject: string[];
    private readonly engine;
    private readonly registrations;
    private readonly surfaces;
    constructor(ctx: Context, config: Config);
    /**
     * Watch the band above the prompt of one session: the current drawing, then
     * every redraw, until the Client stops watching.
     * @param agent - the session's agent, resolved by the Gateway.
     * @param signal - carrier cancellation.
     * @returns the band's snapshots.
     */
    watchBand(agent: Agent, signal: AbortSignal): AsyncIterable<SurfaceSnapshot>;
    /**
     * Press a button of the band's current drawing: runs the mod's `onPress` and redraws.
     * @param agent - the session's agent, resolved by the Gateway.
     * @param generation - the drawing the Client saw.
     * @param actionId - the button's action id in that drawing.
     * @returns the snapshot after the press.
     */
    pressBand(agent: Agent, generation: number, actionId: string): Promise<SurfaceSnapshot>;
    /**
     * Load one mod beneath every mod loaded before it: run its `register`,
     * keep its hooks, and report which of its events this host never raises.
     * @param definition - the mod as its plugin defined it.
     * @returns the disposer that removes the mod's hooks, closes its timers, and releases its registrations.
     * @throws Error when the name is invalid or taken, or when `register` throws (Claude Code's `hooks module did not load` wording).
     */
    add(definition: ModDefinition): Promise<() => Promise<void>>;
    /** The loaded mods in chain order. */
    get mods(): readonly LoadedMod[];
}
export default ClaudeCodeMods;
//# sourceMappingURL=index.d.ts.map