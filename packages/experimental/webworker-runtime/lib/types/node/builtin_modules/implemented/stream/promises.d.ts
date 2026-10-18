/** Promise-based stream completion and pipelines from the shared readable-stream implementation. */
import { promises } from '../stream.ts';
/** Shared stream completion promise, including abort and listener cleanup options. */
export declare const finished: typeof import("stream/promises").finished;
/** Shared stream pipeline promise, including backpressure and error propagation. */
export declare const pipeline: typeof import("stream/promises").pipeline;
/** CommonJS interop marker consumed by the worker module loader. */
export declare const __esModule = true;
/** CommonJS-compatible promise namespace. */
export default promises;
//# sourceMappingURL=promises.d.ts.map