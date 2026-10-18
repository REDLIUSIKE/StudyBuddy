import type { Readable, Writable } from 'node:stream';
/** The private helper's authenticated transport and process lifetime. */
export interface HelperTransport {
    /** Authenticated request bytes from OpenSSH. */
    input: Readable;
    /** Responses carried only by OpenSSH exec stdout. */
    output: Writable;
    /** Installed entry whose digest is compared by the client. */
    entryPath: string;
    /** Whether the installed entry includes its own Node and worker runtime. */
    kind: 'node-script' | 'executable';
    /** Process termination joins the same cleanup as transport loss. */
    signal: AbortSignal;
}
/**
 * Run a helper until its channel closes or its client lease expires.
 * @param transport - private process streams, entry identity, and cancellation.
 */
export declare function runSshHelper(transport: HelperTransport): Promise<void>;
//# sourceMappingURL=helper.d.ts.map