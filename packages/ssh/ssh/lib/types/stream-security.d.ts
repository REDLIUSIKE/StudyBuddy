/** TLS-PSK authenticates forwarded streams even when a remote pathname is replaced. */
import { type TLSSocket } from 'node:tls';
import type { Socket } from 'node:net';
/** Certificate-free PSK authentication and AEAD records; no unauthenticated cipher fallback. */
export declare const SSH_STREAM_TLS_OPTIONS: {
    readonly ciphers: "PSK-AES256-GCM-SHA384";
    readonly minVersion: "TLSv1.2";
    readonly maxVersion: "TLSv1.2";
};
/**
 * Authenticate a forwarded socket with its private administrative-channel key.
 * @param socket - the connected OpenSSH forwarding socket.
 * @param capability - the per-stream 256-bit key encoded as hexadecimal.
 * @param timeoutMs - deadline for completing TLS authentication.
 * @param signal - cancellation of authentication and the resulting TLS stream.
 * @returns an authenticated paused stream; the key is never transmitted as data.
 */
export declare function authenticateStream(socket: Socket, capability: string, timeoutMs: number, signal?: AbortSignal): Promise<TLSSocket>;
//# sourceMappingURL=stream-security.d.ts.map