import { Duplex, PassThrough } from "node:stream";
import { SubprocessExecutableNotFoundError, SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
import { OutputCollector } from "@deepseek-ai/dsh-subprocess-local/output";
import { doneSchema, foregroundSchema, outputSnapshotFrameLimit, outputSnapshotSchema, preparedSchema, remotePath, streamEndpointSchema, terminalActivitySchema } from "@deepseek-ai/dsh-ssh/schemas";
import { RemoteOperationError, SshRpcPeer } from "@deepseek-ai/dsh-ssh/protocol";
import { z } from "zod";
//#region lib/types/index.js
/** Remote subprocess and PTY handles with independent SSH streams and helper-owned process lifetimes. */
function environment(env) {
	return env === void 0 ? void 0 : Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value ?? null]));
}
var RemoteCleanupError = class extends AggregateError {};
/** One remote ordinary process; stdin and control remain usable during asynchronous SSH allocation. */
var RemoteProcess = class {
	ssh;
	spec;
	stdin;
	stdout;
	stderr;
	control;
	collected;
	done;
	streamsClosed;
	inbound = new PassThrough();
	out = new PassThrough();
	err = new PassThrough();
	toControl = new PassThrough();
	fromControl = new PassThrough();
	controller = new AbortController();
	started;
	id;
	sockets = [];
	quiescent = false;
	committed = false;
	termination;
	detachAbort;
	spills = {};
	updateCollection = {};
	constructor(ssh, spec) {
		this.ssh = ssh;
		this.spec = spec;
		this.stdin = spec.stdio.stdin === "pipe" ? this.inbound : void 0;
		this.stdout = spec.stdio.stdout === "pipe" ? this.out : void 0;
		this.stderr = spec.stdio.stderr === "pipe" ? this.err : void 0;
		const requestedControl = spec.stdio.control;
		this.control = requestedControl === void 0 ? void 0 : Duplex.from({
			writable: this.toControl,
			readable: this.fromControl
		});
		for (const stream of [
			this.inbound,
			this.out,
			this.err,
			this.toControl,
			this.fromControl,
			this.control
		]) stream?.on("error", () => {});
		const collect = (name, stream, mode) => {
			if (mode === "pipe") return void 0;
			if (mode === "inherit") {
				stream.pipe(name === "stdout" ? process.stdout : process.stderr, { end: false });
				return;
			}
			let collector = new OutputCollector(mode.maxBytes, name, void 0);
			let base = 0;
			let total = 0;
			let finalized = false;
			this.updateCollection[name] = (snapshot, final) => {
				const bytes = Buffer.from(snapshot.tail, "base64");
				if (bytes.length > mode.maxBytes || snapshot.totalBytes < bytes.length) throw new Error("SSH helper returned invalid collected output coordinates");
				if (finalized) return;
				if (snapshot.totalBytes < total) throw new Error("SSH helper rewound collected output");
				finalized = final;
				collector = new OutputCollector(mode.maxBytes, name, void 0);
				collector.push(bytes);
				base = snapshot.totalBytes - bytes.length;
				total = snapshot.totalBytes;
			};
			return { readFrom: (offset) => {
				const snapshot = collector.readFrom(offset - base);
				return {
					...snapshot,
					nextOffset: snapshot.nextOffset + base,
					...this.spills[name] === void 0 ? {} : { spillPath: this.spills[name] }
				};
			} };
		};
		const stdout = collect("stdout", this.out, spec.stdio.stdout);
		const stderr = collect("stderr", this.err, spec.stdio.stderr);
		this.collected = {
			...stdout === void 0 ? {} : { stdout },
			...stderr === void 0 ? {} : { stderr }
		};
		const onAbort = () => {
			this.terminate();
		};
		spec.signal?.addEventListener("abort", onAbort, { once: true });
		this.detachAbort = () => {
			spec.signal?.removeEventListener("abort", onAbort);
		};
		this.started = this.start();
		this.streamsClosed = this.started.then(async () => {
			await Promise.all(this.sockets.map((socket) => socket.closed ? Promise.resolve() : new Promise((resolve) => {
				socket.once("close", () => {
					resolve();
				});
			})));
		}, () => {});
		this.done = this.started.then(async () => {
			const result = await ssh.request("process.done", { id: this.id }, doneSchema, void 0, true);
			await this.drainOutput();
			this.spills = result.spills;
			for (const name of ["stdout", "stderr"]) {
				const snapshot = result.collected[name];
				const finish = this.updateCollection[name];
				if (snapshot === void 0 !== (finish === void 0)) throw new Error("SSH helper returned mismatched output collection modes");
				if (snapshot !== void 0) finish?.(snapshot, true);
			}
			return {
				exitCode: result.outcome.exitCode,
				signal: result.outcome.signal
			};
		}).catch((error) => {
			this.terminate();
			for (const socket of this.sockets) socket.destroy();
			for (const stream of [
				this.inbound,
				this.out,
				this.err,
				this.toControl,
				this.fromControl
			]) stream.destroy(error instanceof Error ? error : new Error(String(error)));
			throw error;
		});
		this.done.catch(() => {});
	}
	async start() {
		this.spec.signal?.throwIfAborted();
		const prepared = await this.ssh.request("process.prepare", {
			...this.spec,
			signal: void 0,
			env: environment(this.spec.env)
		}, preparedSchema, this.controller.signal);
		this.id = prepared.id;
		try {
			const sockets = await Promise.all(Object.entries(prepared.streams).map(async ([name, path]) => [name, await this.ssh.connectStream(path, this.controller.signal)]));
			this.sockets = sockets.map(([, socket]) => socket);
			for (const [name, socket] of sockets) {
				if (name === "stdout" || name === "stderr") {
					const mode = this.spec.stdio[name];
					if (typeof mode === "object") new SshRpcPeer(socket, socket, outputSnapshotFrameLimit(mode.maxBytes), 1, (method, raw) => Promise.resolve().then(() => {
						if (method !== "snapshot") throw new Error("Unexpected SSH output-stream operation");
						this.updateCollection[name]?.(outputSnapshotSchema.parse(raw), false);
						return null;
					}));
					else {
						socket.end();
						const output = name === "stdout" ? this.out : this.err;
						const closeSocket = () => {
							socket.destroy();
						};
						output.once("close", closeSocket);
						socket.once("close", () => {
							output.off("close", closeSocket);
						});
						if (output.destroyed) closeSocket();
						else socket.pipe(output);
					}
				}
				if (name === "stdin") this.inbound.pipe(socket);
				if (name === "control") {
					this.toControl.pipe(socket);
					socket.pipe(this.fromControl);
				}
			}
			this.controller.signal.throwIfAborted();
			await this.ssh.request("process.start", { id: this.id }, z.object({}).strict(), this.controller.signal);
			this.committed = true;
		} catch (error) {
			this.terminate();
			await this.termination?.catch(() => {});
			for (const socket of this.sockets) socket.destroy();
			throw error;
		}
	}
	terminate() {
		if (this.quiescent || this.termination !== void 0) return;
		if (!this.committed) this.controller.abort(/* @__PURE__ */ new Error("SSH process terminated before launch acknowledgement"));
		if (this.id !== void 0) {
			this.termination = this.ssh.request("process.terminate", { id: this.id }, z.null()).then(() => {
				this.quiescent = true;
				this.detachAbort();
			}).catch((error) => {
				this.ssh.dispose().catch(() => {});
				throw error;
			});
			this.termination.catch(() => {});
		}
	}
	closeStreams() {
		for (const socket of this.sockets) socket.destroy();
		for (const stream of [
			this.inbound,
			this.out,
			this.err,
			this.toControl,
			this.fromControl,
			this.control
		]) stream?.destroy();
	}
	async waitForExit(signal) {
		if (this.quiescent) return true;
		if (signal?.aborted) return false;
		if (signal === void 0) return this.observeExit();
		const cancelled = Promise.withResolvers();
		const abort = () => {
			cancelled.resolve(false);
		};
		signal.addEventListener("abort", abort, { once: true });
		try {
			return await Promise.race([this.observeExit(signal), cancelled.promise]);
		} finally {
			signal.removeEventListener("abort", abort);
		}
	}
	async observeExit(signal) {
		try {
			await this.started;
		} catch {
			if (this.termination !== void 0) await this.termination;
			this.quiescent = true;
			this.detachAbort();
			return true;
		}
		if (this.termination !== void 0) {
			await this.termination;
			return true;
		}
		const result = await this.ssh.request("process.wait", { id: this.id }, z.boolean(), signal, true);
		if (result) {
			this.quiescent = true;
			this.detachAbort();
		}
		return result;
	}
	async drainOutput() {
		const disposers = [];
		const outputs = ["stdout", "stderr"].map((name) => {
			if (typeof this.spec.stdio[name] === "object") return Promise.resolve();
			const stream = name === "stdout" ? this.out : this.err;
			if (stream.readableEnded || stream.destroyed) return Promise.resolve();
			return new Promise((resolve) => {
				const done = () => {
					resolve();
				};
				for (const event of [
					"end",
					"close",
					"error"
				]) stream.once(event, done);
				disposers.push(() => {
					for (const event of [
						"end",
						"close",
						"error"
					]) stream.off(event, done);
				});
			});
		});
		let timer;
		try {
			await Promise.race([Promise.all(outputs), new Promise((resolve) => {
				timer = setTimeout(resolve, this.spec.graceMs);
			})]);
		} finally {
			clearTimeout(timer);
			for (const dispose of disposers) dispose();
		}
	}
};
/** SSH provider paired with the SSH filesystem; the remote helper selects POSIX process ownership. */
var SshSubprocessRuntime = class extends SubprocessRuntime {
	static inject = ["ssh"];
	live = /* @__PURE__ */ new Set();
	terminals = /* @__PURE__ */ new Set();
	terminalAllocations = /* @__PURE__ */ new Set();
	lifetime = new AbortController();
	constructor(ctx) {
		super(ctx);
		ctx.effect(() => async () => {
			this.lifetime.abort(/* @__PURE__ */ new Error("SSH subprocess provider disposed"));
			for (const handle of this.live) handle.terminate();
			const errors = (await Promise.allSettled([
				...[...this.live].map(async (handle) => {
					try {
						await handle.waitForExit();
					} finally {
						handle.closeStreams();
					}
				}),
				...[...this.terminalAllocations].map((allocation) => allocation.catch((error) => {
					if (error instanceof RemoteCleanupError) throw error;
				})),
				...[...this.terminals].map((handle) => handle.terminate())
			])).flatMap((result) => result.status === "rejected" ? [result.reason] : []);
			if (errors.length > 0) throw new AggregateError(errors, "SSH process cleanup could not be confirmed");
		});
	}
	async resolveExecutable(command, env, signal) {
		try {
			return await this.ctx.ssh.request("executable", {
				command,
				env
			}, remotePath, signal);
		} catch (error) {
			if (error instanceof RemoteOperationError && error.code === "SUBPROCESS_EXECUTABLE_NOT_FOUND") throw new SubprocessExecutableNotFoundError(error.message, { cause: error });
			throw error;
		}
	}
	terminalEnvironment(signal) {
		return this.ctx.ssh.request("terminal.environment", {}, z.object({
			platform: z.enum(["posix", "windows"]),
			defaultShell: z.string().optional()
		}).strict().transform((value) => ({
			platform: value.platform,
			...value.defaultShell === void 0 ? {} : { defaultShell: value.defaultShell }
		})), signal);
	}
	spawn(spec) {
		this.lifetime.signal.throwIfAborted();
		spec.signal?.throwIfAborted();
		const handle = new RemoteProcess(this.ctx.ssh, spec);
		this.live.add(handle);
		handle.done.then(() => handle.waitForExit()).then(() => handle.streamsClosed).then(() => {
			this.live.delete(handle);
		}).catch(() => {});
		return handle;
	}
	async spawnTerminal(spec) {
		this.lifetime.signal.throwIfAborted();
		const signal = spec.signal === void 0 ? this.lifetime.signal : AbortSignal.any([spec.signal, this.lifetime.signal]);
		signal.throwIfAborted();
		const allocation = this.createTerminal(spec, signal);
		this.terminalAllocations.add(allocation);
		try {
			return await allocation;
		} finally {
			this.terminalAllocations.delete(allocation);
		}
	}
	async createTerminal(spec, signal) {
		const ssh = this.ctx.ssh;
		const prepared = await ssh.request("process.prepare", {
			argv: spec.argv,
			cwd: spec.cwd,
			env: environment(spec.env),
			graceMs: spec.graceMs,
			terminal: {
				rows: spec.rows,
				cols: spec.cols,
				terminalType: spec.terminalType,
				shellActivity: spec.shellActivity
			}
		}, preparedSchema, signal);
		const id = prepared.id;
		let socket;
		try {
			signal.throwIfAborted();
			socket = await ssh.connectStream(streamEndpointSchema.parse(prepared.streams.terminal), signal);
			signal.throwIfAborted();
			socket.end();
			const output = new PassThrough();
			socket.pipe(output);
			const started = await ssh.request("process.start", { id }, z.object({ pid: z.number().int().positive() }).strict(), signal);
			signal.throwIfAborted();
			const done = ssh.request("process.done", { id }, doneSchema, void 0, true).then((result) => ({
				exitCode: result.outcome.exitCode,
				signal: result.outcome.signal
			}));
			done.catch(() => {});
			let closing;
			const abort = () => {
				handle.terminate().catch(() => {
					ssh.dispose().catch(() => {});
				});
			};
			const handle = {
				pid: started.pid,
				output,
				done,
				resize: async (cols, rows) => {
					await ssh.request("terminal.resize", {
						id,
						cols,
						rows
					}, z.null());
				},
				write: async (data) => {
					await ssh.request("terminal.write", {
						id,
						value: data
					}, z.null());
				},
				inspectForeground: async () => await ssh.request("terminal.inspect", { id }, foregroundSchema) ?? void 0,
				inspectActivity: () => ssh.request("terminal.activity", { id }, terminalActivitySchema),
				signalForeground: (signal) => ssh.request("terminal.signal", {
					id,
					value: signal
				}, z.number().int().positive()),
				terminate: () => {
					closing ??= ssh.request("process.terminate", { id }, z.null(), void 0, true).then(() => {
						socket?.destroy();
						output.destroy();
						signal.removeEventListener("abort", abort);
						this.terminals.delete(handle);
					}).catch((error) => {
						closing = void 0;
						throw error;
					});
					return closing;
				}
			};
			signal.addEventListener("abort", abort, { once: true });
			this.terminals.add(handle);
			return handle;
		} catch (error) {
			socket?.destroy();
			try {
				await ssh.request("process.terminate", { id }, z.null());
			} catch (cleanupError) {
				ssh.dispose().catch(() => {});
				throw new RemoteCleanupError([error, cleanupError], "SSH terminal allocation failed and remote cleanup is unknown");
			}
			throw error;
		}
	}
};
//#endregion
export { SshSubprocessRuntime, SshSubprocessRuntime as default };
