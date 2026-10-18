/** JSON inspection of live objects, including cyclic Location stores. */
class InspectorJsonWriter {
    ancestors = [];
    containers = new WeakMap();
    write(value) {
        const replace = this.replace.bind(this);
        const result = JSON.stringify(value, function (_key, item) {
            return replace(this, item);
        }, 2);
        return typeof result === 'string' ? result : '';
    }
    replace(parent, value) {
        if (typeof value === 'bigint')
            return `${value}n`;
        if (value === null || typeof value !== 'object')
            return value;
        while (this.ancestors.length > 0 && this.ancestors.at(-1) !== parent)
            this.ancestors.pop();
        let rendered = value;
        if (value instanceof Map || value instanceof Set) {
            const container = this.containers.get(value)
                ?? (value instanceof Map ? Object.fromEntries(value) : [...value]);
            this.containers.set(value, container);
            rendered = container;
        }
        // Only ancestors are circular; sibling references retain their complete values.
        if (this.ancestors.includes(rendered))
            return '[Circular]';
        this.ancestors.push(rendered);
        return rendered;
    }
}
/**
 * Serialize raw details without allowing a formatting failure to retire the View.
 * @param value - Original record; Maps/Sets become objects/arrays and bigint becomes an n-suffixed string.
 * @returns JSON with circular references marked, or an error message for the detail panel.
 */
export function inspectorJson(value) {
    try {
        return { text: new InspectorJsonWriter().write(value), failed: false };
    }
    catch (error) {
        return { text: error instanceof Error ? error.message : String(error), failed: true };
    }
}
//# sourceMappingURL=raw-json.js.map