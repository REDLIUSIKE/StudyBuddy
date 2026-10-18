/**
 * Reject native TLS instead of serving plaintext for an HTTPS configuration.
 * @returns Never; a browser worker cannot bind a TLS socket.
 */
export declare function createServer(): never;
/** CommonJS interop marker for the worker module loader. */
export declare const __esModule = true;
/** CommonJS exports for the worker's explicit TLS-listener refusal. */
declare const _default: {
    createServer: typeof createServer;
};
export default _default;
//# sourceMappingURL=https.d.ts.map