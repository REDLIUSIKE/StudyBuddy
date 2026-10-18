/**
 * Single-process worker replacement for `@deepseek-ai/node-addon-system/flock`.
 * The JSONL backend's in-process write claim already excludes every writer,
 * so its kernel-lock request succeeds without acquiring another resource.
 */
/**
 * Grant the single-process worker's exclusive-lock request immediately.
 * @param _fd - file descriptor (unused).
 * @returns an already-fulfilled promise.
 */
export declare function tryLockExclusive(_fd: number): Promise<void>;
/** CommonJS interop marker for the worker module loader. */
export declare const __esModule = true;
/** The native flock API used by the JSONL backend. */
declare const _default: {
    tryLockExclusive: typeof tryLockExclusive;
};
export default _default;
//# sourceMappingURL=node-addon-system-flock.d.ts.map