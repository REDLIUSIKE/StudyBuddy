import { connect } from "node:tls";
//#region lib/types/stream-security.js
/** TLS-PSK authenticates forwarded streams even when a remote pathname is replaced. */
/** Certificate-free PSK authentication and AEAD records; no unauthenticated cipher fallback. */
const SSH_STREAM_TLS_OPTIONS = {
	ciphers: "PSK-AES256-GCM-SHA384",
	minVersion: "TLSv1.2",
	maxVersion: "TLSv1.2"
};
/**
* Authenticate a forwarded socket with its private administrative-channel key.
* @param socket - the connected OpenSSH forwarding socket.
* @param capability - the per-stream 256-bit key encoded as hexadecimal.
* @param timeoutMs - deadline for completing TLS authentication.
* @param signal - cancellation of authentication and the resulting TLS stream.
* @returns an authenticated paused stream; the key is never transmitted as data.
*/
async function authenticateStream(socket, capability, timeoutMs, signal) {
	if (signal?.aborted) {
		socket.destroy();
		signal.throwIfAborted();
	}
	const stream = connect({
		...SSH_STREAM_TLS_OPTIONS,
		socket,
		rejectUnauthorized: true,
		pskCallback: () => ({
			psk: Buffer.from(capability, "hex"),
			identity: "dsh-stream"
		}),
		checkServerIdentity: () => void 0
	});
	const abort = () => {
		stream.destroy(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)));
	};
	signal?.addEventListener("abort", abort, { once: true });
	stream.once("close", () => {
		signal?.removeEventListener("abort", abort);
	});
	try {
		await new Promise((resolve, reject) => {
			const cleanup = () => {
				stream.off("secureConnect", secured);
				stream.off("error", failed);
				stream.off("close", closed);
				clearTimeout(timer);
			};
			const secured = () => {
				cleanup();
				stream.disableRenegotiation();
				stream.pause();
				resolve();
			};
			const failed = (error) => {
				cleanup();
				reject(error);
			};
			const closed = () => {
				failed(/* @__PURE__ */ new Error("SSH stream closed during authentication"));
			};
			const timer = setTimeout(() => {
				failed(/* @__PURE__ */ new Error("SSH stream authentication timed out"));
			}, timeoutMs);
			stream.once("secureConnect", secured);
			stream.once("error", failed);
			stream.once("close", closed);
		});
		return stream;
	} catch (error) {
		stream.destroy();
		throw error;
	}
}
//#endregion
export { authenticateStream as n, SSH_STREAM_TLS_OPTIONS as t };
