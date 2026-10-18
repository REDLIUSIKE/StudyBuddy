/** Minimal managed-range ownership bound to one ordinary subprocess handle. */
/**
 * Apply an optional abort bound to one shared wait promise.
 * @param pending - managed-range wait shared by all callers.
 * @param signal - optional caller cancellation signal.
 * @returns whether the managed-range wait completed before cancellation.
 */
export async function waitWithAbort(pending, signal) {
    if (signal?.aborted) {
        void pending.catch(() => { });
        return false;
    }
    if (signal === undefined) {
        await pending;
        return true;
    }
    const aborted = Promise.withResolvers();
    const onAbort = () => { aborted.resolve(false); };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        return await Promise.race([pending.then(() => true), aborted.promise]);
    }
    finally {
        signal.removeEventListener('abort', onAbort);
    }
}
//# sourceMappingURL=managed-owner.js.map