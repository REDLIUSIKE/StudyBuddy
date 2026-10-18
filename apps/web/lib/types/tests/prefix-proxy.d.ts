/** Options for {@link startPrefixProxy}. */
export interface PrefixProxyOptions {
    /** Browser-facing mount; must start with `/` and end with `/`. */
    prefix: string;
}
/** One running prefix proxy; its owner disposes it with {@link PrefixProxy.close}. */
export interface PrefixProxy {
    /** Loopback port assigned by the operating system. */
    readonly port: number;
    /** Point the proxy at the backend listener; requests before this answer `502`. */
    setTarget(port: number): void;
    /** Stop accepting, destroy live sockets, and resolve once every listener and socket closed. */
    close(): Promise<void>;
}
/**
 * Start the proxy on an operating-system-assigned loopback port.
 * @param options - browser-facing mount prefix.
 * @returns the running proxy; the caller owns registration and disposal.
 */
export declare function startPrefixProxy(options: PrefixProxyOptions): Promise<PrefixProxy>;
//# sourceMappingURL=prefix-proxy.d.ts.map