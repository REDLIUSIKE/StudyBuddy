/**
 * Client roster: the ordered package-name rows a whole-client test boots, and
 * the plan that annotates one with the rows the test provides itself. `webApp`
 * and `bundleRoster` (`./bundle-roster.ts`) read rosters from the bundle patch
 * files; a spec may also build one inline with {@link ClientRoster.of}.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/roster
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebBootGraph } from '@deepseek-ai/dsh-client-modules/client';
/** One browser plugin row as `dsh.client` declares it, keyed by package name. */
export interface ClientRosterRow {
    /** Package name (== manifest entry id == Loader entry name). */
    readonly name: string;
    /** Package-name dependency edges from `dsh.client.inject` ([] when absent). */
    readonly inject: readonly string[];
    /** Stage-one prefetch mark from `dsh.client.immediately` (false when absent). */
    readonly immediately: boolean;
}
/**
 * Synthesize the raw `WebBootGraph` for `rows`: one `application` batch
 * holding every row, `rev: 'local'`, placeholder `plugins/<name>/client.js`
 * references, since every module is seeded in process and never fetched.
 * Validation stays with the production `parseBootManifest` inside the module
 * system: duplicate names and an empty roster are rejected there, not here.
 * @param rows - roster rows in composition order.
 * @returns the unparsed graph, as `createClientModuleSystem` consumes it.
 */
export declare function graphFromRoster(rows: readonly ClientRosterRow[]): WebBootGraph;
/** Immutable, name-addressable roster. */
export declare class ClientRoster {
    readonly rows: readonly ClientRosterRow[];
    /**
     * Build a roster from rows; duplicate names throw.
     * @param rows - roster rows in composition order.
     * @returns roster.
     */
    static of(rows: readonly ClientRosterRow[]): ClientRoster;
    private constructor();
    /**
     * Keep only `names`, preserving roster order; an unknown name throws with the roster listed.
     * @param names - package names to keep.
     * @returns sub-roster.
     */
    pick(names: readonly string[]): ClientRoster;
    /**
     * The named rows plus every row they inject, transitively, in roster order: the rows a spec needs to boot the
     * named plugins as the bundle composes them. The shell's platform modules (`PLATFORM_MODULES`, seeded statically
     * rather than loaded as rows) end the walk. An unknown name throws with the roster listed; a row injecting any
     * other package outside the roster throws, since the bundle itself would not boot.
     * @param names - package names whose dependency cone to keep.
     * @returns sub-roster.
     */
    closure(names: readonly string[]): ClientRoster;
    /**
     * Drop `names`; an unknown name throws with the roster listed.
     * @param names - package names to drop.
     * @returns sub-roster.
     */
    without(names: readonly string[]): ClientRoster;
    private known;
}
/** The module face the Loader materializes for one client plugin row. */
export interface ClientPluginModule {
    apply(ctx: Context, config?: unknown): unknown;
    readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
    readonly Config?: unknown;
}
/** What to boot and what the test supplies itself. */
export interface AssemblyPlan {
    readonly roster: ClientRoster;
    /** Row replacements by package name (the test's own implementation of that row). Names outside the roster throw. */
    readonly provide?: Readonly<Record<string, ClientPluginModule>>;
}
/**
 * Validate a plan against its roster.
 * @param plan - plan to check.
 * @throws {Error} naming any `provide` key outside the roster.
 */
export declare function assertPlan(plan: AssemblyPlan): void;
//# sourceMappingURL=roster.d.ts.map