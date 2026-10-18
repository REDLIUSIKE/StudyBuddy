/**
 * A test kit in the shape of `claude-code/testing`: load mods, register
 * stubs that answer in the engine's place beneath every mod, raise events
 * through the mods' hooks, and mount a surface to assert what a mod draws —
 * no session, agent, or harness service involved. This repository's test
 * setup wraps it as `claude-code/testing` for the example mods' own tests.
 * @module
 */
import type { LoadedMod, RegisteredHook } from './chain.ts';
import type { ModPlugin } from './define-mod.ts';
import type { TreePattern, UiElement, UiNode } from './elements.ts';
import type { CommandRunInput, CommandRunResult, ModDefinition, ModsApi, PromptSubmitInput, PromptSubmitResult, SessionEndInput, SessionEndResult, SessionStartInput, SessionStartResult, ToolCallInput, ToolCallResult, TurnCompleteInput, TurnCompleteResult, TurnStartInput, TurnStartResult, UiRenderInput } from './types.ts';
/**
 * A stub answering one event in the engine's place. For an engine event it
 * returns that event's result; for a mods API call it returns `{ value }` or
 * `{ deny }`, and `undefined` from either reads as "not answered".
 */
export type StubHook = ($: ModsApi, e: never) => unknown;
/** Test kit construction options. */
export interface ModTestKitOptions {
    /** Mods to load, in chain order: definitions or the plugins `defineMod` made. */
    readonly mods?: readonly (ModDefinition | ModPlugin)[];
    /** `register` option values by plugin name, overlaid on each mod's own options. */
    readonly options?: Readonly<Record<string, ModDefinition['options']>>;
    /** A hook's own running-time limit in milliseconds; defaults to 5 seconds, Claude Code's test limit. */
    readonly budgetMs?: number;
}
/** What `$.ui.mount` takes: the surface to draw and the props the host would pass. */
export interface MountArgs {
    /** The plugin under test; accepted for source compatibility, every loaded mod's `ui.render` hooks run in chain order. */
    readonly plugin?: string;
    /** The drawing surface's name (`terminal`, `desktop`); accepted for source compatibility. */
    readonly surface?: string;
    readonly component: UiRenderInput['component'];
    /** The pane id a `Pane` was opened with; the band has none. */
    readonly requestId?: string;
    readonly props?: Readonly<Record<string, unknown>>;
}
/** A found element with the actions a test takes on it. */
export interface MountedElement {
    readonly element: UiElement;
    /** The element's type. */
    readonly type: UiElement['type'];
    /** The text the element draws, descendants included. */
    readonly text: string;
    /** Run a Button's `onPress` and redraw. */
    press(): Promise<void>;
}
/** A mounted surface: every read renders afresh through the mods' `ui.render` hooks. */
export interface MountedSurface {
    /** The current tree, as the hooks returned it. */
    tree(): Promise<UiNode>;
    /** The drawn text, one line per top-level node. */
    text(): Promise<string>;
    /** The first element matching the pattern, or undefined. */
    find(pattern: TreePattern): Promise<MountedElement | undefined>;
    /** Every element matching the pattern, in drawing order. */
    findAll(pattern: TreePattern): Promise<MountedElement[]>;
    unmount(): Promise<void>;
}
/** The engine's own `$`-shaped raisers: each sends its event through the mods and resolves to the result. */
export interface TestKitRaisers {
    readonly tool: {
        call(input: Omit<ToolCallInput, 'tool_use_id'> & {
            tool_use_id?: string;
        }): Promise<ToolCallResult>;
    };
    readonly command: {
        run(input: Pick<CommandRunInput, 'command' | 'args'>): Promise<CommandRunResult>;
    };
    readonly prompt: {
        submit(input: Pick<PromptSubmitInput, 'text'> & Partial<PromptSubmitInput>): Promise<PromptSubmitResult>;
    };
    readonly session: {
        start(input?: Partial<SessionStartInput>): Promise<SessionStartResult>;
        end(input?: Partial<SessionEndInput>): Promise<SessionEndResult>;
    };
    readonly turn: {
        start(input: Partial<TurnStartInput> & Pick<TurnStartInput, 'turnId'>): Promise<TurnStartResult>;
        complete(input?: Partial<TurnCompleteInput>): Promise<TurnCompleteResult>;
    };
    readonly ui: {
        /** Mount one surface: it renders through the mods' `ui.render` hooks on every read. */
        mount(args: MountArgs): Promise<MountedSurface>;
    };
}
/** The engine events the kit raises, with their inputs, so a typed stub reads `e` without a cast. */
export interface KitEventInputs {
    'session.start': SessionStartInput;
    'session.end': SessionEndInput;
    'turn.start': TurnStartInput;
    'turn.complete': TurnCompleteInput;
    'prompt.submit': PromptSubmitInput;
    'tool.call': ToolCallInput;
    'command.run': CommandRunInput;
    'ui.render': UiRenderInput;
}
/** The kit's `on`: registers a stub that answers one event beneath every mod; name a mods API call without the `$.`. */
export interface KitOn {
    /** A stub for one engine event, with the event's typed input. */
    <K extends keyof KitEventInputs>(event: K, stub: ($: ModsApi, e: KitEventInputs[K]) => unknown): void;
    /** A stub for any event or mods API call. */
    (event: string, stub: StubHook): void;
}
/** A loaded test kit. */
export interface ModTestKit {
    /** Register a stub that answers `event` beneath every mod; name a mods API call without the `$.`. */
    readonly on: KitOn;
    /** Raise any event through the mods; a stub, a built-in default, or `no implementation for <event>` answers at the bottom. */
    raise<R>(event: string, input: unknown): Promise<R>;
    /** Typed raisers for the events this bridge sends from the harness, plus `ui.mount`. */
    readonly $: TestKitRaisers;
    /** Diagnostic lines the engine reported: skipped hooks, failed fire-and-forget calls, timer errors. */
    readonly reports: string[];
    /** The loaded mods in chain order. */
    readonly mods: readonly LoadedMod[];
    /**
     * Drop every registration and close every mod timer.
     * @returns settles once running timer callbacks have finished.
     */
    dispose(): Promise<void>;
}
/** Stubs that answer a whole namespace from memory. */
export declare const mock: Readonly<{
    /**
     * Answer `$.store` from an in-memory map.
     * @param on - the kit's `on`.
     * @param initial - entries the store starts with.
     * @returns the live map, to read what the mod saved.
     */
    store(on: ModTestKit["on"], initial?: Readonly<Record<string, unknown>>): Map<string, unknown>;
    /**
     * Answer `$.env.get` from fixed variables and record `$.env.set` writes.
     * @param on - the kit's `on`.
     * @param variables - the environment the mod sees.
     * @returns the live record, to read what the mod set.
     */
    env(on: ModTestKit["on"], variables?: Readonly<Record<string, string>>): Record<string, string | undefined>;
    /**
     * Answer `$.clock.now` from a settable instant and `$.clock.sleep` at once, advancing it.
     * @param on - the kit's `on`.
     * @param startAt - the first `now()`, in epoch milliseconds.
     * @returns the clock, to read or advance `now`.
     */
    clock(on: ModTestKit["on"], startAt?: number): {
        now: number;
        advance(ms: number): void;
    };
}>;
/**
 * Load mods for a test and return the kit.
 * @param options - the mods to load and the hook time limit.
 * @returns the kit, with every mod's `register` already run.
 */
export declare function createModTestKit(options?: ModTestKitOptions): Promise<ModTestKit>;
export type { RegisteredHook };
//# sourceMappingURL=testing.d.ts.map