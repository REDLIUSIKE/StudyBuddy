import { z } from "zod";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
//#region lib/types/protocol.js
/** Bounded, versioned requests between an SSH client and its private remote helper. */
/** Wire version shared by the installed helper and client package. */
const SSH_PROTOCOL_VERSION = 2;
/** Maximum prepared or running process handles owned by one helper. */
const SSH_MAX_PROCESS_HANDLES = 128;
/** Maximum open text iterators owned by one helper. */
const SSH_MAX_TEXT_STREAMS = 128;
const managementLimits = {
	heartbeat: 1,
	close: 1,
	"process.terminate": 128,
	"fs.streamClose": 128
};
function requestClass(method) {
	switch (method) {
		case "heartbeat":
		case "close":
		case "process.terminate":
		case "fs.streamClose": return method;
		default: return "ordinary";
	}
}
const errorSchema = z.object({
	name: z.string(),
	message: z.string(),
	code: z.string().optional()
}).strict();
const requestIdSchema = z.string().transform((value) => value);
const frameSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("request"),
		id: requestIdSchema,
		method: z.string(),
		params: z.unknown()
	}).strict(),
	z.object({
		type: z.literal("result"),
		id: requestIdSchema,
		value: z.unknown()
	}).strict(),
	z.object({
		type: z.literal("error"),
		id: requestIdSchema,
		error: errorSchema
	}).strict(),
	z.object({
		type: z.literal("cancel"),
		id: requestIdSchema
	}).strict()
]);
function operationError(error) {
	return error instanceof Error ? error : new Error(String(error));
}
/** A remote error retains its typed filesystem or sandbox code. */
var RemoteOperationError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "RemoteOperationError";
	}
};
/** The peer owns pending calls and rejects ambiguous operations on connection loss; it never replays requests. */
var SshRpcPeer = class extends EventEmitter {
	input;
	output;
	maxFrameBytes;
	maxPending;
	handler;
	pending = /* @__PURE__ */ new Map();
	active = /* @__PURE__ */ new Map();
	writeTail = Promise.resolve();
	queuedBytes = 0;
	failure;
	constructor(input, output, maxFrameBytes, maxPending, handler) {
		super();
		this.input = input;
		this.output = output;
		this.maxFrameBytes = maxFrameBytes;
		this.maxPending = maxPending;
		this.handler = handler;
		input.on("error", (error) => {
			this.close(error);
		});
		output.on("error", (error) => {
			this.close(error);
		});
		output.on("close", () => {
			this.close();
		});
		this.readFrames().catch((error) => {
			this.close(operationError(error));
		});
	}
	/**
	* Send one request and validate its response before exposing it to the caller.
	* @param method - the private helper operation.
	* @param params - JSON request fields.
	* @param schema - validation for the remote response.
	* @param signal - cancellation without rollback of remote effects.
	* @returns the validated response or a transport/remote-operation rejection.
	*/
	async request(method, params, schema, signal) {
		signal?.throwIfAborted();
		if (this.failure !== void 0) throw this.failure;
		const kind = requestClass(method);
		if (this.atCapacity(kind, this.pending.values())) throw new Error("SSH helper pending request limit reached");
		const id = randomUUID();
		const result = Promise.withResolvers();
		result.promise.catch(() => {});
		this.pending.set(id, {
			...result,
			requestClass: kind
		});
		const abort = () => {
			result.reject(/* @__PURE__ */ new Error("SSH operation cancelled; a completed remote mutation is not rolled back"));
			this.send({
				type: "cancel",
				id
			}).catch(() => {});
		};
		signal?.addEventListener("abort", abort, { once: true });
		try {
			this.send({
				type: "request",
				id,
				method,
				params
			}).catch((error) => {
				this.pending.delete(id);
				result.reject(operationError(error));
			});
			return schema.parse(await result.promise);
		} finally {
			signal?.removeEventListener("abort", abort);
		}
	}
	/**
	* Fail pending operations and abort remote handlers without claiming rollback.
	* @param error - the transport failure reported to all pending operations.
	*/
	close(error = /* @__PURE__ */ new Error("SSH connection lost; remote operation outcome and cleanup are unknown")) {
		if (this.failure !== void 0) return;
		this.failure = error;
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		for (const { controller } of this.active.values()) controller.abort(error);
		this.active.clear();
		this.input.destroy();
		this.output.destroy();
		this.emit("closed", error);
	}
	async send(frame) {
		if (this.failure !== void 0) return Promise.reject(this.failure);
		const body = Buffer.from(JSON.stringify(frame));
		if (body.length > this.maxFrameBytes || this.queuedBytes + body.length + 4 > this.maxFrameBytes * 2) return Promise.reject(/* @__PURE__ */ new Error("SSH helper frame or write queue limit exceeded"));
		const header = Buffer.alloc(4);
		header.writeUInt32BE(body.length);
		const bytes = Buffer.concat([header, body]);
		this.queuedBytes += bytes.length;
		const write = this.writeTail.then(async () => {
			if (this.failure !== void 0) throw this.failure;
			if (!this.output.write(bytes)) await new Promise((resolve, reject) => {
				const cleanup = () => {
					this.output.off("drain", drained);
					this.off("closed", closed);
				};
				const drained = () => {
					cleanup();
					resolve();
				};
				const closed = (error) => {
					cleanup();
					reject(error);
				};
				this.output.once("drain", drained);
				this.once("closed", closed);
				if (this.failure !== void 0) closed(this.failure);
			});
		});
		this.writeTail = write.catch((error) => {
			this.close(operationError(error));
		});
		return write.finally(() => {
			this.queuedBytes -= bytes.length;
		});
	}
	async readFrames() {
		const header = Buffer.alloc(4);
		let headerBytes = 0;
		let payload;
		let payloadBytes = 0;
		for await (const raw of this.input) {
			const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
			let offset = 0;
			while (offset < chunk.length) {
				if (payload === void 0) {
					const count = Math.min(4 - headerBytes, chunk.length - offset);
					chunk.copy(header, headerBytes, offset, offset + count);
					headerBytes += count;
					offset += count;
					if (headerBytes < 4) continue;
					const size = header.readUInt32BE(0);
					if (size === 0 || size > this.maxFrameBytes) throw new Error("SSH helper sent an invalid frame length");
					payload = Buffer.alloc(size);
					payloadBytes = 0;
				}
				const count = Math.min(payload.length - payloadBytes, chunk.length - offset);
				chunk.copy(payload, payloadBytes, offset, offset + count);
				payloadBytes += count;
				offset += count;
				if (payloadBytes === payload.length) {
					const frame = frameSchema.parse(JSON.parse(payload.toString("utf8")));
					payload = void 0;
					headerBytes = 0;
					this.receive(frame);
				}
			}
		}
		throw new Error(headerBytes > 0 || payload !== void 0 ? "SSH helper disconnected during a frame; outcome is unknown" : "SSH helper disconnected; outcome is unknown");
	}
	receive(frame) {
		if (frame.type === "result" || frame.type === "error") {
			const pending = this.pending.get(frame.id);
			if (pending === void 0) return;
			this.pending.delete(frame.id);
			if (frame.type === "result") pending.resolve(frame.value);
			else pending.reject(new RemoteOperationError(frame.error.message, frame.error.code));
			return;
		}
		if (frame.type === "cancel") {
			this.active.get(frame.id)?.controller.abort(/* @__PURE__ */ new Error("SSH caller cancelled the operation"));
			return;
		}
		const kind = requestClass(frame.method);
		if (this.handler === void 0 || this.active.has(frame.id) || this.atCapacity(kind, this.active.values())) throw new Error("SSH helper received an unexpected or excessive request");
		const controller = new AbortController();
		this.active.set(frame.id, {
			controller,
			requestClass: kind
		});
		this.handler(frame.method, frame.params, controller.signal).then((value) => this.send({
			type: "result",
			id: frame.id,
			value: value ?? null
		}), (error) => {
			const detail = operationError(error);
			const code = "code" in detail && typeof detail.code === "string" ? detail.code : void 0;
			return this.send({
				type: "error",
				id: frame.id,
				error: {
					name: detail.name,
					message: detail.message,
					...code === void 0 ? {} : { code }
				}
			});
		}).catch((error) => {
			this.close(operationError(error));
		}).finally(() => {
			this.active.delete(frame.id);
		});
	}
	atCapacity(kind, requests) {
		const limit = kind === "ordinary" ? this.maxPending : managementLimits[kind];
		let count = 0;
		for (const request of requests) if (request.requestClass === kind) count++;
		return count >= limit;
	}
};
//#endregion
export { SshRpcPeer as a, SSH_PROTOCOL_VERSION as i, SSH_MAX_PROCESS_HANDLES as n, SSH_MAX_TEXT_STREAMS as r, RemoteOperationError as t };
