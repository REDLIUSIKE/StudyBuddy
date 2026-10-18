/** Millisecond settings read from the Desktop process environment. */
/**
 * Read a duration that `setTimeout` accepts without clamping.
 * @param env - Desktop process environment.
 * @param name - Variable to read; the validation error names it.
 * @param fallback - Value used when the variable is unset.
 * @returns Integer milliseconds from 1000 through 2147483647.
 */
export declare function resolveDurationMs(env: NodeJS.ProcessEnv, name: string, fallback: number): number;
//# sourceMappingURL=duration-env.d.ts.map