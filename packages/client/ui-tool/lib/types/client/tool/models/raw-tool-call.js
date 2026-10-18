const parsedCalls = new WeakMap();
/**
 * Parse the call head paired with one immutable Tool block.
 * @param block - preparing, dispatched, or settled Tool block.
 * @returns the Tool name and object arguments, or null during preparation or when valid arguments are unavailable.
 */
export function parsedToolCall(block) {
    if (!('kind' in block) && block.phase === 'preparing')
        return null;
    const cached = parsedCalls.get(block);
    if (cached !== undefined || parsedCalls.has(block))
        return cached ?? null;
    const call = 'kind' in block ? block.call : block;
    if (call === null) {
        parsedCalls.set(block, null);
        return null;
    }
    let value;
    try {
        value = JSON.parse(call.argsRaw);
    }
    catch {
        parsedCalls.set(block, null);
        return null;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        parsedCalls.set(block, null);
        return null;
    }
    const parsed = { name: call.name, args: value };
    parsedCalls.set(block, parsed);
    return parsed;
}
/**
 * Read the exact single text block consumed by first-party card derivations.
 * @param block - settled Tool result.
 * @returns its text, or undefined for any other content layout.
 */
export function singleResultText(block) {
    if (block.content.length !== 1)
        return undefined;
    const only = block.content[0];
    return only?.type === 'text' ? only.text : undefined;
}
//# sourceMappingURL=raw-tool-call.js.map