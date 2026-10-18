import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Service } from "@deepseek-ai/cordis";
//#region lib/types/video-editing-channel.js
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_QUEUED_BYTES = 16 * 1024 * 1024;
/** Bounded private stdio framing shared by bootstrap, control and native results. */
var VideoChannel = class {
	input;
	output;
	buffer = Buffer.alloc(0);
	frames = [];
	waiters = [];
	stops = /* @__PURE__ */ new Set();
	queued = 0;
	failure;
	constructor(input, output) {
		this.input = input;
		this.output = output;
		input.on("data", this.data);
		input.on("end", this.ended);
		input.on("error", this.failed);
		output.on("error", this.failed);
	}
	data = (chunk) => {
		if (this.failure) return;
		this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
		let newline;
		while ((newline = this.buffer.indexOf(10)) !== -1) {
			if (newline > MAX_FRAME_BYTES) {
				this.close(Error("VIDEO_FRAME_TOO_LARGE"));
				return;
			}
			const line = this.buffer.subarray(0, newline);
			this.buffer = this.buffer.subarray(newline + 1);
			let value;
			try {
				value = JSON.parse(line.toString("utf8"));
			} catch {
				this.close(Error("VIDEO_FRAME_INVALID"));
				return;
			}
			const waiter = this.waiters.shift();
			if (waiter) waiter.resolve(value);
			else {
				this.queued += line.length;
				if (this.queued > MAX_QUEUED_BYTES) {
					this.close(Error("VIDEO_FRAME_TOO_LARGE"));
					return;
				}
				this.frames.push({
					value,
					bytes: line.length
				});
			}
		}
		if (this.buffer.length > MAX_FRAME_BYTES) this.close(Error("VIDEO_FRAME_TOO_LARGE"));
	};
	ended = () => {
		this.close(Error("VIDEO_CHANNEL_CLOSED"));
	};
	failed = () => {
		this.close(Error("VIDEO_CHANNEL_FAILED"));
	};
	next() {
		if (this.failure) return Promise.reject(this.failure);
		const frame = this.frames.shift();
		if (frame) {
			this.queued -= frame.bytes;
			return Promise.resolve(frame.value);
		}
		return new Promise((resolve, reject) => {
			this.waiters.push({
				resolve,
				reject
			});
		});
	}
	send(value) {
		if (this.failure) return Promise.reject(this.failure);
		const frame = JSON.stringify(value) + "\n";
		if (Buffer.byteLength(frame) > MAX_FRAME_BYTES) return Promise.reject(Error("VIDEO_FRAME_TOO_LARGE"));
		return new Promise((resolve, reject) => {
			this.output.write(frame, (error) => error ? reject(error) : resolve());
		});
	}
	onStop(callback) {
		this.stops.add(callback);
		if (this.failure) callback(this.failure);
		return () => {
			this.stops.delete(callback);
		};
	}
	close(error = Error("VIDEO_CHANNEL_CLOSED")) {
		if (this.failure) return;
		this.failure = error;
		this.input.off("data", this.data);
		this.input.off("end", this.ended);
		this.input.off("error", this.failed);
		this.output.off("error", this.failed);
		this.input.pause();
		this.buffer = Buffer.alloc(0);
		this.frames.length = 0;
		this.queued = 0;
		for (const waiter of this.waiters.splice(0)) waiter.reject(error);
		for (const stop of [...this.stops]) stop(error);
		this.stops.clear();
	}
};
//#endregion
//#region lib/types/video-editing-service.js
/** The video domain's lifecycle and editing capability, independent of its transport. */
var VideoEditingService = class extends Service {};
/** Provider for one verified compiled domain; owns idempotent start and close. */
var CompiledVideoEditingService = class extends VideoEditingService {
	domain;
	starting;
	closing;
	constructor(ctx, domain) {
		super(ctx, "videoEditing");
		this.domain = domain;
	}
	admitted() {
		if (this.closing) throw Error("VIDEO_DOMAIN_CLOSED");
	}
	capabilityProjects(input) {
		this.admitted();
		if (!this.domain.capabilityProjects) throw Error("VIDEO_CAPABILITY_UNAVAILABLE");
		return this.domain.capabilityProjects(input);
	}
	capability(...args) {
		this.admitted();
		if (!this.domain.capability) throw Error("VIDEO_CAPABILITY_UNAVAILABLE");
		return this.domain.capability(...args);
	}
	admitPaths(admission) {
		this.admitted();
		return this.domain.admitPaths(admission);
	}
	projectInfo(projectId) {
		this.admitted();
		return this.domain.projectInfo(projectId);
	}
	start() {
		this.admitted();
		return this.starting ??= this.domain.start();
	}
	quiesceProject(scope) {
		this.admitted();
		return this.domain.quiesceProject(scope);
	}
	readProject(scope) {
		this.admitted();
		return this.domain.readProject(scope);
	}
	readGuide(scope, guide) {
		this.admitted();
		return this.domain.readGuide(scope, guide);
	}
	readFile(scope, path) {
		this.admitted();
		return this.domain.readFile(scope, path);
	}
	applyEdit(scope, revision, edit) {
		this.admitted();
		return this.domain.applyEdit(scope, revision, edit);
	}
	look(scope, input) {
		this.admitted();
		return this.domain.look(scope, input);
	}
	transcribe(scope, src, signal) {
		this.admitted();
		return this.domain.transcribe(scope, src, signal);
	}
	mediaRequest(scope, input, signal) {
		this.admitted();
		return this.domain.mediaRequest(scope, input, signal);
	}
	translate(scope, language, signal) {
		this.admitted();
		return this.domain.translate(scope, language, signal);
	}
	createExport(scope, input) {
		this.admitted();
		return this.domain.createExport(scope, input);
	}
	cancelExport(scope, id) {
		this.admitted();
		return this.domain.cancelExport(scope, id);
	}
	readExports(scope, id) {
		this.admitted();
		return this.domain.readExports(scope, id);
	}
	close() {
		return this.closing ??= this.domain.close();
	}
};
//#endregion
//#region lib/types/video-editing-plugin.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
const absolute = z.string().min(1).refine(isAbsolute);
const Scope = z.strictObject({
	accountGeneration: z.string().min(1).max(512),
	workspaceId: z.string().min(1).max(512),
	projectId: z.string().min(1).max(512),
	sessionId: z.string().min(1).max(512)
});
const Binding = z.strictObject({
	scope: Scope,
	projectRoot: absolute
});
const Runtime = z.strictObject({
	browserExecutable: absolute,
	ffmpegExecutable: absolute,
	ffprobeExecutable: absolute,
	identities: z.record(z.string(), z.strictObject({
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
		version: z.string().min(1)
	}))
});
const Bootstrap = z.strictObject({
	accountGeneration: z.string().min(1),
	workspaceRoot: absolute,
	stateRoot: absolute,
	guestAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
	bindings: z.array(Binding).max(128),
	renderRuntime: Runtime.optional()
});
const PathAdmission = z.discriminatedUnion("kind", [z.strictObject({
	kind: z.literal("project"),
	accountGeneration: z.string().min(1),
	paths: z.array(absolute).min(1).max(128)
}), z.strictObject({
	kind: z.enum(["asset", "export"]),
	accountGeneration: z.string().min(1),
	paths: z.array(absolute).min(1).max(128),
	scope: Scope
})]);
const Caller = z.strictObject({
	schemaVersion: z.literal(1),
	grantRef: z.uuid(),
	sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
	toolCallId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/)
});
const Command = z.strictObject({
	type: z.literal("command"),
	id: z.string().min(1).max(512),
	operation: z.enum([
		"bind",
		"unbind",
		"capability",
		"readProject",
		"readGuide",
		"readFile",
		"applyEdit",
		"look",
		"transcribe",
		"translate",
		"mediaRequest",
		"createExport",
		"cancelExport",
		"readExports"
	]),
	scope: Scope,
	projectRoot: absolute.optional(),
	caller: Caller.optional(),
	input: z.unknown().optional()
});
const CapabilityResult = z.strictObject({
	type: z.literal("capability-result"),
	id: z.string(),
	result: z.unknown().optional(),
	error: z.string().optional()
});
/** Main supplies only verified compiled resources; secrets arrive through private stdin. */
const Config = z.strictObject({
	domainEntry: absolute,
	staticDirectory: absolute
});
const inject = ["appReady", "appExit"];
function isDomain(value) {
	if (!value || typeof value !== "object") return false;
	return [
		"start",
		"quiesceProject",
		"admitPaths",
		"projectInfo",
		"readProject",
		"readGuide",
		"readFile",
		"applyEdit",
		"look",
		"transcribe",
		"translate",
		"mediaRequest",
		"createExport",
		"cancelExport",
		"readExports",
		"close"
	].every((key) => key in value && typeof Reflect.get(value, key) === "function");
}
/** Mount the profile's service/provider/consumer with owned private transport.
* @param ctx - Cordis profile context.
* @param config - Verified module/static paths.
* @param input - Main's private commands and native results.
* @param output - Correlated replies, native requests and readiness.
* @returns Initialization; disposal awaits domain and transport quiescence. */
async function mountVideoPlugin(ctx, config, input, output) {
	const ready = ctx.get("appReady"), exit = ctx.get("appExit");
	if (!ready || !exit) throw Error("VIDEO_LAUNCHER_REQUIRED");
	const io = new VideoChannel(input, output), abort = new AbortController();
	let domain, service;
	let startup = Promise.resolve(), closing;
	let stopped = false;
	let accountGeneration;
	const bindings = /* @__PURE__ */ new Map();
	const projectControllers = /* @__PURE__ */ new Map(), closingProjects = /* @__PURE__ */ new Set();
	const pending = /* @__PURE__ */ new Map();
	const commands = /* @__PURE__ */ new Set();
	const transcriptions = /* @__PURE__ */ new Map();
	const validBinding = (scope) => {
		const binding = bindings.get(scope.sessionId);
		return !abort.signal.aborted && scope.accountGeneration === accountGeneration && !!binding && Object.keys(scope).every((key) => Reflect.get(scope, key) === Reflect.get(binding.scope, key));
	};
	const current = (scope) => !closingProjects.has(scope.sessionId) && validBinding(scope);
	const close = () => {
		if (closing) return closing;
		stopped = true;
		abort.abort();
		for (const controller of projectControllers.values()) controller.abort();
		for (const work of transcriptions.values()) work.controller.abort();
		io.close();
		for (const request of pending.values()) request.reject(Error("VIDEO_SCOPE_REVOKED"));
		pending.clear();
		return closing = (async () => {
			await startup.catch(() => {});
			await (service?.close() ?? domain?.close());
			await Promise.allSettled([...commands]);
			bindings.clear();
			projectControllers.clear();
			closingProjects.clear();
		})();
	};
	ctx.effect(() => close, "video.domain-and-transport");
	ctx.on("internal/plugin", (fiber) => {
		if (fiber === ctx.fiber && fiber.uid === null) {
			stopped = true;
			abort.abort();
		}
	}, { global: true });
	io.onStop((error) => {
		if (!stopped) {
			stopped = true;
			abort.abort();
			close().then(() => exit(error.message === "VIDEO_CHANNEL_CLOSED" ? 0 : 1), () => exit(1));
		}
	});
	const handle = async (raw) => {
		const projectCommand = z.strictObject({
			type: z.literal("command"),
			id: z.string(),
			operation: z.literal("capabilityProjects"),
			input: z.discriminatedUnion("action", [z.strictObject({ action: z.literal("list") }), z.strictObject({
				action: z.literal("create"),
				title: z.string().min(1).max(160)
			})])
		}).safeParse(raw);
		if (projectCommand.success) {
			try {
				if (!service) throw Error("VIDEO_DOMAIN_UNAVAILABLE");
				const value = await service.capabilityProjects(projectCommand.data.input);
				await io.send({
					type: "result",
					id: projectCommand.data.id,
					result: value
				});
			} catch (error) {
				await io.send({
					type: "result",
					id: projectCommand.data.id,
					error: error instanceof Error && error.message.startsWith("VIDEO_") ? error.message : "VIDEO_PROJECT_INVALID"
				});
			}
			return;
		}
		const admission = z.strictObject({
			type: z.literal("command"),
			id: z.string().min(1).max(512),
			operation: z.literal("admitPaths"),
			input: PathAdmission
		}).safeParse(raw);
		if (admission.success) {
			try {
				const input = admission.data.input;
				if (!service || input.accountGeneration !== accountGeneration || input.kind !== "project" && !current(input.scope)) throw Error("VIDEO_SCOPE_REVOKED");
				const value = await service.admitPaths(input);
				if (!abort.signal.aborted) await io.send({
					type: "result",
					id: admission.data.id,
					result: value
				});
			} catch (error) {
				if (!abort.signal.aborted) await io.send({
					type: "result",
					id: admission.data.id,
					error: error instanceof Error && error.message.startsWith("VIDEO_") ? error.message : "VIDEO_PATH_DENIED"
				});
			}
			return;
		}
		const info = z.strictObject({
			type: z.literal("command"),
			id: z.string().min(1).max(512),
			operation: z.literal("projectInfo"),
			projectId: z.string().min(1).max(512)
		}).safeParse(raw);
		if (info.success) {
			try {
				if (!service) throw Error("VIDEO_DOMAIN_UNAVAILABLE");
				const value = await service.projectInfo(info.data.projectId);
				if (!abort.signal.aborted) await io.send({
					type: "result",
					id: info.data.id,
					result: value
				});
			} catch {
				if (!abort.signal.aborted) await io.send({
					type: "result",
					id: info.data.id,
					error: "VIDEO_PROJECT_UNAVAILABLE"
				});
			}
			return;
		}
		const cancellation = z.strictObject({
			type: z.literal("cancel-command"),
			id: z.string().min(1).max(512)
		}).safeParse(raw);
		if (cancellation.success) {
			transcriptions.get(cancellation.data.id)?.controller.abort();
			return;
		}
		const result = CapabilityResult.safeParse(raw);
		if (result.success) {
			const request = pending.get(result.data.id);
			if (request) {
				pending.delete(result.data.id);
				result.data.error ? request.reject(Error(result.data.error)) : request.resolve(result.data.result);
			}
			return;
		}
		const parsed = Command.safeParse(raw);
		if (!parsed.success) throw Error("VIDEO_COMMAND_INVALID");
		const command = parsed.data;
		if (transcriptions.has(command.id)) throw Error("VIDEO_REQUEST_CONFLICT");
		try {
			let value;
			if (command.operation === "bind") {
				if (command.scope.accountGeneration !== accountGeneration) throw Error("VIDEO_SCOPE_REVOKED");
				if (!command.projectRoot) throw Error("VIDEO_BINDING_INVALID");
				if (closingProjects.has(command.scope.sessionId)) throw Error("VIDEO_SCOPE_REVOKED");
				const previous = bindings.get(command.scope.sessionId);
				if (previous && (previous.projectRoot !== command.projectRoot || Object.keys(command.scope).some((key) => Reflect.get(command.scope, key) !== Reflect.get(previous.scope, key)))) throw Error("VIDEO_BINDING_CONFLICT");
				if (!previous) {
					projectControllers.set(command.scope.sessionId, new AbortController());
					bindings.set(command.scope.sessionId, {
						scope: command.scope,
						projectRoot: command.projectRoot
					});
				}
				value = { bound: true };
			} else {
				if (!current(command.scope)) throw Error("VIDEO_SCOPE_REVOKED");
				if (command.operation === "unbind") {
					closingProjects.add(command.scope.sessionId);
					projectControllers.get(command.scope.sessionId)?.abort();
					for (const work of transcriptions.values()) if (work.scope.sessionId === command.scope.sessionId) work.controller.abort();
					if (!service) throw Error("VIDEO_DOMAIN_UNAVAILABLE");
					await service.quiesceProject(command.scope);
					bindings.delete(command.scope.sessionId);
					projectControllers.delete(command.scope.sessionId);
					closingProjects.delete(command.scope.sessionId);
					value = { bound: false };
				} else {
					if (!service) throw Error("VIDEO_DOMAIN_UNAVAILABLE");
					const scope = command.scope;
					switch (command.operation) {
						case "capability": {
							if (!command.caller) throw Error("VIDEO_CALLER_INVALID");
							const data = z.strictObject({
								operation: z.enum([
									"readProject",
									"readGuide",
									"readFile",
									"applyEdit",
									"look",
									"transcribe",
									"translate",
									"mediaRequest",
									"createExport",
									"cancelExport",
									"readExports",
									"importAsset",
									"openProject"
								]),
								args: z.unknown()
							}).parse(command.input), controller = new AbortController();
							transcriptions.set(command.id, {
								scope,
								controller
							});
							value = await service.capability(scope, command.caller, data.operation, data.args, AbortSignal.any([abort.signal, controller.signal]));
							break;
						}
						case "readProject":
							value = await service.readProject(scope);
							break;
						case "readGuide":
							value = await service.readGuide(scope, z.strictObject({ guide: z.enum(["manual", "spec"]) }).parse(command.input).guide);
							break;
						case "readFile":
							value = await service.readFile(scope, z.strictObject({ relativePath: z.string() }).parse(command.input).relativePath);
							break;
						case "applyEdit": {
							const data = z.strictObject({
								expectedRevision: z.string(),
								edit: z.unknown()
							}).parse(command.input);
							const module = z.object({ validateVideoEdit: z.custom((value) => typeof value === "function") }).parse(await import(__rewriteRelativeImportExtension(pathToFileURL(config.domainEntry).href)));
							value = await service.applyEdit(scope, data.expectedRevision, module.validateVideoEdit(data.edit));
							break;
						}
						case "look": {
							const data = z.strictObject({
								args: z.array(z.string()).max(16).optional(),
								options: z.strictObject({
									count: z.number().int().min(1).max(120).optional(),
									offline: z.boolean().optional()
								}).optional()
							}).parse(command.input);
							value = await service.look(scope, {
								...data.args ? { args: data.args } : {},
								...data.options ? { options: {
									...data.options.count !== void 0 ? { count: data.options.count } : {},
									...data.options.offline !== void 0 ? { offline: data.options.offline } : {}
								} } : {}
							});
							break;
						}
						case "mediaRequest": {
							const data = z.strictObject({
								operation: z.enum([
									"voice",
									"tts",
									"sfx",
									"image",
									"video"
								]),
								authorityRef: z.string().min(1),
								requestId: z.uuid(),
								input: z.unknown()
							}).parse(command.input), controller = new AbortController();
							transcriptions.set(command.id, {
								scope,
								controller
							});
							value = await service.mediaRequest(scope, data, AbortSignal.any([abort.signal, controller.signal]));
							break;
						}
						case "transcribe": {
							const data = z.strictObject({ src: z.string().min(1).max(4096) }).parse(command.input), controller = new AbortController();
							transcriptions.set(command.id, {
								scope,
								controller
							});
							value = await service.transcribe(scope, data.src, AbortSignal.any([abort.signal, controller.signal]));
							break;
						}
						case "translate": {
							const data = z.strictObject({ language: z.string().min(2).max(16) }).parse(command.input), controller = new AbortController();
							transcriptions.set(command.id, {
								scope,
								controller
							});
							value = await service.translate(scope, data.language, AbortSignal.any([abort.signal, controller.signal]));
							break;
						}
						case "createExport": {
							const data = z.record(z.string(), z.unknown()).parse(command.input);
							value = await service.createExport(scope, data);
							break;
						}
						case "cancelExport":
							await service.cancelExport(scope, z.strictObject({ jobId: z.string() }).parse(command.input).jobId);
							value = { cancellationRequested: true };
							break;
						case "readExports":
							value = await service.readExports(scope, z.strictObject({ jobId: z.string().optional() }).parse(command.input).jobId);
							break;
					}
					if (!current(scope)) throw Error("VIDEO_SCOPE_REVOKED");
				}
			}
			await io.send({
				type: "result",
				id: command.id,
				result: value
			});
		} catch (error) {
			if (!abort.signal.aborted) await io.send({
				type: "result",
				id: command.id,
				error: error instanceof Error && error.message.startsWith("VIDEO_") ? error.message : "VIDEO_COMMAND_FAILED"
			});
		} finally {
			transcriptions.delete(command.id);
		}
	};
	startup = (async () => {
		try {
			const raw = await io.next();
			if (Buffer.byteLength(JSON.stringify(raw)) > 65536) throw Error("VIDEO_BOOTSTRAP_INVALID");
			const bootstrap = Bootstrap.safeParse(raw);
			if (!bootstrap.success) throw Error("VIDEO_BOOTSTRAP_INVALID");
			accountGeneration = bootstrap.data.accountGeneration;
			for (const binding of bootstrap.data.bindings) {
				if (binding.scope.accountGeneration !== accountGeneration) throw Error("VIDEO_BOOTSTRAP_INVALID");
				bindings.set(binding.scope.sessionId, binding);
				projectControllers.set(binding.scope.sessionId, new AbortController());
			}
			abort.signal.throwIfAborted();
			const imported = await import(__rewriteRelativeImportExtension(pathToFileURL(config.domainEntry).href));
			const initialized = await z.object({ createEmbeddedVideoDomain: z.custom((value) => typeof value === "function") }).parse(imported).createEmbeddedVideoDomain({
				accountGeneration: bootstrap.data.accountGeneration,
				workspaceRoot: bootstrap.data.workspaceRoot,
				stateRoot: bootstrap.data.stateRoot,
				guestAuthorization: bootstrap.data.guestAuthorization,
				...bootstrap.data.renderRuntime ? { renderRuntime: bootstrap.data.renderRuntime } : {},
				staticDirectory: config.staticDirectory,
				signal: abort.signal,
				isCurrentScope: validBinding,
				resolveProject: async (scope) => {
					if (!validBinding(scope)) throw Error("VIDEO_SCOPE_REVOKED");
					return bindings.get(scope.sessionId).projectRoot;
				},
				scopeForRoot: (root) => [...bindings.values()].find((binding) => binding.projectRoot === root && current(binding.scope))?.scope,
				projectSignalForRoot: (root) => {
					const binding = [...bindings.values()].find((binding) => binding.projectRoot === root && current(binding.scope));
					return binding ? projectControllers.get(binding.scope.sessionId)?.signal : void 0;
				},
				projectRelocated: async (event) => {
					abort.signal.throwIfAborted();
					const id = randomUUID();
					const response = new Promise((resolve, reject) => {
						pending.set(id, {
							resolve,
							reject
						});
					});
					try {
						await io.send({
							type: "project-relocated",
							id,
							accountGeneration,
							event
						});
						const result = await response;
						abort.signal.throwIfAborted();
						if (!result || typeof result !== "object" || !("persisted" in result) || result.persisted !== true) throw Error("VIDEO_PATH_ADMISSION_FAILED");
					} finally {
						pending.delete(id);
					}
				},
				capabilities: { request: async (request, signal) => {
					if (!current(request.scope)) throw Error("VIDEO_SCOPE_REVOKED");
					signal.throwIfAborted();
					const id = randomUUID();
					const response = new Promise((resolve, reject) => {
						const cancel = () => {
							pending.delete(id);
							io.send({
								type: "capability-cancel",
								id
							}).catch(() => {});
							reject(Error("VIDEO_SCOPE_REVOKED"));
						};
						pending.set(id, {
							resolve: (value) => {
								signal.removeEventListener("abort", cancel);
								resolve(value);
							},
							reject: (error) => {
								signal.removeEventListener("abort", cancel);
								reject(error);
							}
						});
						signal.addEventListener("abort", cancel, { once: true });
					});
					await io.send({
						type: "capability",
						id,
						request
					});
					const value = await response;
					if (request.operation !== "project-release" && !current(request.scope)) throw Error("VIDEO_SCOPE_REVOKED");
					const parsed = z.strictObject({
						data: z.unknown(),
						artifacts: z.array(z.strictObject({
							relativePath: z.string(),
							sha256: z.string(),
							mime: z.string()
						})),
						receiptRef: z.string().optional()
					}).parse(value);
					return {
						data: parsed.data,
						artifacts: parsed.artifacts,
						...parsed.receiptRef ? { receiptRef: parsed.receiptRef } : {}
					};
				} }
			});
			if (!isDomain(initialized)) throw Error("VIDEO_DOMAIN_INVALID");
			domain = initialized;
			abort.signal.throwIfAborted();
			await ctx.plugin({
				name: "video-domain-provider",
				apply: (provider) => {
					service = new CompiledVideoEditingService(provider, initialized);
				}
			});
			await ctx.plugin({
				name: "video-domain-lifecycle",
				inject: [
					"videoEditing",
					"appReady",
					"appExit"
				],
				async apply(consumer) {
					const origins = await consumer.videoEditing.start();
					abort.signal.throwIfAborted();
					for (const [name, origin] of Object.entries(origins)) {
						const url = new URL(origin);
						if (url.protocol !== "http:" || url.hostname !== (name === "editorOrigin" ? "127.0.0.1" : "localhost") || url.origin !== origin || !url.port || Number(url.port) > 65535) throw Error("VIDEO_ORIGIN_INVALID");
					}
					consumer.effect(() => ready.onReady(() => {
						if (!stopped) io.send({
							type: "ready",
							...origins
						}).catch(() => {
							close();
						});
					}), "video.ready");
				}
			});
			(async () => {
				try {
					while (!abort.signal.aborted) {
						const job = handle(await io.next());
						commands.add(job);
						job.finally(() => commands.delete(job)).catch(() => {
							close();
						});
					}
				} catch {
					if (!stopped) close();
				}
			})();
		} catch (error) {
			if (abort.signal.aborted || error instanceof Error && error.message === "VIDEO_CHANNEL_CLOSED") return;
			close();
			throw Error(error instanceof Error && error.message.startsWith("VIDEO_") ? error.message : "VIDEO_BOOTSTRAP_INVALID");
		}
	})();
	await startup;
}
/** Profile entry; the ordinary dsh launcher owns these stdio streams. */
function apply(ctx, config) {
	return mountVideoPlugin(ctx, config, process.stdin, process.stdout);
}
//#endregion
export { Config, apply, inject, mountVideoPlugin };
