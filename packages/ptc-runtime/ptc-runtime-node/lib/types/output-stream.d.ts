/** Bounded drainage for raw process output after managed execution ends. */
import type { Readable } from 'node:stream';
/**
 * Wait for queued bytes without letting an inherited descriptor retain a run forever.
 * @param stream - Caller-owned raw process output, when provided.
 * @param graceMs - Maximum wait after managed process termination.
 * @returns Whether the complete stream ended without a transport error.
 */
export declare function drainOutput(stream: Readable | undefined, graceMs: number): Promise<boolean>;
//# sourceMappingURL=output-stream.d.ts.map