/** Truthiness assertions for Worker modules importing `node:assert/strict`. */
/**
 * Require a truthy value; falsy values throw `ERR_ASSERTION` or the supplied Error.
 * @param value - Value to test.
 * @param message - Failure message or Error to throw unchanged; omitted messages use generic text.
 * @returns Nothing; successful completion narrows the value to a truthy value.
 */
export declare function ok(value: unknown, message?: string | Error): asserts value;
/** CommonJS interop marker for lowered ESM default imports. */
export declare const __esModule = true;
/** Callable truthiness assertion with the identical `ok` method; other assertion APIs are absent. */
declare const assert: typeof ok & {
    ok: typeof ok;
};
export default assert;
//# sourceMappingURL=strict.d.ts.map