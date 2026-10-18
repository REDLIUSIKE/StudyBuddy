/**
 * Endpoint-named mock for Typert Remote traffic: a table of unary answers and
 * stream scripts keyed by `<namespace>/<method>`, scripted-stream control, a
 * carrier log, and the Connection carrier face the `connection` plugin
 * accepts through explicit installation or a page transport. Values are whatever the test
 * registers; the only declaration is whether an endpoint is unary or a
 * stream. Browser-safe: no DOM, React, or Node imports, no runtime import
 * from another harness package.
 * @module @deepseek-ai/dsh-remote-mock
 */
export { RemoteMock, ok } from "./remote-mock.js";
export { frames, openStream, streamHandle, streamMethod } from "./streams.js";
export { MockClientStream } from "./streams.js";
//# sourceMappingURL=index.js.map