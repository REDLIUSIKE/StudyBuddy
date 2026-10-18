/**
 * Wait for queued bytes without letting an inherited descriptor retain a run forever.
 * @param stream - Caller-owned raw process output, when provided.
 * @param graceMs - Maximum wait after managed process termination.
 * @returns Whether the complete stream ended without a transport error.
 */
export function drainOutput(stream, graceMs) {
    if (stream === undefined || stream.readableEnded)
        return Promise.resolve(true);
    if (stream.destroyed)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        const finish = (complete) => {
            clearTimeout(timer);
            stream.off('end', onEnd);
            stream.off('close', onClose);
            stream.off('error', onError);
            resolve(complete);
        };
        const onEnd = () => { finish(true); };
        const onClose = () => { finish(false); };
        const onError = () => { finish(false); };
        const timer = setTimeout(() => { finish(false); }, graceMs);
        stream.once('end', onEnd);
        stream.once('close', onClose);
        stream.once('error', onError);
    });
}
//# sourceMappingURL=output-stream.js.map