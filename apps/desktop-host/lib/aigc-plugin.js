import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Service } from "@deepseek-ai/cordis";
//#region lib/types/aigc-channel.js
/** Bounded correlated private transport. Neither secrets nor commands enter argv/profile files. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var AigcChannel = class {
	input;
	output;
	end;
	bootstrap;
	first = Promise.withResolvers();
	decoder = new StringDecoder("utf8");
	buffer = "";
	bootstrapped = false;
	stopped = false;
	pending = /* @__PURE__ */ new Map();
	commands = /* @__PURE__ */ new Map();
	completed = /* @__PURE__ */ new Set();
	invoke;
	constructor(input, output, end) {
		this.input = input;
		this.output = output;
		this.end = end;
		this.bootstrap = this.first.promise;
		this.bootstrap.catch(() => {});
		input.on("data", this.data);
		input.once("end", this.ended);
		input.on("error", this.failed);
		output.on("error", this.failed);
		if (input.readableEnded) queueMicrotask(this.ended);
	}
	ended = () => {
		if (!this.stopped) this.end(false);
	};
	failed = () => {
		if (!this.stopped) this.end(true);
	};
	data = (chunk) => {
		try {
			if (!Buffer.isBuffer(chunk)) throw Error("AIGC_CONTROL_INVALID");
			this.buffer += this.decoder.write(chunk);
			for (;;) {
				const newline = this.buffer.indexOf("\n");
				if (newline < 0) {
					if (Buffer.byteLength(this.buffer) > (this.bootstrapped ? 32 * 1024 * 1024 : 65536)) throw Error("AIGC_CONTROL_INVALID");
					return;
				}
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				if (Buffer.byteLength(line) > (this.bootstrapped ? 32 * 1024 * 1024 : 65536)) throw Error("AIGC_CONTROL_INVALID");
				const value = JSON.parse(line);
				if (!this.bootstrapped) {
					this.bootstrapped = true;
					this.first.resolve(value);
				} else this.message(value);
			}
		} catch {
			this.failed();
		}
	};
	message(value) {
		if (!value || typeof value !== "object" || !("type" in value)) throw Error("AIGC_CONTROL_INVALID");
		if (value.type === "shutdown" && Object.keys(value).length === 1) {
			this.ended();
			return;
		}
		if (!("rpcId" in value) || typeof value.rpcId !== "string" || !uuid.test(value.rpcId)) throw Error("AIGC_CONTROL_INVALID");
		const id = value.rpcId;
		if (value.type === "native-result") {
			if (Object.keys(value).some((key) => ![
				"type",
				"rpcId",
				"data",
				"error"
			].includes(key))) throw Error("AIGC_CONTROL_INVALID");
			const pending = this.pending.get(id);
			if (!pending) return;
			this.pending.delete(id);
			pending.detach();
			if ("error" in value) pending.reject(Error(typeof value.error === "string" && /^[A-Z0-9_]{1,128}$/.test(value.error) ? value.error : "AIGC_NATIVE_OPERATION_FAILED"));
			else if ("data" in value) pending.resolve(value.data);
			else pending.reject(Error("AIGC_CONTROL_INVALID"));
			return;
		}
		if (value.type === "cancel" && Object.keys(value).length === 2) {
			this.commands.get(id)?.controller.abort(Error("AIGC_OPERATION_CANCELLED"));
			return;
		}
		if (value.type !== "command" || Object.keys(value).length !== 3 || !("input" in value)) throw Error("AIGC_CONTROL_INVALID");
		if (!this.invoke || this.commands.size >= 128 || this.commands.has(id) || this.completed.has(id)) {
			this.send({
				type: "result",
				rpcId: id,
				error: "AIGC_COMMAND_UNAVAILABLE"
			}).catch(this.failed);
			return;
		}
		const invoke = this.invoke, controller = new AbortController(), settled = Promise.withResolvers();
		this.commands.set(id, {
			controller,
			settled: settled.promise
		});
		(async () => {
			try {
				const data = await invoke(value.input, controller.signal);
				controller.signal.throwIfAborted();
				await this.send({
					type: "result",
					rpcId: id,
					data
				});
			} catch (error) {
				if (!this.stopped) await this.send({
					type: "result",
					rpcId: id,
					error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : "AIGC_DOMAIN_OPERATION_FAILED"
				});
			} finally {
				this.commands.delete(id);
				this.completed.add(id);
				if (this.completed.size > 4096) this.completed.delete(this.completed.values().next().value);
				settled.resolve();
			}
		})().catch(this.failed);
	}
	listen(invoke) {
		this.invoke = invoke;
	}
	send(value) {
		if (this.stopped || this.output.destroyed || this.output.writableEnded) return Promise.reject(Error("AIGC_CONTROL_DISCONNECTED"));
		const line = JSON.stringify(value) + "\n";
		if (Buffer.byteLength(line) > 32 * 1024 * 1024) return Promise.reject(Error("AIGC_CONTROL_TOO_LARGE"));
		return new Promise((resolve, reject) => {
			this.output.write(line, (error) => {
				if (error) reject(Error("AIGC_CONTROL_DISCONNECTED"));
				else resolve();
			});
		});
	}
	request(operation, input, signal) {
		signal.throwIfAborted();
		if (this.stopped || this.pending.size >= 128) return Promise.reject(Error("AIGC_NATIVE_UNAVAILABLE"));
		const rpcId = randomUUID();
		return new Promise((resolve, reject) => {
			const cancel = () => {
				if (!this.pending.delete(rpcId)) return;
				signal.removeEventListener("abort", cancel);
				reject(Error("AIGC_OPERATION_CANCELLED"));
				this.send({
					type: "native-cancel",
					rpcId
				}).catch(this.failed);
			};
			this.pending.set(rpcId, {
				resolve,
				reject,
				detach: () => {
					signal.removeEventListener("abort", cancel);
				}
			});
			signal.addEventListener("abort", cancel, { once: true });
			this.send({
				type: "native-request",
				rpcId,
				operation,
				input
			}).catch(() => {
				const pending = this.pending.get(rpcId);
				if (!pending) return;
				this.pending.delete(rpcId);
				pending.detach();
				reject(Error("AIGC_CONTROL_DISCONNECTED"));
			});
		});
	}
	async close() {
		if (!this.stopped) {
			this.stopped = true;
			this.first.reject(Error("AIGC_PLUGIN_STOPPED"));
			this.input.off("data", this.data);
			this.input.off("end", this.ended);
			this.input.off("error", this.failed);
			this.output.off("error", this.failed);
			this.input.pause();
			this.invoke = void 0;
			for (const row of this.pending.values()) {
				row.detach();
				row.reject(Error("AIGC_PLUGIN_STOPPED"));
			}
			this.pending.clear();
			for (const row of this.commands.values()) row.controller.abort(Error("AIGC_PLUGIN_STOPPED"));
		}
		await Promise.all([...this.commands.values()].map((row) => row.settled));
	}
};
//#endregion
//#region lib/types/aigc-service.js
/** Definition and provider for the account-owned compiled AIGC domain. */
var AigcService = class extends Service {};
var CompiledAigcService = class extends AigcService {
	domain;
	starting;
	closing;
	constructor(ctx, domain) {
		super(ctx, "aigcDomain");
		this.domain = domain;
	}
	start() {
		if (this.closing) return Promise.reject(Error("AIGC_DOMAIN_CLOSED"));
		return this.starting ??= this.domain.start();
	}
	invoke(input, signal) {
		signal.throwIfAborted();
		return this.closing ? Promise.reject(Error("AIGC_DOMAIN_CLOSED")) : this.domain.invoke(input, signal);
	}
	close() {
		return this.closing ??= this.domain.close();
	}
};
//#endregion
//#region lib/types/aigc-plugin.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
const absolute = z.string().min(1).refine(isAbsolute);
const Config = z.strictObject({
	domainEntry: absolute,
	resourceDirectory: absolute,
	staticDirectory: absolute
});
const inject = ["appReady", "appExit"];
const Bootstrap = z.strictObject({
	dataDirectory: absolute,
	workspaceRoots: z.array(absolute).min(1).max(64),
	guestAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
	gateway: z.strictObject({
		origin: z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/),
		authorization: z.string().regex(/^[a-f0-9]{64}$/)
	}).optional()
});
function moduleShape(value) {
	return !!value && typeof value === "object" && "createEmbeddedAigcDomain" in value && typeof value.createEmbeddedAigcDomain === "function";
}
function domainShape(value) {
	return !!value && typeof value === "object" && [
		"start",
		"invoke",
		"close"
	].every((key) => typeof Reflect.get(value, key) === "function");
}
async function mountAigcPlugin(ctx, config, input, output) {
	config = Config.parse(config);
	const ready = ctx.get("appReady"), exit = ctx.get("appExit");
	if (!ready || !exit) throw Error("AIGC_LAUNCHER_REQUIRED");
	const lifetime = new AbortController();
	let domain, service, closing;
	let cancelReady = () => {}, exitRequested = false, exitCode = 0;
	const stop = () => {
		cancelReady();
		lifetime.abort(Error("AIGC_PLUGIN_STOPPED"));
		channel.close().catch(() => {});
	};
	const close = () => {
		stop();
		return closing ??= (async () => {
			await startup.catch(() => {});
			await Promise.all([service ? service.close() : domain?.close(), channel.close()]);
		})();
	};
	const requestExit = (failed) => {
		exitCode = Math.max(exitCode, failed ? 1 : 0);
		if (exitRequested) return;
		exitRequested = true;
		stop();
		close().then(() => {
			exit(exitCode);
		}, () => {
			exit(1);
		});
	};
	const channel = new AigcChannel(input, output, requestExit);
	ctx.effect(() => close, "aigc.domain-and-channel");
	ctx.on("internal/plugin", (fiber) => {
		if (fiber === ctx.fiber && fiber.uid === null) stop();
	}, { global: true });
	const startup = (async () => {
		const bootstrapValue = await channel.bootstrap;
		const parsed = Bootstrap.safeParse(bootstrapValue);
		if (!parsed.success) throw Error("AIGC_BOOTSTRAP_INVALID");
		lifetime.signal.throwIfAborted();
		const module = await import(__rewriteRelativeImportExtension(pathToFileURL(config.domainEntry).href));
		if (!moduleShape(module)) throw Error("AIGC_DOMAIN_MODULE_INVALID");
		lifetime.signal.throwIfAborted();
		const initialized = await module.createEmbeddedAigcDomain({
			bootstrap: parsed.data,
			resourceDirectory: config.resourceDirectory,
			staticDirectory: config.staticDirectory,
			signal: lifetime.signal,
			native: (operation, input, signal) => channel.request(operation, input, signal)
		});
		if (!domainShape(initialized)) throw Error("AIGC_DOMAIN_MODULE_INVALID");
		domain = initialized;
		lifetime.signal.throwIfAborted();
		await ctx.plugin({
			name: "aigc-domain-provider",
			apply(provider) {
				service = new CompiledAigcService(provider, initialized);
			}
		});
		lifetime.signal.throwIfAborted();
		await ctx.plugin({
			name: "aigc-lifecycle-consumer",
			inject: [
				"aigcDomain",
				"appReady",
				"appExit"
			],
			async apply(consumer) {
				const { origin } = await consumer.aigcDomain.start();
				lifetime.signal.throwIfAborted();
				const url = new URL(origin);
				if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.origin !== origin || !url.port || Number(url.port) > 65535) throw Error("AIGC_DOMAIN_ORIGIN_INVALID");
				channel.listen((input, signal) => consumer.aigcDomain.invoke(input, signal));
				cancelReady = ready.onReady(() => {
					if (!lifetime.signal.aborted) channel.send({
						type: "ready",
						origin
					}).catch(() => {
						requestExit(true);
					});
				});
			}
		});
	})();
	try {
		await startup;
	} catch (error) {
		if (lifetime.signal.aborted) return;
		requestExit(true);
		throw error;
	}
}
async function apply(ctx, config) {
	await mountAigcPlugin(ctx, config, process.stdin, process.stdout);
}
//#endregion
export { Config, apply, inject, mountAigcPlugin };
