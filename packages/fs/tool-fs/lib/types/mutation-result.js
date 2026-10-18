/** Shared observation and result fields for successful file mutations. */
/**
 * Record the new file version and expose the mutation result with its canonical path.
 * @param ctx - filesystem and observation event owner.
 * @param target - resolved file that was mutated.
 * @param outcome - successful provider result; its version stays in the observation event.
 * @param exec - calling tool execution.
 * @returns the provider's result fields without the version, plus the canonical absolute path.
 */
export function mutationResult(ctx, target, outcome, exec) {
    const { version, ...result } = outcome;
    ctx.emit('fs/observed', target, { kind: 'present', version }, exec);
    return { path: ctx.fs.processPath(target), ...result };
}
//# sourceMappingURL=mutation-result.js.map