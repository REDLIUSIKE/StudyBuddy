import { PLATFORM_MODULES } from '@deepseek-ai/dsh-client-web/src/platform.ts';
/** Revision stamped on every synthesized row and batch; nothing is fetched by it. */
const LOCAL_REV = 'local';
/**
 * Synthesize the raw `WebBootGraph` for `rows`: one `application` batch
 * holding every row, `rev: 'local'`, placeholder `plugins/<name>/client.js`
 * references, since every module is seeded in process and never fetched.
 * Validation stays with the production `parseBootManifest` inside the module
 * system: duplicate names and an empty roster are rejected there, not here.
 * @param rows - roster rows in composition order.
 * @returns the unparsed graph, as `createClientModuleSystem` consumes it.
 */
export function graphFromRoster(rows) {
    const entries = rows.map(row => ({
        id: row.name,
        url: `plugins/${row.name}/client.js`,
        rev: LOCAL_REV,
        ...(row.inject.length > 0 ? { inject: [...row.inject] } : {}),
        ...(row.immediately ? { immediately: true } : {}),
    }));
    return {
        rev: LOCAL_REV,
        entries,
        batches: [{
                phase: 'application',
                url: 'plugins/local.js',
                rev: LOCAL_REV,
                entries: entries.map(entry => entry.id),
            }],
    };
}
/** Module names the shell seeds before any row loads; an inject edge to one of them is satisfied without a row. */
const PLATFORM_SEED = new Set(PLATFORM_MODULES);
/** Immutable, name-addressable roster. */
export class ClientRoster {
    rows;
    /**
     * Build a roster from rows; duplicate names throw.
     * @param rows - roster rows in composition order.
     * @returns roster.
     */
    static of(rows) {
        const seen = new Set();
        const duplicates = new Set();
        for (const { name } of rows) {
            if (seen.has(name))
                duplicates.add(name);
            seen.add(name);
        }
        if (duplicates.size > 0) {
            throw new Error(`client-test-runtime: duplicate roster rows: ${[...duplicates].join(', ')}`);
        }
        return new ClientRoster(Object.freeze([...rows]));
    }
    constructor(rows) {
        this.rows = rows;
    }
    /**
     * Keep only `names`, preserving roster order; an unknown name throws with the roster listed.
     * @param names - package names to keep.
     * @returns sub-roster.
     */
    pick(names) {
        const keep = this.known(names, 'pick');
        return new ClientRoster(Object.freeze(this.rows.filter(row => keep.has(row.name))));
    }
    /**
     * The named rows plus every row they inject, transitively, in roster order: the rows a spec needs to boot the
     * named plugins as the bundle composes them. The shell's platform modules (`PLATFORM_MODULES`, seeded statically
     * rather than loaded as rows) end the walk. An unknown name throws with the roster listed; a row injecting any
     * other package outside the roster throws, since the bundle itself would not boot.
     * @param names - package names whose dependency cone to keep.
     * @returns sub-roster.
     */
    closure(names) {
        this.known(names, 'closure');
        const byName = new Map(this.rows.map(row => [row.name, row]));
        const keep = new Set();
        const visit = (name, from) => {
            if (keep.has(name) || PLATFORM_SEED.has(name))
                return;
            const row = byName.get(name);
            if (row === undefined) {
                throw new Error(`client-test-runtime: ${String(from)} injects ${name}, which is outside the roster`);
            }
            keep.add(name);
            for (const dependency of row.inject)
                visit(dependency, name);
        };
        for (const name of names)
            visit(name, undefined);
        return new ClientRoster(Object.freeze(this.rows.filter(row => keep.has(row.name))));
    }
    /**
     * Drop `names`; an unknown name throws with the roster listed.
     * @param names - package names to drop.
     * @returns sub-roster.
     */
    without(names) {
        const drop = this.known(names, 'without');
        return new ClientRoster(Object.freeze(this.rows.filter(row => !drop.has(row.name))));
    }
    known(names, operation) {
        const rostered = this.rows.map(row => row.name);
        const unknown = names.filter(name => !rostered.includes(name));
        if (unknown.length > 0) {
            throw new Error(`client-test-runtime: ${operation}() names outside the roster: ${unknown.join(', ')}; roster: ${rostered.join(', ')}`);
        }
        return new Set(names);
    }
}
/**
 * Validate a plan against its roster.
 * @param plan - plan to check.
 * @throws {Error} naming any `provide` key outside the roster.
 */
export function assertPlan(plan) {
    const rostered = plan.roster.rows.map(row => row.name);
    const unknown = Object.keys(plan.provide ?? {}).filter(name => !rostered.includes(name));
    if (unknown.length > 0) {
        throw new Error(`client-test-runtime: provide names rows outside the roster: ${unknown.join(', ')}; roster: ${rostered.join(', ')}`);
    }
}
//# sourceMappingURL=roster.js.map