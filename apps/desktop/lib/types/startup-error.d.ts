/** Serializable Desktop failure diagnostics. */
/**
 * Preserve nested diagnostics when sending failures to a renderer.
 * @param error - Startup or runtime failure.
 * @returns Serializable error state.
 */
export declare function desktopErrorState(error: unknown): {
    phase: 'error';
    message: string;
};
//# sourceMappingURL=startup-error.d.ts.map