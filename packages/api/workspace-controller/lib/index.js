import z from "@deepseek-ai/schemastery";
import { Remote, RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { WorkspaceActiveSessionError, WorkspaceArchivedSessionPinError, WorkspaceId, WorkspaceMoveInvalidError, WorkspaceOrderInvalidError, WorkspaceUnknownSessionError, realpathNormalize, workspaceDomainState, workspaceRecord } from "@deepseek-ai/dsh-workspace";
import { Deque } from "@deepseek-ai/dsh-deque";
import { z as z$1 } from "zod";
import { DirectoryPickerError } from "@deepseek-ai/dsh-host-directory-picker";
import { homedir } from "node:os";
import { basename, dirname, join, posix, relative, sep, win32 } from "node:path";
import { runNativeCommand } from "@deepseek-ai/dsh-native-command";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { SessionId } from "@deepseek-ai/dsh-session";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
//#region lib/types/feed.js
/** Reconnect-safe Workspace baseline and increment producer. */
/**
* Project one authoritative Workspace entity into its Remote value.
* @param workspace - authoritative registry entity.
* @returns detached Workspace projection for Remote consumers.
*/
function workspaceView(workspace) {
	return {
		workspaceId: workspace.id,
		path: workspace.path,
		...workspace.sourceFolders === void 0 ? {} : {
			sourceFolders: workspace.sourceFolders.map((source) => ({ ...source })),
			...workspace.primarySourceId === void 0 ? {} : { primarySourceId: workspace.primarySourceId }
		},
		title: workspace.title,
		sessionIds: [...workspace.sessionIds],
		createdAt: workspace.createdAt,
		updatedAt: workspace.updatedAt
	};
}
function changedWorkspaceView(workspaceId, value) {
	const record = workspaceRecord.parse(value);
	return {
		workspaceId: WorkspaceId(workspaceId),
		path: record.path,
		...record.sourceFolders === void 0 ? {} : {
			sourceFolders: record.sourceFolders.map((source) => ({ ...source })),
			...record.primarySourceId === void 0 ? {} : { primarySourceId: record.primarySourceId }
		},
		title: record.title,
		sessionIds: [...record.sessionIds],
		createdAt: record.createdAt,
		updatedAt: record.updatedAt
	};
}
/** Owns Workspace domain observation and all active follow generations. */
var WorkspaceFeed = class {
	ctx;
	followers = /* @__PURE__ */ new Set();
	knownIds;
	order;
	archived;
	pinned;
	/** @param ctx - Host context containing the authoritative Workspace registry. */
	constructor(ctx) {
		this.ctx = ctx;
		const baseline = ctx.workspaceRegistry.list();
		this.knownIds = new Set(baseline.map((workspace) => String(workspace.id)));
		this.order = baseline.map((workspace) => String(workspace.id));
		this.archived = ctx.workspaceRegistry.archivedSessionIds.map(String);
		this.pinned = ctx.workspaceRegistry.pinnedSessionIds.map(String);
		ctx.on("domain/changed", (change) => {
			this.changed(change);
		});
		ctx.effect(() => () => {
			for (const follower of this.followers) follower.close();
			this.followers.clear();
		}, "workspace-controller.feed");
	}
	/**
	* Read the complete current projection synchronously.
	* @returns all active Workspaces plus archived and pinned Session identities.
	*/
	baseline() {
		return {
			items: this.ctx.workspaceRegistry.list().map(workspaceView),
			archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds],
			pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds]
		};
	}
	/**
	* Open one generation beginning with a complete baseline.
	* @param signal - generation cancellation.
	* @returns baseline followed by ordered Workspace increments.
	*/
	async *follow(signal) {
		signal.throwIfAborted();
		const follower = new WorkspaceFollower();
		this.followers.add(follower);
		try {
			yield {
				type: "baseline",
				value: this.baseline()
			};
			yield* follower.read(signal);
		} finally {
			this.followers.delete(follower);
			follower.close();
		}
	}
	changed(change) {
		if (change.domain !== "workspace") return;
		if (change.table === "") {
			if (change.operation !== "put") return;
			const state = workspaceDomainState.parse(change.value);
			const nextOrder = state.workspaceIds.map(String);
			const orderChanged = !sameStrings(this.order, nextOrder);
			for (const id of state.workspaceIds) {
				if (this.knownIds.has(id)) continue;
				const workspace = this.ctx.workspaceRegistry.get(id);
				if (workspace === void 0) throw new Error(`committed Workspace registry references missing Workspace "${id}"`);
				this.knownIds.add(id);
				this.publish({
					type: "upsert",
					workspace: workspaceView(workspace)
				});
			}
			this.order = nextOrder;
			if (orderChanged) this.publish({
				type: "order",
				workspaceIds: [...state.workspaceIds]
			});
			const nextArchived = state.archivedSessionIds.map(String);
			if (!sameStrings(this.archived, nextArchived)) {
				this.archived = nextArchived;
				this.publish({
					type: "archived",
					archivedSessionIds: [...state.archivedSessionIds]
				});
			}
			const nextPinned = state.pinnedSessionIds.map(String);
			if (!sameStrings(this.pinned, nextPinned)) {
				this.pinned = nextPinned;
				this.publish({
					type: "pinned",
					pinnedSessionIds: [...state.pinnedSessionIds]
				});
			}
			return;
		}
		if (change.table !== "workspaces") return;
		if (change.operation === "deleted") {
			if (!this.knownIds.delete(change.key)) return;
			this.publish({
				type: "remove",
				workspaceId: WorkspaceId(change.key)
			});
			return;
		}
		if (!this.knownIds.has(change.key)) return;
		this.publish({
			type: "upsert",
			workspace: changedWorkspaceView(change.key, change.value)
		});
	}
	publish(frame) {
		for (const follower of this.followers) follower.push(frame);
	}
};
function sameStrings(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
var WorkspaceFollower = class {
	frames = new Deque();
	waiting;
	closed = false;
	push(frame) {
		/* v8 ignore next -- closed followers are removed before later publication can reach them. */
		if (this.closed) return;
		this.frames.pushBack(frame);
		this.waiting?.();
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.waiting?.();
	}
	async *read(signal) {
		while (!this.closed && !signal.aborted) {
			const frame = this.frames.popFront();
			if (frame !== void 0) {
				yield frame;
				continue;
			}
			await this.wait(signal);
		}
	}
	wait(signal) {
		return new Promise((resolve) => {
			const finish = () => {
				signal.removeEventListener("abort", finish);
				/* v8 ignore next -- one read owns the sole installed wait callback. */
				if (this.waiting === finish) this.waiting = void 0;
				resolve();
			};
			this.waiting = finish;
			signal.addEventListener("abort", finish, { once: true });
			/* v8 ignore next -- native signals and the private queue cannot change during this synchronous setup. */
			if (signal.aborted || this.closed || this.frames.size > 0) finish();
		});
	}
};
//#endregion
//#region lib/types/commands.js
/** Workspace command implementation and stable Remote failure mapping. */
/** Implements Workspace mutations against the authoritative registry. */
var WorkspaceCommands = class {
	ctx;
	operationTail = Promise.resolve();
	/** @param ctx - Host context containing the Workspace registry. */
	constructor(ctx) {
		this.ctx = ctx;
	}
	/**
	* Create or resolve one Workspace over an existing directory.
	* @param request - directory path to register.
	* @returns the Workspace and whether this call created it.
	*/
	create(request) {
		return this.enqueue(async () => {
			try {
				const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path);
				if (existing !== void 0) return {
					workspace: workspaceView(existing),
					created: false
				};
				return {
					workspace: workspaceView(await this.ctx.workspaceRegistry.create(request.path)),
					created: true
				};
			} catch (error) {
				if (remoteErrorOf(error) !== void 0) throw error;
				throw new RemoteError("workspace/invalid-path", `cannot create a Workspace at "${request.path}": ${errorMessage$1(error)}`, { path: request.path }, { cause: error });
			}
		});
	}
	/**
	* Rename one Workspace after serializing title ownership checks.
	* @param request - Workspace identity and proposed title.
	* @returns the updated Workspace projection.
	*/
	rename(request) {
		const title = request.title.trim();
		if (title === "") return Promise.reject(new RemoteError("gateway/bad-request", "Workspace rename requires a non-blank title", {}));
		return this.enqueue(async () => {
			const workspace = this.requireWorkspace(request.workspaceId);
			if (title !== workspace.title) {
				if (this.ctx.workspaceRegistry.list().some((candidate) => candidate.id !== workspace.id && candidate.title === title)) throw new RemoteError("workspace/name-conflict", `Workspace name '${title}' is already in use`, { name: title });
				await workspace.setTitle(title);
			}
			return { workspace: workspaceView(workspace) };
		});
	}
	/**
	* Delete one Workspace registration without deleting its directory or Sessions.
	* @param request - Workspace identity to remove.
	* @returns deletion confirmation.
	*/
	delete(request) {
		return this.enqueue(async () => {
			if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) throw workspaceNotFound(request.workspaceId);
			return { deleted: true };
		});
	}
	/**
	* Move one Workspace within the durable registry order.
	* @param request - moved Workspace and optional anchor.
	* @returns the complete resulting Workspace order.
	*/
	async insertBefore(request) {
		try {
			return { workspaceIds: [...await this.ctx.workspaceRegistry.insertBefore(WorkspaceId(request.workspaceId), request.beforeWorkspaceId === void 0 ? void 0 : WorkspaceId(request.beforeWorkspaceId))] };
		} catch (error) {
			if (!(error instanceof WorkspaceOrderInvalidError)) throw error;
			throw workspaceNotFound(error.workspaceId);
		}
	}
	/**
	* Move one accounted Session within a Workspace's manual order.
	* @param request - Workspace, Session, and optional anchor identities.
	* @returns the updated Workspace projection.
	*/
	async insertSessionBefore(request) {
		const workspace = this.requireWorkspace(request.workspaceId);
		try {
			await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId);
		} catch (error) {
			if (!(error instanceof WorkspaceMoveInvalidError)) throw error;
			throw new RemoteError("workspace/move-invalid", error.message, {
				workspaceId: request.workspaceId,
				sessionId: request.sessionId,
				...request.beforeSessionId === void 0 ? {} : { beforeSessionId: request.beforeSessionId }
			}, { cause: error });
		}
		return { workspace: workspaceView(workspace) };
	}
	/**
	* Add one known Session to the registry-global archive set. Without
	* `stopActivity` a Session with running work is refused as
	* `workspace/session-active` with the activity the registry's providers
	* reported; with it, the providers stop that work first.
	* @param request - Session identity to archive and whether to stop its work.
	* @returns the complete resulting archive set.
	*/
	async archiveSession(request) {
		try {
			await this.ctx.workspaceRegistry.archiveSession(request.sessionId, request.stopActivity === true ? { stopActivity: true } : {});
		} catch (error) {
			if (error instanceof WorkspaceUnknownSessionError) throw new RemoteError("session/not-found", error.message, { sessionId: request.sessionId }, { cause: error });
			if (error instanceof WorkspaceActiveSessionError) throw new RemoteError("workspace/session-active", error.message, {
				sessionId: request.sessionId,
				activity: error.activity
			}, { cause: error });
			throw error;
		}
		return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };
	}
	/**
	* Drop one Session from the registry-global archive set. An id that is not
	* archived is not an error: the call is idempotent, so a lost race with
	* another surface resolves as a no-op.
	* @param request - Session identity to unarchive.
	* @returns the complete resulting archive set.
	*/
	async unarchiveSession(request) {
		await this.ctx.workspaceRegistry.unarchiveSession(request.sessionId);
		return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };
	}
	/**
	* Add one known unarchived Session to the registry-global pin set.
	* @param request - Session identity to pin.
	* @returns the complete resulting pin set, most recently pinned first.
	*/
	async pinSession(request) {
		try {
			await this.ctx.workspaceRegistry.pinSession(request.sessionId);
		} catch (error) {
			if (error instanceof WorkspaceUnknownSessionError) throw new RemoteError("session/not-found", error.message, { sessionId: request.sessionId }, { cause: error });
			if (error instanceof WorkspaceArchivedSessionPinError) throw new RemoteError("gateway/bad-request", error.message, {}, { cause: error });
			throw error;
		}
		return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] };
	}
	/**
	* Drop one Session from the registry-global pin set. An id that is not
	* pinned is not an error: the call is idempotent, so a lost race with
	* another surface resolves as a no-op.
	* @param request - Session identity to unpin.
	* @returns the complete resulting pin set, most recently pinned first.
	*/
	async unpinSession(request) {
		await this.ctx.workspaceRegistry.unpinSession(request.sessionId);
		return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] };
	}
	requireWorkspace(workspaceId) {
		const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId));
		if (workspace === void 0) throw workspaceNotFound(workspaceId);
		return workspace;
	}
	enqueue(operation) {
		const result = this.operationTail.then(operation);
		this.operationTail = result.then(() => void 0, () => void 0);
		return result;
	}
};
function workspaceNotFound(workspaceId) {
	return new RemoteError("workspace/not-found", `Workspace "${workspaceId}" not found`, { workspaceId });
}
function errorMessage$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region lib/types/directory-picker.js
/**
* Host directory-picking Remote owner: capability gating, cancellation, and the
* stable wire failure vocabulary over the `ctx.directoryPicker` seam.
*/
var __runInitializers$1 = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate$1 = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const createDirectoryRequestSchema = z$1.object({
	path: z$1.string(),
	name: z$1.string()
}).refine((request) => request.name.trim() !== "" && request.name !== "." && request.name !== ".." && !/[/\\]/.test(request.name), { message: "host.createDirectory requires a single non-blank path segment name" });
/**
* Host service backing the generated `ctx.remote.directoryPicker` namespace. The
* seam it exports is abstract and therefore never a Loader entry of its own, so
* this controller carries the wire verbs: one composed backend serves either the
* native chooser or the browse primitives, and a verb the composition cannot
* serve is refused rather than approximated.
*/
let DirectoryPickerController = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _pick_decorators;
	let _list_decorators;
	let _createDirectory_decorators;
	return class DirectoryPickerController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_pick_decorators = [Remote("pick")];
			_list_decorators = [Remote("list")];
			_createDirectory_decorators = [Remote("createDirectory")];
			__esDecorate$1(this, null, _pick_decorators, {
				kind: "method",
				name: "pick",
				static: false,
				private: false,
				access: {
					has: (obj) => "pick" in obj,
					get: (obj) => obj.pick
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate$1(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate$1(this, null, _createDirectory_decorators, {
				kind: "method",
				name: "createDirectory",
				static: false,
				private: false,
				access: {
					has: (obj) => "createDirectory" in obj,
					get: (obj) => obj.createDirectory
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = ["directoryPicker"];
		/** @param ctx - Host context carrying the composed directory-picking backend. */
		constructor(ctx) {
			super(ctx, "directoryPickerController", { namespace: "directoryPicker" });
			__runInitializers$1(this, _instanceExtraInitializers);
		}
		/**
		* Open the host's OS chooser for a Remote caller.
		* @param signal - caller lifetime; abort terminates the chooser.
		* @returns the chosen absolute path, or null when the operator cancels.
		*/
		async pick(signal) {
			const capability = this.requireCapability("native", "pick");
			try {
				return await capability.pick(signal);
			} catch (error) {
				throw cancellableFailure(error, signal, "directory picker was aborted", "directory picker failed");
			}
		}
		/**
		* List one directory level for a Remote caller's in-app browser.
		* @param path - absolute directory to list; absent lists the home directory.
		* @param signal - caller lifetime; abort stops the backend's scan instead of
		*   letting it outlive a disconnected caller.
		* @returns the level's listing with its ancestry.
		*/
		async list(path, signal) {
			const capability = this.requireCapability("browse", "list");
			try {
				return await capability.list(path, signal);
			} catch (error) {
				throw cancellableFailure(error, signal, "directory listing was aborted");
			}
		}
		/**
		* Create one child directory for a Remote caller's in-app browser.
		* @param path - absolute existing parent directory.
		* @param name - single non-blank path segment.
		* @returns the created directory's absolute path.
		*/
		async createDirectory(path, name) {
			const request = createDirectoryRequestSchema.safeParse({
				path,
				name
			});
			if (!request.success) throw new RemoteError("gateway/bad-request", "invalid payload for host.createDirectory", { issues: request.error.issues });
			const capability = this.requireCapability("browse", "createDirectory");
			try {
				return await capability.createDirectory(request.data.path, request.data.name);
			} catch (error) {
				throw browseFailure(error);
			}
		}
		/** Resolve the capability one wire verb needs, or refuse with the kind this backend serves. */
		requireCapability(kind, method) {
			const capability = this.ctx.directoryPicker.capability();
			if (capability.kind !== kind) throw new RemoteError("directory-picker/unavailable", `directoryPicker.${method} needs the ${kind} capability; the composed picker serves "${capability.kind}"`, { capability: capability.kind });
			return capability;
		}
	};
})();
/**
* Wire code answered for each seam browse failure. The seam's closed codes are
* its own local vocabulary, so this controller owns the projection onto the
* `directory-picker/*` codes a Remote caller discriminates on.
*/
const BROWSE_FAILURE_CODES = {
	"directory-unreadable": "directory-picker/unreadable",
	"directory-exists": "directory-picker/exists",
	"directory-create-failed": "directory-picker/create-failed"
};
/**
* Classify a browse-primitive rejection: the seam's own closed codes carry the
* path they are about, and anything else stays an infrastructure failure.
* @param error - the primitive's rejection.
* @returns the failure to throw across the Remote boundary.
*/
function browseFailure(error) {
	if (error instanceof DirectoryPickerError) return new RemoteError(BROWSE_FAILURE_CODES[error.code], error.message, { path: error.path }, { cause: error });
	return new RemoteError("gateway/internal", errorMessage(error), {}, { cause: error });
}
/**
* Classify a cancellable primitive's rejection. An abort is the caller's own
* timeout or disconnect, not a backend failure, so it answers `gateway/cancelled`
* before the business classification runs.
* @param error - the primitive's rejection.
* @param signal - the caller lifetime the primitive ran under.
* @param cancelled - operator-facing text for the abort outcome.
* @param failed - prefix for a non-seam failure, when the verb has no closed codes.
* @returns the failure to throw across the Remote boundary.
*/
function cancellableFailure(error, signal, cancelled, failed) {
	if (signal.aborted) return new RemoteError("gateway/cancelled", cancelled, {}, { cause: error });
	if (failed === void 0) return browseFailure(error);
	return new RemoteError("gateway/internal", `${failed}: ${errorMessage(error)}`, {}, { cause: error });
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region lib/types/default-workspace.js
/**
* Fixed first-use Workspace naming, shared by the Host that creates the
* directory and by browser consumers that label the resulting row. A pure fold
* with no imports, so client bundles inline it instead of requesting a
* module-table row this package does not publish.
* @module @deepseek-ai/dsh-api-workspace-controller/default-workspace
*/
/**
* Leaf directory name of the first-use Workspace under
* `<Documents>/deepseek-harness`. Language-neutral, so one installation keeps
* one on-disk path across language switches. The registry derives the initial
* title from this same segment, which is the title
* {@link workspaceDisplayTitle} recognizes as automatic.
*/
const DEFAULT_WORKSPACE_DIRECTORY = "default-workspace";
//#endregion
//#region lib/types/default-directory.js
/** Resolve the Host account's Documents directory for first-use Workspace creation. */
/**
* Validate a configured or OS-returned Documents path without resolving it against cwd.
* @param directory - fully qualified directory spelling.
* @param platform - Host platform.
* @returns the normalized directory.
*/
function validateDocumentsDirectory(directory, platform = process.platform) {
	const paths = platform === "win32" ? win32 : posix;
	const root = paths.parse(directory).root;
	if (!paths.isAbsolute(directory) || platform === "win32" && (root === "\\" || root === "/")) throw new Error(`Documents directory must be fully qualified: '${directory}'`);
	return paths.normalize(directory);
}
/**
* Resolve the Host account's system Documents directory without creating files.
* @param documentsDirectory - explicit deployment override for the system Documents directory.
* @param signal - caller lifetime and lookup deadline.
* @param internals - platform facts and native command runner.
* @returns the absolute system Documents path.
*/
async function resolveDocumentsDirectory(documentsDirectory, signal, internals = {}) {
	const platform = internals.platform ?? process.platform;
	const paths = platform === "win32" ? win32 : posix;
	signal.throwIfAborted();
	let directory = documentsDirectory;
	if (directory === void 0) {
		const run = internals.run ?? runNativeCommand;
		let stdout;
		switch (platform) {
			case "darwin":
				({stdout} = await run("osascript", ["-e", "POSIX path of (path to documents folder from user domain without folder creation)"], signal, "hidden"));
				break;
			case "win32":
				({stdout} = await run("powershell.exe", [
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments, [Environment+SpecialFolderOption]::DoNotVerify)"
				], signal, "hidden"));
				break;
			case "linux":
				({stdout} = await run("xdg-user-dir", ["DOCUMENTS"], signal, "hidden"));
				break;
			default: throw new Error(`system Documents directory is unavailable on ${platform}`);
		}
		directory = stdout.replace(/[\r\n]+$/, "");
		if (directory === "" || platform === "linux" && paths.normalize(directory) === (internals.home ?? homedir())) throw new Error("system Documents directory is unavailable");
	}
	directory = validateDocumentsDirectory(directory, platform);
	signal.throwIfAborted();
	return directory;
}
/**
* Resolve the first-use Workspace location without creating directories.
* @param documentsDirectory - system Documents override.
* @param signal - caller lifetime and deadline.
* @param internals - platform observations for native lookup.
* @returns the fully qualified first-use Workspace path.
*/
async function defaultWorkspaceDirectory(documentsDirectory, signal, internals = {}) {
	return ((internals.platform ?? process.platform) === "win32" ? win32 : posix).join(await resolveDocumentsDirectory(documentsDirectory, signal, internals), "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY);
}
//#endregion
//#region lib/types/project-directory-spec.js
/** Profile-owned source and allocation metadata; no Session transcripts are stored here. */
const sourceId = z$1.string().transform((value) => value);
const sourceFolder = z$1.object({
	sourceId,
	path: z$1.string()
});
const managedAllocation = z$1.object({
	path: z$1.string(),
	ready: z$1.boolean()
});
const allocation = z$1.discriminatedUnion("kind", [z$1.object({
	kind: z$1.literal("project"),
	fingerprint: z$1.string(),
	workspaceId: z$1.string().transform((value) => value),
	title: z$1.string(),
	sourceFolders: z$1.array(sourceFolder).min(1),
	primarySourceId: sourceId,
	managed: managedAllocation.optional(),
	committed: z$1.boolean()
}), z$1.object({
	kind: z$1.literal("chat"),
	fingerprint: z$1.literal("chat"),
	sessionId: z$1.string().transform((value) => value),
	managed: managedAllocation
})]);
/** Data lives in the existing profile's StorageDomain route, not browser storage. */
const projectDirectorySpec = defineDomain({
	name: "project_directory",
	version: 1,
	global: {
		schema: z$1.object({ namespace: z$1.uuid().nullable() }),
		initial: { namespace: null }
	},
	tables: {
		sources: domainTable(sourceFolder),
		allocations: domainTable(allocation)
	}
});
//#endregion
//#region lib/types/project-directories.js
/** Canonical source authority and recoverable managed directories for the current profile. */
/** One profile owns all source registrations and allocation intents through this instance. */
var ProjectDirectories = class {
	ctx;
	documents;
	managedRoot;
	domain;
	tail = Promise.resolve();
	disposed = false;
	/**
	* @param ctx - current profile's Workspace and StorageDomain services.
	* @param documents - OS-aware Documents resolver; no directories are created by it.
	* @param managedRoot - optional fully qualified product-root override.
	*/
	constructor(ctx, documents, managedRoot) {
		this.ctx = ctx;
		this.documents = documents;
		this.managedRoot = managedRoot;
		if (managedRoot !== void 0) validateDocumentsDirectory(managedRoot);
		ctx.effect(() => async () => {
			this.disposed = true;
			await this.tail;
			await this.domain?.close();
		}, "workspace.projects");
	}
	/**
	* Canonicalize and register one source without making a visible project.
	* @param request - user-picked directory.
	* @returns its stable current-profile identity; unavailable paths reject.
	*/
	registerSource(request) {
		return this.enqueue(async () => {
			const path = await realpathNormalize(request.path);
			if (!(await stat(path)).isDirectory()) throw new RemoteError("workspace/invalid-path", "Choose an existing source directory", { path: request.path });
			const table = (await this.open()).table("sources");
			for (const [, source] of table.entries()) if (source.path === path) return source;
			const source = {
				sourceId: randomUUID(),
				path
			};
			await table.put(source.sourceId, source);
			return source;
		});
	}
	/**
	* Prepare and durably register one confirmed named project.
	* @param request - stable request id, name, and current-profile source identities.
	* @returns the exact project; failures retain recoverable intent and never remove user files.
	*/
	createProject(request) {
		return this.enqueue(async () => {
			const title = request.title.trim();
			if (title === "") throw new RemoteError("gateway/bad-request", "Enter a project name", {});
			const domain = await this.open();
			const sourceIds = [...new Set(request.sourceIds)];
			const primarySourceId = request.primarySourceId ?? sourceIds[0];
			if (request.primarySourceId !== void 0 && !sourceIds.includes(request.primarySourceId)) throw this.unavailable(request.primarySourceId);
			const fingerprint = JSON.stringify({
				title,
				sourceIds,
				primarySourceId
			});
			const allocations = domain.table("allocations");
			let record = allocations.get(request.requestId);
			if (record !== void 0) {
				if (record.kind !== "project" || record.fingerprint !== fingerprint) throw this.conflict(request.requestId);
				if (record.committed) {
					const project = this.ctx.workspaceRegistry.get(record.workspaceId);
					if (project === void 0) throw new RemoteError("workspace/not-found", "The prepared project is no longer registered", { workspaceId: record.workspaceId });
					await this.validateSources(record.sourceFolders);
					return { workspace: workspaceView(project) };
				}
			} else {
				if (this.ctx.workspaceRegistry.list().find((project) => project.title === title) !== void 0) throw new RemoteError("workspace/name-conflict", "Choose another project name", { name: title });
				let sourceFolders = [];
				for (const id of sourceIds) {
					const source = domain.table("sources").get(id);
					if (source === void 0) throw this.unavailable(id);
					sourceFolders.push(source);
				}
				await this.validateSources(sourceFolders);
				const workspaceId = WorkspaceId(randomUUID());
				let managed;
				if (sourceFolders.length === 0) {
					const path = await this.target("Projects", String(workspaceId));
					sourceFolders = [{
						sourceId: randomUUID(),
						path
					}];
					managed = {
						path,
						ready: false
					};
				}
				record = {
					kind: "project",
					fingerprint,
					workspaceId,
					title,
					sourceFolders,
					primarySourceId: primarySourceId ?? sourceFolders[0].sourceId,
					...managed === void 0 ? {} : { managed },
					committed: false
				};
				await allocations.put(request.requestId, record);
			}
			if (record.kind !== "project") throw this.conflict(request.requestId);
			if (record.managed !== void 0) {
				try {
					await this.ensureManaged(record.managed);
				} catch (cause) {
					throw new RemoteError("workspace/managed-directory-unavailable", "The project directory could not be prepared. Retry or choose sources.", { requestId: request.requestId }, { cause });
				}
				record = {
					...record,
					managed: {
						...record.managed,
						ready: true
					}
				};
				await allocations.put(request.requestId, record);
				for (const source of record.sourceFolders) await domain.table("sources").put(source.sourceId, source);
			}
			await this.validateSources(record.sourceFolders);
			const project = await this.ctx.workspaceRegistry.createProjectRecord({
				workspaceId: record.workspaceId,
				title: record.title,
				sourceFolders: record.sourceFolders,
				primarySourceId: record.primarySourceId
			});
			await allocations.put(request.requestId, {
				...record,
				committed: true
			});
			return { workspace: workspaceView(project) };
		});
	}
	/**
	* Allocate one ordinary-chat directory, without a visible Workspace or Session.
	* @param request - retry identity for this preparation.
	* @returns one stable generated cwd/Session identity.
	*/
	prepareChat(request) {
		return this.enqueue(async () => {
			const allocations = (await this.open()).table("allocations");
			let record = allocations.get(request.requestId);
			if (record !== void 0 && record.kind !== "chat") throw this.conflict(request.requestId);
			if (record === void 0) {
				const id = randomUUID();
				record = {
					kind: "chat",
					fingerprint: "chat",
					sessionId: SessionId("session-" + id),
					managed: {
						path: await this.target("Chats", id),
						ready: false
					}
				};
				await allocations.put(request.requestId, record);
			}
			if (record.kind !== "chat") throw this.conflict(request.requestId);
			try {
				await this.ensureManaged(record.managed);
				if (!record.managed.ready) await allocations.put(request.requestId, {
					...record,
					managed: {
						...record.managed,
						ready: true
					}
				});
			} catch (cause) {
				throw new RemoteError("workspace/managed-directory-unavailable", "The chat directory could not be prepared. Retry or choose another project.", { requestId: request.requestId }, { cause });
			}
			return {
				cwd: record.managed.path,
				sessionId: record.sessionId
			};
		});
	}
	async open() {
		this.domain ??= await this.ctx.storageDomain.open(projectDirectorySpec);
		if (this.domain.global.get().namespace === null) await this.domain.global.set({ namespace: randomUUID() });
		return this.domain;
	}
	async target(category, id) {
		const domain = await this.open();
		const documents = await realpath(await this.documents());
		const product = this.managedRoot ?? join(documents, "StudyBuddy");
		const normalizedProduct = join(await realpath(dirname(product)), basename(product));
		const namespace = domain.global.get().namespace;
		if (namespace === null) throw new Error("Project namespace was not committed");
		return join(normalizedProduct, namespace, category, id);
	}
	async ensureManaged(allocation) {
		const namespace = (await this.open()).global.get().namespace;
		const categoryRoot = dirname(allocation.path);
		const namespaceRoot = dirname(categoryRoot);
		const productRoot = dirname(namespaceRoot);
		if (basename(namespaceRoot) !== namespace || !["Projects", "Chats"].includes(basename(categoryRoot)) || !/^[0-9a-f-]{36}$/.test(basename(allocation.path))) throw new Error("Invalid managed allocation identity");
		const base = await realpath(dirname(productRoot));
		for (const path of [
			productRoot,
			namespaceRoot,
			categoryRoot,
			allocation.path
		]) {
			const offset = relative(base, path);
			if (offset === "" || offset.startsWith(".." + sep) || offset === "..") throw new Error("Managed allocation escapes its parent");
			let info;
			try {
				info = await lstat(path);
			} catch (error) {
				if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
			}
			if (info === void 0) {
				if (allocation.ready) throw new Error("Managed chat directory is unavailable");
				try {
					await mkdir(path);
				} catch (error) {
					if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
				}
				info = await lstat(path);
			} else if (path === allocation.path && !allocation.ready && (await readdir(path)).length > 0) throw new Error("Uncommitted allocation directory contains files; preserve it for recovery");
			if (info.isSymbolicLink() || !info.isDirectory() || await realpath(path) !== path) throw new Error("Managed allocation has an unexpected link or directory");
		}
	}
	async validateSources(sources) {
		for (const source of sources) try {
			if (await realpathNormalize(source.path) !== source.path || !(await stat(source.path)).isDirectory()) throw this.unavailable(source.sourceId);
		} catch (cause) {
			throw new RemoteError("workspace/source-unavailable", "This project source is unavailable. Reselect it or work outside a project.", { sourceId: source.sourceId }, { cause });
		}
	}
	conflict(requestId) {
		return new RemoteError("workspace/project-request-conflict", "This request was already used with different input", { requestId });
	}
	unavailable(sourceId) {
		return new RemoteError("workspace/source-unavailable", "Select a source from the current profile", { sourceId });
	}
	enqueue(operation) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("Project directories are closed"));
		const result = this.tail.then(operation);
		this.tail = result.then(() => {}, () => {});
		return result;
	}
};
//#endregion
//#region lib/types/index.js
/** Host Workspace Remote owner: explicit commands and reconnect-safe state. */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Host service backing the generated `ctx.remote.workspace` namespace. */
let WorkspaceController = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _create_decorators;
	let _registerSource_decorators;
	let _createProject_decorators;
	let _prepareChat_decorators;
	let _initializeDefault_decorators;
	let _rename_decorators;
	let _delete_decorators;
	let _insertBefore_decorators;
	let _insertSessionBefore_decorators;
	let _archiveSession_decorators;
	let _unarchiveSession_decorators;
	let _pinSession_decorators;
	let _unpinSession_decorators;
	let _follow_decorators;
	return class WorkspaceController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_create_decorators = [Remote("create")];
			_registerSource_decorators = [Remote("registerSource")];
			_createProject_decorators = [Remote("createProject")];
			_prepareChat_decorators = [Remote("prepareChat")];
			_initializeDefault_decorators = [Remote("initializeDefault")];
			_rename_decorators = [Remote("rename")];
			_delete_decorators = [Remote("delete")];
			_insertBefore_decorators = [Remote("insertBefore")];
			_insertSessionBefore_decorators = [Remote("insertSessionBefore")];
			_archiveSession_decorators = [Remote("archiveSession")];
			_unarchiveSession_decorators = [Remote("unarchiveSession")];
			_pinSession_decorators = [Remote("pinSession")];
			_unpinSession_decorators = [Remote("unpinSession")];
			_follow_decorators = [Remote({ mode: "stream" })];
			__esDecorate(this, null, _create_decorators, {
				kind: "method",
				name: "create",
				static: false,
				private: false,
				access: {
					has: (obj) => "create" in obj,
					get: (obj) => obj.create
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _registerSource_decorators, {
				kind: "method",
				name: "registerSource",
				static: false,
				private: false,
				access: {
					has: (obj) => "registerSource" in obj,
					get: (obj) => obj.registerSource
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _createProject_decorators, {
				kind: "method",
				name: "createProject",
				static: false,
				private: false,
				access: {
					has: (obj) => "createProject" in obj,
					get: (obj) => obj.createProject
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _prepareChat_decorators, {
				kind: "method",
				name: "prepareChat",
				static: false,
				private: false,
				access: {
					has: (obj) => "prepareChat" in obj,
					get: (obj) => obj.prepareChat
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _initializeDefault_decorators, {
				kind: "method",
				name: "initializeDefault",
				static: false,
				private: false,
				access: {
					has: (obj) => "initializeDefault" in obj,
					get: (obj) => obj.initializeDefault
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _rename_decorators, {
				kind: "method",
				name: "rename",
				static: false,
				private: false,
				access: {
					has: (obj) => "rename" in obj,
					get: (obj) => obj.rename
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _insertBefore_decorators, {
				kind: "method",
				name: "insertBefore",
				static: false,
				private: false,
				access: {
					has: (obj) => "insertBefore" in obj,
					get: (obj) => obj.insertBefore
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _insertSessionBefore_decorators, {
				kind: "method",
				name: "insertSessionBefore",
				static: false,
				private: false,
				access: {
					has: (obj) => "insertSessionBefore" in obj,
					get: (obj) => obj.insertSessionBefore
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _archiveSession_decorators, {
				kind: "method",
				name: "archiveSession",
				static: false,
				private: false,
				access: {
					has: (obj) => "archiveSession" in obj,
					get: (obj) => obj.archiveSession
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _unarchiveSession_decorators, {
				kind: "method",
				name: "unarchiveSession",
				static: false,
				private: false,
				access: {
					has: (obj) => "unarchiveSession" in obj,
					get: (obj) => obj.unarchiveSession
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _pinSession_decorators, {
				kind: "method",
				name: "pinSession",
				static: false,
				private: false,
				access: {
					has: (obj) => "pinSession" in obj,
					get: (obj) => obj.pinSession
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _unpinSession_decorators, {
				kind: "method",
				name: "unpinSession",
				static: false,
				private: false,
				access: {
					has: (obj) => "unpinSession" in obj,
					get: (obj) => obj.unpinSession
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _follow_decorators, {
				kind: "method",
				name: "follow",
				static: false,
				private: false,
				access: {
					has: (obj) => "follow" in obj,
					get: (obj) => obj.follow
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = [
			"typert",
			"workspaceRegistry",
			"storageDomain"
		];
		static Config = z.object({
			documentsDirectory: z.string(),
			documentsLookupTimeoutMs: z.natural().min(1).default(1e4),
			managedRootDirectory: z.string()
		});
		config = __runInitializers(this, _instanceExtraInitializers);
		commands;
		feed;
		projects;
		/**
		* @param ctx - Host context containing the Workspace registry.
		* @param config - first-use directory policy.
		*/
		constructor(ctx, config = {}) {
			super(ctx, "workspaceController", { namespace: "workspace" });
			this.config = WorkspaceController.Config(config);
			if (this.config.documentsDirectory !== void 0) validateDocumentsDirectory(this.config.documentsDirectory);
			this.commands = new WorkspaceCommands(ctx);
			this.feed = new WorkspaceFeed(ctx);
			this.projects = new ProjectDirectories(ctx, () => resolveDocumentsDirectory(this.config.documentsDirectory, AbortSignal.timeout(this.config.documentsLookupTimeoutMs)), this.config.managedRootDirectory);
			ctx.plugin(DirectoryPickerController);
		}
		/**
		* Create or idempotently resolve one Workspace over an existing directory.
		* @param request - directory path to register.
		* @returns the Workspace and whether this call created it.
		*/
		create(request) {
			return this.commands.create(request);
		}
		/**
		* Register a canonical user-selected source in the current profile.
		* @param request - existing directory path.
		* @returns the source identity; no visible project is created.
		*/
		registerSource(request) {
			return this.projects.registerSource(request);
		}
		/**
		* Confirm a named project with optional sources and an explicit primary.
		* @param request - stable creation identity and current-profile source ids.
		* @returns the durable project, without a Session or model request.
		*/
		createProject(request) {
			return this.projects.createProject(request);
		}
		/**
		* Prepare an ungrouped chat's generated directory and identity.
		* @param request - stable retry identity.
		* @returns the exact cwd and Session id; no visible project is registered.
		*/
		prepareChat(request) {
			return this.projects.prepareChat(request);
		}
		/**
		* Initialize or reuse the default Workspace during first-use startup. The
		* directory name is fixed, so the Host never renames or relocates an
		* existing default; its initial title is that same name, which browser
		* consumers label in the reader's language.
		* @param signal - caller lifetime; cancels native directory lookup.
		* @returns the durable Workspace, or undefined when first-use initialization is ineligible; creates no Session or message.
		*/
		async initializeDefault(signal) {
			const workspace = await this.ctx.workspaceRegistry.initializeDefault(async () => {
				const timeout = AbortSignal.timeout(this.config.documentsLookupTimeoutMs);
				return await defaultWorkspaceDirectory(this.config.documentsDirectory, AbortSignal.any([signal, timeout]));
			});
			return workspace === void 0 ? void 0 : { workspace: workspaceView(workspace) };
		}
		/**
		* Rename one Workspace to a unique non-blank title.
		* @param request - Workspace identity and proposed title.
		* @returns the updated Workspace projection.
		*/
		rename(request) {
			return this.commands.rename(request);
		}
		/**
		* Remove one Workspace registration while retaining files and Sessions.
		* @param request - Workspace identity to remove.
		* @returns deletion confirmation.
		*/
		delete(request) {
			return this.commands.delete(request);
		}
		/**
		* Move one Workspace within the registry display order.
		* @param request - moved Workspace and optional anchor.
		* @returns the complete resulting Workspace order.
		*/
		insertBefore(request) {
			return this.commands.insertBefore(request);
		}
		/**
		* Move one accounted Session within a Workspace.
		* @param request - Workspace, Session, and optional anchor identities.
		* @returns the updated Workspace projection.
		*/
		insertSessionBefore(request) {
			return this.commands.insertSessionBefore(request);
		}
		/**
		* Hide one known Session from Workspace grouping surfaces.
		* @param request - Session identity to archive.
		* @returns the complete resulting archive set.
		*/
		archiveSession(request) {
			return this.commands.archiveSession(request);
		}
		/**
		* Restore one archived Session to Workspace grouping surfaces.
		* @param request - Session identity to unarchive.
		* @returns the complete resulting archive set.
		*/
		unarchiveSession(request) {
			return this.commands.unarchiveSession(request);
		}
		/**
		* Surface one known unarchived Session ahead of unpinned Sessions.
		* @param request - Session identity to pin.
		* @returns the complete resulting pin set, most recently pinned first.
		*/
		pinSession(request) {
			return this.commands.pinSession(request);
		}
		/**
		* Remove one Session's pin without changing its saved Session order.
		* @param request - Session identity to unpin.
		* @returns the complete resulting pin set, most recently pinned first.
		*/
		unpinSession(request) {
			return this.commands.unpinSession(request);
		}
		/**
		* Stream a complete Workspace baseline followed by ordered increments.
		* @param signal - generation cancellation.
		* @returns baseline followed by ordered Workspace increments.
		*/
		follow(signal) {
			return this.feed.follow(signal);
		}
	};
})();
//#endregion
export { DirectoryPickerController, WorkspaceController, WorkspaceController as default };
