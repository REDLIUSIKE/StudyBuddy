/** Row identities and raw values shared by the two virtual inspector tables. */
/**
 * Resolve a manual choice or the block lifecycle default.
 * @param row - Current row metadata.
 * @param choices - Table-local user choices.
 * @returns Whether the row's descendants are hidden.
 */
export function inspectorRowCollapsed(row, choices) {
    const choice = choices.get(row.key);
    return choice !== undefined && choice.state === row.disclosure ? choice.collapsed : row.disclosure === 'closed';
}
/** Table-local hierarchy index for disclosure and virtualized sticky ancestors. */
export class InspectorTableHierarchy {
    /** Depth-first row order with folded descendants omitted. */
    rows;
    byKey = new Map();
    branches = new Set();
    /**
     * @param rows - Complete depth-first row order.
     * @param choices - Table-local disclosure overrides.
     */
    constructor(rows, choices) {
        const visible = [];
        let hiddenDepth;
        for (const row of rows) {
            if (row.parent !== undefined)
                this.branches.add(row.parent);
            if (row.disclosure !== undefined)
                this.branches.add(row.key);
            if (hiddenDepth !== undefined && row.depth > hiddenDepth)
                continue;
            hiddenDepth = inspectorRowCollapsed(row, choices) ? row.depth : undefined;
            this.byKey.set(row.key, visible.length);
            visible.push(row);
        }
        this.rows = visible;
    }
    /**
     * Identify rows that own descendants or an explicit disclosure state.
     * @param key - Row identity.
     * @returns Whether this row owns a disclosure.
     */
    isBranch(key) { return this.branches.has(key); }
    /**
     * Find the current row's visible parent headers, including itself when it is a header.
     * @param index - First row at the viewport's scroll offset.
     * @returns Ordered indexes retained above the virtual viewport.
     */
    stickyIndexes(index) {
        const indexes = [];
        let row = this.rows[index];
        if (row !== undefined && this.isBranch(row.key))
            indexes.push(index);
        while (row?.parent !== undefined) {
            const parent = this.byKey.get(row.parent);
            if (parent === undefined)
                break;
            indexes.push(parent);
            row = this.rows[parent];
        }
        return indexes.reverse();
    }
}
/** Converts a keyed source without changing snapshot identity on unchanged input. */
export class InspectorRecordSource {
    source;
    project;
    previous;
    snapshot;
    /**
     * @param source - Existing keyed business source.
     * @param project - Raw metadata projection, evaluated only after its input changes.
     */
    constructor(source, project) {
        this.source = source;
        this.project = project;
    }
    /** @returns Stable metadata for the current raw value. */
    getSnapshot = () => {
        const value = this.source.getSnapshot();
        if (value !== this.previous) {
            this.previous = value;
            this.snapshot = value === undefined ? undefined : this.project(value);
        }
        return this.snapshot;
    };
    /** @param listener - Row invalidation callback. @returns Its disposer. */
    subscribe = (listener) => this.source.subscribe(listener);
}
//# sourceMappingURL=table-model.js.map