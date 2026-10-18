/**
 * Event-name patterns and field matchers: which registered hooks an event
 * selects. Event names are Claude Code's; a hook on a name this bridge never
 * raises registers fine and never runs.
 * @module
 */
import type { HookMatcher } from './types.ts';
/** The events the engine raises on its own, as opposed to the `<namespace>.<method>` events a mods API call raises. */
export declare const ENGINE_EVENTS: ReadonlySet<string>;
/**
 * Every event name a mod may hook, in Claude Code's reference order: engine
 * events, then every mods API method as `<namespace>.<method>`. `on` refuses a
 * name outside this list with Claude Code's own wording, so a misspelling
 * fails at load rather than registering a hook that never runs.
 */
export declare const KNOWN_EVENTS: ReadonlySet<string>;
/**
 * Whether a name passed to `on` is an exact event name, `*`, or a `<namespace>.*` glob.
 * @param pattern - the name or glob.
 * @returns true when `on` accepts it.
 */
export declare function isEventPattern(pattern: string): boolean;
/**
 * Whether a registered pattern selects an event. `*` selects every event
 * except the telemetry ones, which a mod hooks by name or as `telemetry.*`.
 * @param pattern - the name or glob passed to `on`.
 * @param event - the event being raised.
 * @returns true when the pattern selects the event.
 */
export declare function eventMatches(pattern: string, event: string): boolean;
/**
 * Whether every matcher field accepts the event's top-level field of the same
 * name: a scalar by equality, an array by membership, a RegExp by test.
 * @param matcher - the matcher passed to `on`.
 * @param input - the event input as this hook would receive it.
 * @returns true when the hook should run.
 */
export declare function matcherMatches(matcher: HookMatcher, input: unknown): boolean;
/**
 * Render a matcher the way `claude plugin validate` prints it.
 * @param matcher - the matcher, or undefined for a hook without one.
 * @returns `{field=value,...}`, or an empty string.
 */
export declare function describeMatcher(matcher: HookMatcher | undefined): string;
//# sourceMappingURL=matcher.d.ts.map