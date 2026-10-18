/** Confirmed type filtering preserves the ancestors needed to inspect matching nested rows. */
/** Case-insensitive containment filter; optional surrounding stars have the same meaning as omission. */
export class InspectorTypeFilter {
    /** Trimmed type fragment without optional surrounding stars; preserves the entered case. */
    query;
    needle;
    /** @param query - Type fragment; empty text or only stars clears filtering. */
    constructor(query) {
        this.query = query.trim().replace(/^\*+|\*+$/g, '').trim();
        this.needle = this.query.toLowerCase();
    }
    /**
     * Distinguish a type restriction from an empty or all-stars query.
     * @returns Whether this filter restricts the table.
     */
    get active() { return this.needle !== ''; }
    /**
     * Match a type by case-insensitive containment, accepting all types when filtering is inactive.
     * @param type - Current raw type, absent while its record is unavailable.
     * @returns Whether the record matches the filter.
     */
    matches(type) {
        return !this.active || (type !== undefined && type.toLowerCase().includes(this.needle));
    }
    /**
     * Retain matching rows and their ancestors; matching descendants start visible even under closed blocks.
     * @param rows - Complete loaded hierarchy, before user disclosure choices.
     * @param typeOf - Current type reader, independent of React row subscriptions.
     * @returns Matching rows and contextual ancestors in their original order.
     */
    apply(rows, typeOf) {
        if (!this.active)
            return { rows, matches: new Set(rows.map(row => row.key)) };
        const matches = new Set(rows.filter(row => this.matches(typeOf(row.key))).map(row => row.key));
        const byKey = new Map(rows.map(row => [row.key, row]));
        const retained = new Set(matches);
        for (const key of matches) {
            let parent = byKey.get(key)?.parent;
            while (parent !== undefined && !retained.has(parent)) {
                retained.add(parent);
                parent = byKey.get(parent)?.parent;
            }
        }
        const branches = new Set();
        for (const key of retained) {
            const parent = byKey.get(key)?.parent;
            if (parent !== undefined)
                branches.add(parent);
        }
        return { matches, rows: rows.filter(row => retained.has(row.key)).map((row) => {
                const { disclosure: _disclosure, ...plain } = row;
                return branches.has(row.key) ? { ...plain, disclosure: 'open' } : plain;
            }) };
    }
    /**
     * Resolve candidates asynchronously from all loaded rows, not the already filtered subset.
     * @param rows - Complete loaded row list.
     * @param typeOf - Current raw type reader.
     * @returns Distinct matching types in deterministic order.
     */
    async suggest(rows, typeOf) {
        await Promise.resolve();
        const types = new Set();
        for (const row of rows) {
            const type = typeOf(row.key);
            if (type !== undefined && this.matches(type))
                types.add(type);
        }
        return [...types].sort();
    }
}
//# sourceMappingURL=type-filter.js.map