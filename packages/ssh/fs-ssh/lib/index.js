import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { FileSystem, FsError } from "@deepseek-ai/dsh-fs";
import { RemoteOperationError } from "@deepseek-ai/dsh-ssh/protocol";
import { editResultSchema, entriesSchema, infoSchema, pathInfoSchema, targetSchema, textStreamIdSchema, writeResultSchema } from "@deepseek-ai/dsh-ssh/schemas";
import { z } from "zod";
//#region lib/types/index.js
/** Filesystem provider preserving remote identities and helper-owned atomic mutations. */
const errorCodes = {
	FS_NOT_FOUND: true,
	FS_NOT_DIRECTORY: true,
	FS_NOT_TEXT: true,
	FS_NOT_REGULAR_FILE: true,
	FS_TOO_LARGE: true,
	FS_PERMISSION_DENIED: true,
	FS_SANDBOX_DENIED: true,
	FS_IO_ERROR: true,
	FS_STALE_VERSION: true,
	FS_NOT_OBSERVED: true,
	FS_AMBIGUOUS_EDIT: true,
	FS_EDIT_NOT_FOUND: true,
	FS_ABORTED: true
};
/** Remote filesystem paired with the SSH subprocess and sandbox providers. */
var SshFileSystem = class extends FileSystem {
	static inject = ["ssh", "sandboxPolicy"];
	get sandboxMode() {
		return this.ctx.sandboxPolicy.defaultMode;
	}
	async resolve(path, opts) {
		return await this.call("fs.resolve", {
			path,
			cwd: opts?.cwd
		}, targetSchema, opts?.signal);
	}
	processPath(target) {
		return String(target.targetKey);
	}
	fileUrl(target) {
		return pathToFileURL(this.processPath(target)).href;
	}
	contains(parent, child) {
		const path = posix.relative(this.processPath(parent), this.processPath(child));
		return path === "" || !path.startsWith("../") && path !== ".." && !posix.isAbsolute(path);
	}
	async stat(target, signal) {
		return await this.call("fs.stat", { target }, infoSchema.nullable(), signal) ?? void 0;
	}
	async lstat(path, opts, signal) {
		return await this.call("fs.lstat", {
			path,
			cwd: opts?.cwd
		}, pathInfoSchema.nullable(), signal) ?? void 0;
	}
	readText(target, signal) {
		return this.call("fs.readText", { target }, z.string(), signal);
	}
	async streamText(target, signal) {
		const id = await this.call("fs.stream", { target }, textStreamIdSchema, signal);
		const call = this.call.bind(this);
		return (async function* () {
			let ended = false;
			try {
				while (!ended) {
					signal?.throwIfAborted();
					const next = await call("fs.next", { id }, z.object({
						done: z.boolean(),
						value: z.string()
					}).strict(), signal);
					ended = next.done;
					if (next.value.length > 0) yield next.value;
				}
			} finally {
				if (!ended) await call("fs.streamClose", { id }, z.null()).catch(() => {});
			}
		})();
	}
	async readBytes(target, signal, maxBytes) {
		return Buffer.from(await this.call("fs.readBytes", {
			target,
			maxBytes
		}, z.base64(), signal), "base64");
	}
	async readByteRange(target, range, signal) {
		return Buffer.from(await this.call("fs.readRange", {
			target,
			...range
		}, z.base64(), signal), "base64");
	}
	async listDir(target, signal) {
		return await this.call("fs.list", { target }, entriesSchema, signal);
	}
	async writeText(target, content, expected, signal, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		return await this.call("fs.write", {
			target,
			content,
			expected,
			policy
		}, writeResultSchema, signal);
	}
	async editText(target, edit, expected, signal, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		return await this.call("fs.edit", {
			target,
			edit,
			expected,
			policy
		}, editResultSchema, signal);
	}
	async call(method, params, schema, signal) {
		try {
			return await this.ctx.ssh.request(method, params, schema, signal);
		} catch (error) {
			if (error instanceof RemoteOperationError && error.code !== void 0 && Object.hasOwn(errorCodes, error.code)) throw new FsError(error.message, error.code, { cause: error });
			throw new FsError(error instanceof Error ? error.message : String(error), signal?.aborted ? "FS_ABORTED" : "FS_IO_ERROR", { cause: error });
		}
	}
};
//#endregion
export { SshFileSystem, SshFileSystem as default };
