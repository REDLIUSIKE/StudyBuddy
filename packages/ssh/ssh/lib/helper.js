import { a as SshRpcPeer, t as RemoteOperationError } from "./protocol-CDhW_IHU.js";
import { S as textStreamIdSchema, _ as remotePath, a as environmentSchema, b as targetSchema, d as outputSnapshotFrameLimit, g as processIdSchema, l as intentSchema, m as policySchema, r as editSchema, v as spawnSchema } from "./schemas-BD3YbDxe.js";
import { t as SSH_STREAM_TLS_OPTIONS } from "./stream-security-DJlQsPG-.js";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:tls";
import { fileURLToPath } from "node:url";
import { isSea } from "node:sea";
import { readFileSync } from "node:fs";
import { FsError } from "@deepseek-ai/dsh-fs";
import { SandboxedFileSystem } from "@deepseek-ai/dsh-fs-sandbox";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import { LocalSandboxProvider } from "@deepseek-ai/dsh-sandbox-local";
import { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { finished, pipeline } from "node:stream/promises";
import { OutputCollector, logSpillFailure, prepareManagedProcessBinding } from "@deepseek-ai/dsh-subprocess-local/output";
//#region lib/types/helper-processes.js
/** Remote process ownership and separately forwarded byte streams. */
/** Join TLS, underlying socket, and listener closure before removing their directory. */
async function closeEndpoint(endpoint) {
	const sockets = [...new Set([...endpoint.socket === void 0 ? [] : [endpoint.socket], ...endpoint.pending])];
	const closed = sockets.map((socket) => new Promise((resolve) => {
		if (socket.closed) resolve();
		else socket.once("close", () => {
			resolve();
		});
	}));
	const listenerClosed = new Promise((resolve) => {
		endpoint.server.close(() => {
			resolve();
		});
	});
	for (const socket of sockets) socket.destroy();
	await Promise.all([listenerClosed, ...closed]);
}
/** Coalesce live tail updates while capture continues independently of network readers. */
var CollectedOutputForwarder = class {
	collector;
	peer;
	dirty = false;
	stopped = false;
	running;
	constructor(socket, collector, maxBytes) {
		this.collector = collector;
		this.peer = new SshRpcPeer(socket, socket, outputSnapshotFrameLimit(maxBytes), 1);
		this.peer.once("closed", () => {
			this.stopped = true;
		});
	}
	offer() {
		if (this.stopped) return;
		this.dirty = true;
		if (this.running !== void 0) return;
		this.running = this.flush();
	}
	async flush() {
		try {
			while (this.dirty && !this.stopped) {
				this.dirty = false;
				const snapshot = this.collector.snapshot();
				await this.peer.request("snapshot", {
					tail: snapshot.bytes.toString("base64"),
					totalBytes: snapshot.totalBytes
				}, z.null());
			}
		} catch {
			this.stopped = true;
			this.peer.close();
		} finally {
			this.running = void 0;
		}
	}
	async finish() {
		this.offer();
		while (this.running !== void 0) await this.running;
		this.peer.close();
	}
};
/** Owns remote launch reservations through final process-range quiescence. */
var RemoteProcesses = class {
	ctx;
	root;
	limit;
	preparationMs;
	records = /* @__PURE__ */ new Map();
	completed = /* @__PURE__ */ new Map();
	cleanups = /* @__PURE__ */ new Set();
	closing = false;
	/** Spill failures reach the helper's logger; the remote caller then receives the tail without a spill path. */
	reportSpillFailure;
	constructor(ctx, root, limit, preparationMs) {
		this.ctx = ctx;
		this.root = root;
		this.limit = limit;
		this.preparationMs = preparationMs;
		this.reportSpillFailure = logSpillFailure(ctx.logger, "ssh helper");
	}
	/**
	* Allocate private stream listeners; no target executes until start().
	* @param raw - untrusted process request received over SSH.
	* @returns the reservation id and authenticated stream coordinates.
	*/
	async prepare(raw) {
		if (this.closing || this.records.size >= this.limit) throw new Error("SSH process capacity unavailable");
		const request = spawnSchema.parse(raw);
		const id = randomUUID();
		const directory = join(this.root, id);
		const record = {
			request,
			directory,
			endpoints: {},
			controller: new AbortController(),
			expiry: setTimeout(() => {
				this.release(id).catch(() => {});
			}, this.preparationMs)
		};
		this.records.set(id, record);
		try {
			record.preparing = (async () => {
				await mkdir(directory, { mode: 448 });
				record.controller.signal.throwIfAborted();
				const names = request.terminal === void 0 ? [
					"stdout",
					"stderr",
					...request.stdio?.stdin === "pipe" ? ["stdin"] : [],
					...request.stdio?.control === "pipe" ? ["control"] : []
				] : ["terminal"];
				for (const name of names) {
					record.endpoints[name] = await this.endpoint(join(directory, name));
					record.controller.signal.throwIfAborted();
				}
			})();
			await record.preparing;
			return {
				id,
				streams: Object.fromEntries(Object.entries(record.endpoints).map(([name, endpoint]) => [name, {
					path: endpoint.path,
					capability: endpoint.capability
				}]))
			};
		} catch (error) {
			await this.release(id);
			throw error;
		}
	}
	/**
	* Start once all data channels are authenticated; duplicate starts refuse.
	* @param id - the prepared process reservation.
	* @param signal - cancellation of pending process publication.
	* @returns the terminal pid when the request owns a PTY.
	*/
	async start(id, signal) {
		const record = this.record(id);
		if (record.start !== void 0) throw new Error("SSH process launch was already requested");
		signal?.throwIfAborted();
		const abort = () => {
			record.controller.abort(signal?.reason);
		};
		signal?.addEventListener("abort", abort, { once: true });
		record.start = this.startOnce(id, record);
		try {
			await record.start;
		} catch (error) {
			const failed = Promise.reject(error);
			failed.catch(() => {});
			record.done = failed;
			await this.finishFailed(id, record, failed);
			throw error;
		} finally {
			signal?.removeEventListener("abort", abort);
		}
		return record.terminal === void 0 ? {} : { pid: record.terminal.pid };
	}
	async startOnce(id, record) {
		await Promise.all(Object.values(record.endpoints).map((endpoint) => endpoint.connected));
		clearTimeout(record.expiry);
		if (this.closing) throw new Error("SSH helper is closing");
		record.controller.signal.throwIfAborted();
		const request = record.request;
		const cwd = this.ctx.fs.processPath(await this.ctx.fs.resolve(request.cwd, { signal: record.controller.signal }));
		record.controller.signal.throwIfAborted();
		const env = request.env === void 0 ? {} : Object.fromEntries(Object.entries(request.env).map(([key, value]) => [key, value ?? void 0]));
		if (request.terminal !== void 0) {
			const terminal = await this.ctx.subprocess.spawnTerminal({
				argv: request.argv,
				cwd,
				env: Object.fromEntries(Object.entries(env).filter((entry) => entry[1] !== void 0)),
				graceMs: request.graceMs,
				...request.terminal,
				signal: record.controller.signal
			});
			record.terminal = terminal;
			record.controller.signal.throwIfAborted();
			const socket = await record.endpoints.terminal.connected;
			const output = pipeline(terminal.output, socket).catch(() => {});
			const done = terminal.done.then((outcome) => ({
				outcome,
				spills: {},
				collected: {}
			}));
			record.done = done;
			done.then(async () => {
				if (request.terminal?.shellActivity === true) {
					await output;
					return;
				}
				await terminal.terminate();
				await output;
				await this.rememberCompleted(id, record, done);
			}, () => this.finishFailed(id, record, done)).catch(() => {});
			return;
		}
		const stdio = request.stdio;
		const spec = {
			argv: request.argv,
			cwd,
			env,
			graceMs: request.graceMs,
			signal: record.controller.signal,
			stdio: {
				stdin: stdio.stdin,
				stdout: "pipe",
				stderr: "pipe",
				...stdio.control === void 0 ? {} : { control: stdio.control }
			}
		};
		const ordinary = this.ctx.subprocess.spawn(spec);
		record.ordinary = ordinary;
		const control = ordinary.control;
		if (record.endpoints.control !== void 0 && control === void 0) {
			ordinary.done.catch(() => {});
			throw new Error("Remote subprocess provider did not establish fd 7");
		}
		const collectors = {};
		const stopCapture = [];
		const forwarders = [];
		const forwarded = [];
		const streams = [];
		for (const name of ["stdout", "stderr"]) {
			const stream = ordinary[name];
			const mode = stdio[name];
			const socket = await record.endpoints[name].connected;
			if (typeof mode === "object") {
				const binding = prepareManagedProcessBinding({ onSpillFailure: this.reportSpillFailure });
				const collector = new OutputCollector(mode.maxBytes, name, mode.spill === void 0 ? void 0 : {
					maxBytes: mode.spill.maxBytes,
					dir: binding.spillDir,
					onFailure: binding.onSpillFailure
				});
				collectors[name] = collector;
				const forwarder = new CollectedOutputForwarder(socket, collector, mode.maxBytes);
				forwarders.push(forwarder);
				const receive = (chunk) => {
					collector.push(chunk);
					forwarder.offer();
				};
				stream.on("data", receive);
				stopCapture.push(() => {
					stream.off("data", receive);
					stream.destroy();
					collector.seal();
				});
			} else streams.push(pipeline(stream, socket).catch(() => {}));
		}
		if (record.endpoints.stdin !== void 0) {
			const socket = await record.endpoints.stdin.connected;
			socket.end();
			pipeline(socket, ordinary.stdin).catch(() => {});
		}
		if (record.endpoints.control !== void 0) {
			const channel = control;
			const socket = await record.endpoints.control.connected;
			socket.pipe(channel).pipe(socket);
			socket.on("error", () => {
				channel.destroy();
			});
			channel.on("error", () => {
				socket.destroy();
			});
			streams.push(finished(socket, {
				readable: false,
				cleanup: true
			}).catch(() => {}));
		}
		const done = ordinary.done.finally(() => {
			for (const stop of stopCapture) stop();
		}).then(async (outcome) => {
			for (const forwarder of forwarders) forwarded.push(forwarder.finish());
			await Promise.race([Promise.all(streams), new Promise((resolve) => {
				setTimeout(resolve, request.graceMs).unref();
			})]);
			const spills = {};
			const collected = {};
			for (const name of ["stdout", "stderr"]) {
				const collector = collectors[name];
				if (collector === void 0) continue;
				const snapshot = collector.snapshot();
				collected[name] = {
					tail: snapshot.bytes.toString("base64"),
					totalBytes: snapshot.totalBytes
				};
				const path = collector.readFrom(0).spillPath;
				if (path !== void 0) spills[name] = path;
			}
			return {
				outcome,
				spills,
				collected
			};
		});
		record.done = done;
		done.then(async () => {
			await ordinary.waitForExit();
			await Promise.all([...streams, ...forwarded]);
			await this.rememberCompleted(id, record, done);
		}, () => this.finishFailed(id, record, done)).catch(() => {});
	}
	/**
	* Await the direct result without claiming all descendants have exited.
	* @param id - the started process reservation.
	* @returns the exit observation and remote spill paths.
	* @throws the original startup or process failure while its completion is retained.
	*/
	async done(id) {
		if (this.completed.has(id)) return this.completed.get(id);
		const record = this.record(id);
		if (record.start === void 0) throw new Error("SSH process has not started");
		await record.start;
		return record.done;
	}
	/**
	* Observe the native managed range used for termination.
	* @param id - the started process reservation.
	* @param signal - cancellation of this observation, leaving ownership intact.
	* @returns whether the owned process range is empty.
	*/
	async wait(id, signal) {
		if (this.completed.has(id)) return true;
		const record = this.record(id);
		await record.start;
		if (record.ordinary !== void 0) return record.ordinary.waitForExit(signal);
		if (record.terminal !== void 0) {
			await record.terminal.terminate();
			return true;
		}
		throw new Error("SSH process was not started");
	}
	/**
	* Terminate and await the managed range independently of output readers.
	* @param id - the process reservation to stop.
	*/
	async terminate(id) {
		if (this.completed.has(id)) return;
		const record = this.record(id);
		record.controller.abort(/* @__PURE__ */ new Error("SSH process termination requested"));
		record.ordinary?.terminate();
		if (record.ordinary !== void 0) await record.ordinary.waitForExit();
		if (record.terminal !== void 0) {
			await record.terminal.terminate();
			if (record.request.terminal?.shellActivity === true && record.done !== void 0) await this.rememberCompleted(id, record, record.done);
		}
		if (record.ordinary === void 0 && record.terminal === void 0) await this.release(id);
	}
	/**
	* Operate on the terminal owned by the request id.
	* @param id - the terminal reservation.
	* @param operation - terminal input, foreground observation, or signal delivery.
	* @param value - input bytes as text or the signal name.
	* @returns the operation's wire result.
	*/
	async terminal(id, operation, value) {
		const terminal = this.record(id).terminal;
		if (terminal === void 0) throw new Error("SSH handle does not own a terminal");
		if (operation === "write") {
			await terminal.write(z.string().parse(value));
			return null;
		}
		if (operation === "inspect") return await terminal.inspectForeground() ?? null;
		if (operation === "activity") return terminal.inspectActivity();
		return terminal.signalForeground(z.enum([
			"SIGINT",
			"SIGTERM",
			"SIGKILL",
			"SIGTSTP",
			"SIGHUP"
		]).parse(value));
	}
	/**
	* Resize an allocated terminal without replacing its process.
	* @param id - terminal reservation.
	* @param cols - positive terminal width.
	* @param rows - positive terminal height.
	* @returns after the local provider accepts the dimensions.
	*/
	async resizeTerminal(id, cols, rows) {
		const terminal = this.record(id).terminal;
		if (terminal === void 0) throw new Error("SSH handle does not own a terminal");
		await terminal.resize(cols, rows);
	}
	/** Stop every owned process on lease expiry or disconnect. */
	async close() {
		if (this.closing) return;
		this.closing = true;
		const releases = [...this.records.keys()].map((id) => this.release(id));
		const outcomes = await Promise.allSettled([...releases, ...this.cleanups]);
		const errors = [...new Set(outcomes.flatMap((result) => result.status === "rejected" ? [result.reason] : []))];
		if (errors.length > 0) throw new AggregateError(errors, "SSH remote process cleanup failed");
	}
	async release(id) {
		const record = this.record(id);
		record.release ??= this.trackCleanup(async () => {
			clearTimeout(record.expiry);
			record.controller.abort(/* @__PURE__ */ new Error("SSH process reservation closed"));
			await record.preparing?.catch(() => {});
			await Promise.all(Object.values(record.endpoints).map(closeEndpoint));
			await record.start?.catch(() => {});
			record.ordinary?.terminate();
			if (record.ordinary !== void 0) await record.ordinary.waitForExit();
			if (record.terminal !== void 0) await record.terminal.terminate();
			this.records.delete(id);
			await rm(record.directory, {
				recursive: true,
				force: true
			});
		});
		await record.release;
	}
	record(id) {
		const record = this.records.get(id);
		if (record === void 0) throw new Error("Unknown or expired SSH process handle");
		return record;
	}
	async finishFailed(id, record, result) {
		clearTimeout(record.expiry);
		record.ordinary?.terminate();
		if (record.ordinary !== void 0) await record.ordinary.waitForExit();
		if (record.terminal !== void 0) await record.terminal.terminate();
		await this.rememberCompleted(id, record, result);
	}
	async rememberCompleted(id, record, result) {
		if (this.records.get(id) !== record || record.release !== void 0) return;
		const cleanup = this.trackCleanup(async () => {
			await Promise.all(Object.values(record.endpoints).map(closeEndpoint));
			await rm(record.directory, {
				recursive: true,
				force: true
			});
		});
		this.records.delete(id);
		this.completed.set(id, result);
		if (this.completed.size > this.limit * 4) this.completed.delete(this.completed.keys().next().value);
		await cleanup;
	}
	trackCleanup(work) {
		const pending = Promise.resolve().then(work);
		this.cleanups.add(pending);
		return pending.finally(() => {
			this.cleanups.delete(pending);
		});
	}
	async endpoint(path) {
		const connected = Promise.withResolvers();
		const capability = randomBytes(32);
		const server = createServer({
			...SSH_STREAM_TLS_OPTIONS,
			allowHalfOpen: true,
			handshakeTimeout: this.preparationMs,
			pskCallback: (_socket, identity) => identity === "dsh-stream" ? capability : null
		});
		const endpoint = {
			path,
			capability: capability.toString("hex"),
			server,
			connected: connected.promise,
			pending: /* @__PURE__ */ new Set()
		};
		server.maxConnections = 8;
		connected.promise.catch(() => {});
		server.on("connection", (socket) => {
			endpoint.pending.add(socket);
			socket.once("close", () => {
				endpoint.pending.delete(socket);
			});
		});
		server.on("tlsClientError", (_error, socket) => {
			socket.destroy();
		});
		server.on("secureConnection", (socket) => {
			if (endpoint.socket !== void 0) {
				socket.destroy();
				return;
			}
			socket.disableRenegotiation();
			socket.pause();
			socket.on("error", () => {});
			endpoint.socket = socket;
			server.close();
			connected.resolve(socket);
		});
		server.on("error", (error) => {
			connected.reject(error);
		});
		server.on("close", () => {
			if (endpoint.socket === void 0) connected.reject(/* @__PURE__ */ new Error("SSH stream reservation closed"));
		});
		try {
			await new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(path, resolve);
			});
			await chmod(path, 384);
			return endpoint;
		} catch (error) {
			await closeEndpoint(endpoint);
			throw error;
		}
	}
};
//#endregion
//#region lib/types/helper.js
/** Private POSIX SSH helper; filesystem and process effects use the installed local providers. */
const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const object = z.object({}).strict();
const processIdRequest = z.object({ id: processIdSchema }).strict();
const textStreamIdRequest = z.object({ id: textStreamIdSchema }).strict();
async function services() {
	const ctx = new Context();
	const fibers = [await ctx.plugin(SessionProjectionRegistry)];
	fibers.push(await ctx.plugin(SandboxPolicyService, {
		mode: "read-only",
		workspaceRoot: process.cwd()
	}));
	fibers.push(await ctx.plugin(SandboxedFileSystem, { cwd: process.cwd() }));
	fibers.push(await ctx.plugin(LocalSubprocessRuntime));
	fibers.push(await ctx.plugin(LocalSandboxProvider));
	return {
		ctx,
		close: async () => {
			for (const fiber of fibers.reverse()) await fiber.dispose();
		}
	};
}
/**
* Run a helper until its channel closes or its client lease expires.
* @param transport - private process streams, entry identity, and cancellation.
*/
async function runSshHelper(transport) {
	if (process.platform !== "linux" && process.platform !== "darwin") throw new Error("SSH helper requires a POSIX host");
	transport.signal.throwIfAborted();
	const runtime = await services();
	const { ctx } = runtime;
	const root = await mkdtemp("/tmp/dsh-ssh-");
	const processes = new RemoteProcesses(ctx, root, 128, 3e4);
	const lifetime = new AbortController();
	const iterators = /* @__PURE__ */ new Map();
	let lease;
	let leaseMs = 3e4;
	let initialized = false;
	let workspace = process.cwd();
	let cleanup;
	const close = () => {
		cleanup ??= (async () => {
			if (lease !== void 0) clearTimeout(lease);
			lifetime.abort(/* @__PURE__ */ new Error("SSH helper is closing"));
			for (const record of iterators.values()) record.controller.abort(lifetime.signal.reason);
			await Promise.allSettled([...iterators.values()].map(async (record) => record.iterator.return?.()));
			iterators.clear();
			try {
				await processes.close();
			} finally {
				try {
					await runtime.close();
				} finally {
					await rm(root, {
						recursive: true,
						force: true
					});
				}
			}
		})();
		return cleanup;
	};
	const touchLease = () => {
		if (lease !== void 0) clearTimeout(lease);
		lease = setTimeout(() => {
			peer.close(/* @__PURE__ */ new Error("SSH helper client lease expired"));
		}, leaseMs);
	};
	const policy = async (raw, signal) => {
		const parsed = policySchema.parse(raw);
		const target = await ctx.fs.resolve(parsed.workspaceRoot, { signal });
		return {
			...parsed,
			workspaceRoot: ctx.fs.processPath(target)
		};
	};
	const asTarget = (raw) => targetSchema.parse(raw);
	const peer = new SshRpcPeer(transport.input, transport.output, MAX_FRAME_BYTES, 128, async (method, raw, requestSignal) => {
		const signal = AbortSignal.any([requestSignal, lifetime.signal]);
		if (method === "hello") {
			if (initialized) throw new Error("SSH helper handshake already completed");
			const input = z.object({
				protocol: z.literal(2),
				workspace: remotePath,
				leaseMs: z.number().int().min(3e3).max(6e5),
				bootstrapPath: remotePath.optional()
			}).strict().parse(raw);
			if (transport.kind === "executable" && input.bootstrapPath !== void 0) throw new Error("Executable SSH helper uses its embedded PTC bootstrap");
			workspace = ctx.fs.processPath(await ctx.fs.resolve(input.workspace, { signal }));
			leaseMs = input.leaseMs;
			initialized = true;
			touchLease();
			return {
				protocol: 2,
				hash: createHash("sha256").update(readFileSync(transport.entryPath)).digest("hex"),
				kind: transport.kind,
				platform: process.platform,
				nodeVersion: process.version,
				executable: process.execPath,
				root,
				workspace,
				...input.bootstrapPath === void 0 ? {} : { bootstrapHash: createHash("sha256").update(readFileSync(input.bootstrapPath)).digest("hex") }
			};
		}
		if (!initialized || cleanup !== void 0) throw new Error("SSH helper is not accepting operations");
		if (method === "heartbeat") {
			object.parse(raw);
			touchLease();
			return null;
		}
		if (method === "close") {
			object.parse(raw);
			await close();
			return null;
		}
		if (method === "process.prepare") return processes.prepare(raw);
		if (method === "process.start") return processes.start(processIdRequest.parse(raw).id, signal);
		if (method === "process.done") return processes.done(processIdRequest.parse(raw).id);
		if (method === "process.wait") return processes.wait(processIdRequest.parse(raw).id, signal);
		if (method === "process.terminate") {
			await processes.terminate(processIdRequest.parse(raw).id);
			return null;
		}
		if (method === "terminal.environment") {
			object.parse(raw);
			return ctx.subprocess.terminalEnvironment(signal);
		}
		if (method === "terminal.resize") {
			const input = z.object({
				id: processIdSchema,
				cols: z.number().int().positive(),
				rows: z.number().int().positive()
			}).strict().parse(raw);
			await processes.resizeTerminal(input.id, input.cols, input.rows);
			return null;
		}
		if (method === "terminal.write" || method === "terminal.inspect" || method === "terminal.activity" || method === "terminal.signal") {
			const input = z.object({
				id: processIdSchema,
				value: z.string().optional()
			}).strict().parse(raw);
			return processes.terminal(input.id, method === "terminal.write" ? "write" : method === "terminal.inspect" ? "inspect" : method === "terminal.activity" ? "activity" : "signal", input.value);
		}
		if (method === "executable") {
			const input = z.object({
				command: z.string(),
				env: environmentSchema.optional()
			}).strict().parse(raw);
			const env = input.env === void 0 ? void 0 : Object.fromEntries(Object.entries(input.env).filter((entry) => entry[1] !== null));
			try {
				return await ctx.subprocess.resolveExecutable(input.command, env, signal);
			} catch (error) {
				if (typeof error === "object" && error !== null && "name" in error && error.name === "SubprocessExecutableNotFoundError" && "message" in error && typeof error.message === "string") throw new RemoteOperationError(error.message, "SUBPROCESS_EXECUTABLE_NOT_FOUND");
				throw error;
			}
		}
		if (method === "sandbox") {
			const input = z.object({
				argv: z.array(z.string()).min(1),
				policy: policySchema
			}).strict().parse(raw);
			const resolved = await policy(input.policy, signal);
			if (resolved.mode === "danger-full-access") throw new Error("Unconfined argv does not need a sandbox wrapper");
			return ctx.sandbox.confine(input.argv, resolved, signal);
		}
		if (method === "fs.resolve" || method === "fs.lstat") {
			const input = z.object({
				path: z.string(),
				cwd: remotePath.optional()
			}).strict().parse(raw);
			return method === "fs.resolve" ? ctx.fs.resolve(input.path, {
				cwd: input.cwd ?? workspace,
				signal
			}) : await ctx.fs.lstat(input.path, { cwd: input.cwd ?? workspace }, signal) ?? null;
		}
		if (method === "fs.stat" || method === "fs.list" || method === "fs.readText" || method === "fs.stream") {
			const target = asTarget(z.object({ target: targetSchema }).strict().parse(raw).target);
			if (method === "fs.stat") return await ctx.fs.stat(target, signal) ?? null;
			if (method === "fs.list") return ctx.fs.listDir(target, signal);
			if (method === "fs.stream") {
				if (iterators.size >= 128) throw new Error("SSH text stream limit reached");
				const controller = new AbortController();
				const iterator = (await ctx.fs.streamText(target, AbortSignal.any([signal, controller.signal])))[Symbol.asyncIterator]();
				try {
					signal.throwIfAborted();
					if (iterators.size >= 128) throw new Error("SSH text stream limit reached");
					const id = randomUUID();
					iterators.set(id, {
						iterator,
						controller
					});
					return id;
				} catch (error) {
					controller.abort(error);
					await iterator.return?.();
					throw error;
				}
			}
			const stream = await ctx.fs.streamText(target, signal);
			let text = "";
			let bytes = 0;
			for await (const chunk of stream) {
				bytes += Buffer.byteLength(chunk);
				if (bytes > MAX_TEXT_BYTES) throw new FsError("SSH whole-text transfer exceeds its bounded frame budget; use streaming", "FS_TOO_LARGE");
				text += chunk;
			}
			return text;
		}
		if (method === "fs.next" || method === "fs.streamClose") {
			const { id } = textStreamIdRequest.parse(raw);
			const record = iterators.get(id);
			if (record === void 0) throw new Error("Unknown SSH text stream");
			if (method === "fs.streamClose") {
				iterators.delete(id);
				record.controller.abort(/* @__PURE__ */ new Error("SSH text stream closed"));
				await record.iterator.return?.();
				return null;
			}
			const abort = () => {
				record.controller.abort(signal.reason);
			};
			signal.addEventListener("abort", abort, { once: true });
			try {
				signal.throwIfAborted();
				const next = await record.iterator.next();
				if (next.done) iterators.delete(id);
				return {
					done: next.done ?? false,
					value: next.done ? "" : next.value
				};
			} catch (error) {
				iterators.delete(id);
				record.controller.abort(error);
				await record.iterator.return?.();
				throw error;
			} finally {
				signal.removeEventListener("abort", abort);
			}
		}
		if (method === "fs.readBytes" || method === "fs.readRange") {
			const input = z.object({
				target: targetSchema,
				maxBytes: z.number().int().nonnegative().optional(),
				offset: z.number().int().nonnegative().optional(),
				length: z.number().int().nonnegative().optional()
			}).strict().parse(raw);
			const target = asTarget(input.target);
			const bytes = method === "fs.readBytes" ? await ctx.fs.readBytes(target, signal, Math.min(z.number().int().nonnegative().parse(input.maxBytes), MAX_TEXT_BYTES)) : await ctx.fs.readByteRange(target, {
				offset: z.number().int().nonnegative().parse(input.offset),
				length: z.number().int().nonnegative().max(MAX_TEXT_BYTES).parse(input.length)
			}, signal);
			return Buffer.from(bytes).toString("base64");
		}
		if (method === "fs.write" || method === "fs.edit") {
			const input = z.object({
				target: targetSchema,
				content: z.string().optional(),
				edit: editSchema.optional(),
				expected: z.union([intentSchema, z.object({ version: z.string() }).strict()]).optional(),
				policy: policySchema
			}).strict().parse(raw);
			const target = asTarget(input.target);
			const resolved = await policy(input.policy, signal);
			if (method === "fs.write") return ctx.fs.writeText(target, z.string().parse(input.content), input.expected === void 0 ? void 0 : intentSchema.parse(input.expected), signal, resolved);
			return ctx.fs.editText(target, editSchema.parse(input.edit), input.expected === void 0 ? void 0 : z.object({ version: z.string() }).strict().parse(input.expected), signal, resolved);
		}
		throw new Error(`Unknown SSH helper operation: ${method}`);
	});
	const closed = Promise.withResolvers();
	peer.once("closed", () => {
		close().catch(() => {});
		closed.resolve(void 0);
	});
	const onAbort = () => {
		peer.close(/* @__PURE__ */ new Error("SSH helper transport was terminated"));
	};
	transport.signal.addEventListener("abort", onAbort, { once: true });
	if (transport.signal.aborted) onAbort();
	else touchLease();
	try {
		await closed.promise;
		await close();
	} finally {
		transport.signal.removeEventListener("abort", onAbort);
	}
}
//#endregion
//#region lib/types/helper-entry.js
/** Private OpenSSH process entry; the helper module owns request and cleanup behavior. */
/* v8 ignore file -- launched through plain Node in SSH acceptance; helper behavior is exercised through its explicit streams. */
const controller = new AbortController();
const stop = () => {
	controller.abort(/* @__PURE__ */ new Error("SSH helper process terminated"));
};
for (const signal of [
	"SIGTERM",
	"SIGHUP",
	"SIGINT"
]) process.once(signal, stop);
try {
	if (process.argv.length !== 2) throw new Error("SSH helper accepts no command arguments");
	const packaged = isSea();
	await runSshHelper({
		input: process.stdin,
		output: process.stdout,
		entryPath: packaged ? process.execPath : fileURLToPath(import.meta.url),
		kind: packaged ? "executable" : "node-script",
		signal: controller.signal
	});
} catch (error) {
	process.stderr.write(`dsh-ssh-sandbox: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 127;
} finally {
	for (const signal of [
		"SIGTERM",
		"SIGHUP",
		"SIGINT"
	]) process.off(signal, stop);
}
//#endregion
export {};
