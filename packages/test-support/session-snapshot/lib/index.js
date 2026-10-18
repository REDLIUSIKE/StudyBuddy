import { createRequire } from "node:module";
import { cp, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, client, methods, ndJsonStream } from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { resolveExampleLaunch } from "@deepseek-ai/dsh-loader-smoke";
import { clearedProxyEnv } from "@deepseek-ai/dsh-http-proxy";
import { parseSessionFormatLogFilename, sessionFormatLogFilename } from "@deepseek-ai/dsh-session-format";
import { SESSION_FORMAT_VERSION, decodeSeqRanges } from "@deepseek-ai/dsh-session";
import { prepareSessionSnapshotFixtureForComparison } from "@deepseek-ai/dsh-llm-replay";
import { isSurfaceEligibleType } from "@deepseek-ai/dsh-session/surface";
//#region lib/types/identity.js
/** Relationship-preserving identity redaction for committed session snapshots. */
const UUID_FRAGMENT_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LEGACY_TOKEN_RE = /^\{\{(?:sessionId|messageId)\}\}$/;
const CANONICAL_TOKEN_RE = /^\{\{(session|message|approval|workflow|command|rpc|retry|id):([1-9]\d*)\}\}$/;
const ID_KEY_RE = /(?:^id$|Id$|Ids$)/;
function isRecord$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseLog(log) {
	return {
		records: log.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => JSON.parse(line)),
		trailingNewline: log.endsWith("\n")
	};
}
function messageId(value) {
	if (!isRecord$1(value) || typeof value.id !== "string" || typeof value.role !== "string" || !Array.isArray(value.content) || !isRecord$1(value.source)) return void 0;
	return value.id;
}
function redactedCandidate(value) {
	return UUID_FRAGMENT_RE.test(value) || LEGACY_TOKEN_RE.test(value) || CANONICAL_TOKEN_RE.test(value);
}
/**
* Replace volatile opaque ids while preserving equality relationships across a parent and its child logs.
* @param logs - one scenario's primary-first session JSONL fixtures.
* @returns compact JSONL with typed first-seen identity tokens.
*/
function redactSessionSnapshotIds(logs) {
	const parsed = logs.map(parseLog);
	const tokenByValue = /* @__PURE__ */ new Map();
	const nextByKind = /* @__PURE__ */ new Map();
	const claim = (value, kind, always = false) => {
		if (typeof value !== "string" || value.length === 0 || tokenByValue.has(value)) return;
		if (!always && !redactedCandidate(value)) return;
		const canonical = CANONICAL_TOKEN_RE.exec(value);
		if (canonical !== null) {
			const canonicalKind = canonical[1];
			const ordinal = Number(canonical[2]);
			nextByKind.set(canonicalKind, Math.max(nextByKind.get(canonicalKind) ?? 0, ordinal));
			tokenByValue.set(value, value);
			return;
		}
		const next = (nextByKind.get(kind) ?? 0) + 1;
		nextByKind.set(kind, next);
		tokenByValue.set(value, `{{${kind}:${next}}}`);
	};
	for (const log of parsed) {
		const header = log.records[0];
		if (header?.type === "session") claim(header.id, "session", true);
	}
	const collect = (value, recordType) => {
		if (typeof value === "string") {
			for (const match of value.matchAll(/\bas message ([0-9a-f-]{36})\b/gi)) claim(match[1], "message");
			for (const match of value.matchAll(/\bAnonymous user: ([0-9a-f-]{36})\b/gi)) claim(match[1], "id");
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) collect(item, recordType);
			return;
		}
		if (!isRecord$1(value)) return;
		const identifiedMessage = messageId(value);
		if (identifiedMessage !== void 0) claim(identifiedMessage, "message");
		for (const [childKey, item] of Object.entries(value)) {
			if (recordType === "approval/asked" || recordType === "approval/decided") {
				if (childKey === "id") claim(item, "approval");
			} else if (childKey === "commandId") claim(item, "command", true);
			else if (childKey === "rpcId") claim(item, "rpc", true);
			else if (childKey === "retryId") claim(item, "retry");
			else if (childKey === "runId") claim(item, "workflow");
			else if (ID_KEY_RE.test(childKey)) claim(item, "id");
			collect(item, recordType);
		}
	};
	for (const log of parsed) for (const record of log.records) {
		if (record.type === "feedback/message-put" && isRecord$1(record.data) && isRecord$1(record.data.item)) claim(record.data.item.version, "id");
		collect(record, record.type);
	}
	const replacements = [...tokenByValue].sort(([left], [right]) => right.length - left.length);
	const replace = (value) => {
		if (typeof value === "string") {
			const exact = tokenByValue.get(value);
			if (exact !== void 0) return exact;
			let output = value;
			for (const [source, token] of replacements) output = output.split(source).join(token);
			return output;
		}
		if (Array.isArray(value)) return value.map(replace);
		if (isRecord$1(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
		return value;
	};
	return parsed.map((log) => {
		const content = log.records.map((record) => JSON.stringify(replace(record))).join("\n");
		return log.trailingNewline ? `${content}\n` : content;
	});
}
//#endregion
//#region lib/types/launcher.js
/**
* Shared launcher for ACP tests that drive an agent subprocess over JSON-RPC
* stdio. It owns source-or-built launch resolution, workspace environment,
* stdout tee, SDK client, update collection, permission fallback, and process
* shutdown so e2e and snapshot suites do not each reconstruct that boundary.
*
* @module @deepseek-ai/dsh-session-snapshot/launcher
*/
const EXIT_MARKER_GRACE_MS = 250;
/**
* Boot an ACP agent subprocess and connect an SDK client to its stdio.
*
* @param options Agent paths, cwd, environment, and optional permission handler.
* @returns The running process, connected client, captures, and shutdown handle.
*/
function launchAcpTestAgent(options) {
	const { agent, cwd } = options;
	const selectedConfig = options.configPath ?? agent.configPath;
	const launch = resolveExampleLaunch({
		srcBin: agent.binScript,
		libBin: agent.libBinScript,
		configArgs: agent.profile === void 0 ? ["--config", selectedConfig] : profileArgs(agent.profile, agent.configPath, selectedConfig, options.env?.DSH_SNAPSHOT, cwd),
		tsconfigPath: agent.tsconfigPath,
		...agent.profile === void 0 ? {} : { sourceImport: "tsx/esm" },
		env: {
			...options.env,
			DSH_HOME: join(cwd, ".dsh"),
			DSH_AGENTS_HOME: join(cwd, ".agents")
		}
	});
	const child = spawn(launch.command, launch.args, {
		cwd,
		env: {
			...process.env,
			...launch.env
		},
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		]
	});
	const childFailure = new Promise((resolve) => child.on("error", resolve));
	const spawned = Promise.race([new Promise((resolve) => child.once("spawn", resolve)), childFailure.then((error) => {
		throw error;
	})]);
	spawned.catch(() => void 0);
	const stderrChunks = [];
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
	const rawBuffers = [];
	const passthrough = new Readable({ read() {} });
	const updates = [];
	const updateWaiters = [];
	let updateStreamFailure;
	const closeUpdateStream = () => {
		if (updateStreamFailure !== void 0) return;
		updateStreamFailure = /* @__PURE__ */ new Error("ACP test agent update stream closed before a matching session update arrived");
		for (const waiter of updateWaiters.splice(0)) waiter.reject(updateStreamFailure);
	};
	child.stdout.on("data", (buffer) => {
		rawBuffers.push(buffer);
		passthrough.push(buffer);
	});
	child.stdout.on("end", () => {
		passthrough.push(null);
	});
	const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(passthrough));
	const inFlightClientCallbacks = /* @__PURE__ */ new Set();
	const trackClientCallback = (callback) => {
		const pending = Promise.resolve().then(callback);
		inFlightClientCallbacks.add(pending);
		const untrack = () => {
			inFlightClientCallbacks.delete(pending);
		};
		pending.then(untrack, untrack);
		return pending;
	};
	const requestPermission = options.requestPermission ?? (() => Promise.resolve({ outcome: { outcome: "cancelled" } }));
	const connection = client({ name: "deepseek-harness-acp-test-client" }).onNotification(methods.client.session.update, ({ params }) => {
		return trackClientCallback(() => {
			updates.push(params.update);
			for (let index = updateWaiters.length - 1; index >= 0; index--) {
				const waiter = updateWaiters[index];
				/* v8 ignore next 1 -- index is bounded by the array length */
				if (waiter === void 0) continue;
				let matches;
				try {
					matches = waiter.match(params.update);
				} catch (error) {
					updateWaiters.splice(index, 1);
					waiter.reject(error);
					continue;
				}
				if (!matches) continue;
				updateWaiters.splice(index, 1);
				waiter.resolve(params.update);
			}
		});
	}).onRequest(methods.client.session.requestPermission, ({ params }) => trackClientCallback(() => requestPermission(params))).connect(stream);
	const context = connection.agent;
	const client$1 = {
		closed: connection.closed,
		initialize: (params) => context.request(methods.agent.initialize, params),
		newSession: (params) => context.request(methods.agent.session.new, params),
		/* v8 ignore next -- exercised by the real-process ACP control-surface conformance e2e. */
		listSessions: (params) => context.request(methods.agent.session.list, params),
		/* v8 ignore next -- exercised by the real-process ACP control-surface conformance e2e. */
		resumeSession: (params) => context.request(methods.agent.session.resume, params),
		/* v8 ignore next -- exercised by the real-process ACP control-surface conformance e2e. */
		closeSession: (params) => context.request(methods.agent.session.close, params),
		/* v8 ignore next -- exercised by the real-process ACP control-surface conformance e2e. */
		setSessionConfigOption: (params) => context.request(methods.agent.session.setConfigOption, params),
		prompt: (params) => context.request(methods.agent.session.prompt, params),
		cancel: (params) => context.notify(methods.agent.session.cancel, params)
	};
	const stdioClosed = new Promise((resolve) => child.once("close", () => {
		resolve();
	}));
	const drained = Promise.all([stdioClosed, connection.closed]).then(async () => {
		while (inFlightClientCallbacks.size > 0) await Promise.allSettled([...inFlightClientCallbacks]);
	});
	connection.closed.then(closeUpdateStream);
	return {
		child,
		spawned,
		client: client$1,
		updates,
		rawStdout: () => Buffer.concat(rawBuffers).toString("utf8"),
		stderr: () => stderrChunks.join(""),
		waitForUpdate(match) {
			if (updateStreamFailure !== void 0) return Promise.reject(updateStreamFailure);
			return new Promise((resolve, reject) => updateWaiters.push({
				match,
				resolve,
				reject
			}));
		},
		async close(signal) {
			try {
				await spawned;
			} catch (error) {
				await drained;
				closeUpdateStream();
				throw error;
			}
			if (!isRunning(child)) {
				await drained;
				closeUpdateStream();
				return;
			}
			const exited = waitForExit(child);
			if (signal === void 0) child.stdin.end();
			else child.kill(signal);
			const failure = await Promise.race([exited.then(() => void 0), childFailure]);
			if (failure === void 0) {
				await drained;
				closeUpdateStream();
				return;
			}
			const propagateFailureAfterDrain = async () => {
				await drained;
				closeUpdateStream();
				throw failure;
			};
			if (!isRunning(child) || await exitMarkerWithinGrace(exited)) return propagateFailureAfterDrain();
			const fallbackError = Promise.withResolvers();
			const observeFallbackError = (error) => {
				fallbackError.resolve(error);
			};
			child.once("error", observeFallbackError);
			if (!child.kill("SIGKILL")) {
				child.off("error", observeFallbackError);
				if (!isRunning(child) || await exitMarkerWithinGrace(exited)) return propagateFailureAfterDrain();
				closeUpdateStream();
				throw new AggregateError([failure, /* @__PURE__ */ new Error("Fallback SIGKILL was not accepted by the child process")], "ACP test agent failed and fallback termination was refused");
			}
			const fallbackFailure = await Promise.race([exited.then(() => void 0), fallbackError.promise]);
			child.off("error", observeFallbackError);
			if (fallbackFailure !== void 0) {
				closeUpdateStream();
				throw new AggregateError([failure, fallbackFailure], "ACP test agent failed and fallback termination was refused");
			}
			return propagateFailureAfterDrain();
		}
	};
}
/** Build one dsh profile invocation from the base and optional scenario patches. */
function profileArgs(profile, basePatch, selectedPatch, snapshotMode, cwd) {
	const base = resolve(cwd, basePatch);
	const selected = resolve(cwd, selectedPatch);
	const patches = snapshotMode === "replay" ? [base, replayPatchPath(selected)] : [...new Set([base, selected])];
	const materializedRoot = join(cwd, ".dsh-profile-patches");
	mkdirSync(materializedRoot, { recursive: true });
	const materializedDir = mkdtempSync(join(materializedRoot, "launch-"));
	return [
		"--profile",
		profile,
		...patches.map((file, index) => materializeProfilePatch(file, cwd, profile, materializedDir, index)).flatMap((file) => ["--patch", file])
	];
}
/** Derive the replay-only sibling patch selected by the former app-bin swap. */
function replayPatchPath(source) {
	const replayName = basename(source).replace(/cordis\.ya?ml$/, "cordis.snapshot.yml");
	return resolve(dirname(source), replayName);
}
/** Parse a bare package or subpath specifier into its package name. */
function barePackageName(specifier) {
	if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":")) return void 0;
	const [first = "", second = ""] = specifier.split("/");
	return first.startsWith("@") ? `${first}/${second}` : first;
}
/** Find a bare package's directory from the authored patch's module-resolution anchor. */
function packageDirFromPatch(source, packageName) {
	for (const searchPath of createRequire(pathToFileURL(source)).resolve.paths(packageName) ?? []) {
		const candidate = join(searchPath, packageName);
		if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
	}
}
/**
* Install an authored patch's resolvable bare package into the temporary
* profile. This mirrors `dsh plugin` while retaining the bare entry
* name and package identity used by request metadata.
*/
function linkProfilePackage(source, cwd, profile, packageName) {
	const packageDir = packageDirFromPatch(source, packageName);
	if (packageDir === void 0) return;
	const link = join(cwd, ".dsh", "profiles", profile, "node_modules", packageName);
	mkdirSync(dirname(link), { recursive: true });
	if (existsSync(link)) {
		if (realpathSync(link) !== packageDir) throw new Error(`snapshot profile package ${packageName} resolves to two directories`);
		return;
	}
	/* v8 ignore next -- Windows uses directory junctions; the platform lane owns that branch. */
	symlinkSync(packageDir, link, process.platform === "win32" ? "junction" : "dir");
}
/**
* Copy one authored patch into the launch cwd with relative plugin names made absolute.
* @param source - authored profile patch path.
* @param cwd - isolated process cwd whose profile receives package links.
* @param profile - profile whose local package lookup receives the test links.
* @param targetDir - existing directory that owns the materialized patch.
* @param index - stable patch ordinal used in the output filename.
* @returns absolute materialized patch path.
*/
function materializeProfilePatch(source, cwd, profile, targetDir, index) {
	const parsed = yaml.load(readFileSync(source, "utf8"), { schema: entryListSchema });
	if (!Array.isArray(parsed)) throw new Error(`snapshot profile patch must be a top-level array: ${source}`);
	const patches = parsed;
	const baseDir = dirname(source);
	const resolveName = (value) => {
		const packageName = barePackageName(value);
		if (packageName !== void 0) linkProfilePackage(source, cwd, profile, packageName);
		return value.startsWith("./") || value.startsWith("../") ? pathToFileURL(resolve(baseDir, value)).href : value;
	};
	const visitEntry = (entry) => {
		entry.name = resolveName(entry.name);
		if (entry.group === true && Array.isArray(entry.config)) for (const child of entry.config) visitEntry(child);
	};
	for (const patch of patches) {
		if (typeof patch.name === "string") patch.name = resolveName(patch.name);
		for (const entry of patch.insert ?? []) visitEntry(entry);
	}
	const target = join(targetDir, `${String(index)}-${basename(source)}`);
	writeFileSync(target, yaml.dump(patches, {
		schema: entryListSchema,
		lineWidth: -1,
		noRefs: true
	}));
	return target;
}
/** Resolve once a running child exits. */
function waitForExit(child) {
	return new Promise((resolve) => child.once("exit", () => {
		resolve();
	}));
}
/** Give an accepted Windows termination request a bounded window to publish its exit marker. */
function exitMarkerWithinGrace(exited) {
	return Promise.race([exited.then(() => true), new Promise((resolve) => {
		setTimeout(() => {
			resolve(false);
		}, EXIT_MARKER_GRACE_MS).unref();
	})]);
}
/** Whether the child still lacks either OS termination marker. */
function isRunning(child) {
	return child.exitCode === null && child.signalCode === null;
}
//#endregion
//#region lib/types/session-files.js
/** Immutable Session-generation filenames used by recorded-session fixtures. */
const FIXTURE_FILE = /^session(?:\.([1-9]\d*))?(?:\.v([1-9]\d*))?\.jsonl$/u;
function nonNegativeSafeInteger(value, label) {
	if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new Error(`${label} must be a non-negative safe integer`);
}
/**
* Return the canonical fixture filename for one parent/ordinal and generation.
*
* @param index - Parent `0` or a positive child/ordinal slot.
* @param version - Physical format generation; `0` is omitted.
* @returns The lowercase canonical JSONL filename.
*/
function sessionFixtureName(index, version) {
	nonNegativeSafeInteger(index, "session fixture index");
	nonNegativeSafeInteger(version, "Session format version");
	return `session${index === 0 ? "" : `.${index}`}${version === 0 ? "" : `.v${version}`}.jsonl`;
}
/**
* Name the native-writer oracle for a retained historical replay role.
* This expected output never participates in replay generation selection.
* @param index - Parent `0` or a positive child/ordinal slot.
* @returns The expected-output JSONL basename.
*/
function writerSnapshotName(index) {
	nonNegativeSafeInteger(index, "writer snapshot index");
	return `writer${index === 0 ? "" : `.${index}`}.expected.jsonl`;
}
/**
* Parse one canonical recorded-session fixture filename.
*
* @param name - Basename from a scenario directory.
* @returns Parsed role and generation, or `undefined` for an unrelated file.
*/
function parseSessionFixtureName(name) {
	const match = FIXTURE_FILE.exec(name);
	if (match === null) {
		if (name.startsWith("session") && name.endsWith(".jsonl")) throw new Error(`invalid session fixture name: ${name}`);
		return;
	}
	const index = match[1] === void 0 ? 0 : Number(match[1]);
	const version = match[2] === void 0 ? 0 : Number(match[2]);
	if (!Number.isSafeInteger(index) || !Number.isSafeInteger(version)) throw new Error(`invalid session fixture name: ${name}`);
	return {
		index,
		version,
		name
	};
}
/**
* Select the highest generation for every parent/ordinal fixture role.
* Older generations remain in the directory but do not count as extra Sessions.
*
* @param names - File basenames in one scenario directory.
* @returns Parent first, followed by contiguous child/ordinal roles.
*/
function sessionFixtureFiles(names) {
	const selected = /* @__PURE__ */ new Map();
	const identities = /* @__PURE__ */ new Set();
	for (const name of names) {
		const fixture = parseSessionFixtureName(name);
		if (fixture === void 0) continue;
		const identity = `${fixture.index}/${fixture.version}`;
		if (identities.has(identity)) throw new Error(`duplicate session fixture generation: ${name}`);
		identities.add(identity);
		const previous = selected.get(fixture.index);
		if (previous === void 0 || fixture.version > previous.version) selected.set(fixture.index, fixture);
	}
	if (selected.get(0) === void 0) throw new Error("missing parent session fixture");
	const ordered = [...selected.values()].sort((left, right) => left.index - right.index);
	for (const [offset, fixture] of ordered.entries()) if (fixture.index !== offset) throw new Error(`session fixture roles must be contiguous: expected index ${offset}, found ${fixture.name}`);
	return ordered;
}
/**
* Validate and order a scenario directory's selected Session fixture filenames.
*
* @param names - File basenames in one scenario directory.
* @returns Highest-generation parent and child/ordinal filenames.
*/
function sessionFixtureNames(names) {
	return sessionFixtureFiles(names).map((file) => file.name);
}
/**
* Read the declared physical generation from one Session JSONL header.
*
* @param content - Complete UTF-8 JSONL content.
* @param label - Diagnostic filename or path.
* @returns The declared non-negative format generation.
*/
function sessionHeaderVersion(content, label) {
	const line = content.split(/\r?\n/u).find((candidate) => candidate.trim().length > 0);
	if (line === void 0) throw new Error(`${label}: session fixture is empty`);
	let value;
	try {
		value = JSON.parse(line);
	} catch (error) {
		throw new Error(`${label}: session header contains invalid JSON`, { cause: error });
	}
	if (value === null || typeof value !== "object" || Array.isArray(value) || value.type !== "session") throw new Error(`${label}: first record must be a Session header`);
	const version = value.version;
	if (!Number.isSafeInteger(version) || version < 0 || Object.is(version, -0)) throw new Error(`${label}: Session header version must be a non-negative safe integer`);
	return version;
}
/**
* Require one fixture's canonical filename generation to equal its header.
*
* @param name - Canonical fixture basename.
* @param content - Complete UTF-8 JSONL content.
* @returns The validated format generation.
*/
function assertSessionFixtureVersion(name, content) {
	const fixture = parseSessionFixtureName(name);
	if (fixture === void 0) throw new Error(`not a session fixture name: ${name}`);
	const first = content.split(/\r?\n/u).find((candidate) => candidate.trim().length > 0);
	if (first !== void 0) {
		let projected;
		try {
			projected = JSON.parse(first);
		} catch {
			projected = void 0;
		}
		if (projected !== null && typeof projected === "object" && !Array.isArray(projected) && projected.type === "session" && !Object.hasOwn(projected, "version")) {
			if (fixture.version !== 0) throw new Error(`${name}: a versionless projected Session header is format v0`);
			return 0;
		}
	}
	const headerVersion = sessionHeaderVersion(content, name);
	if (headerVersion !== fixture.version) throw new Error(`${name}: filename declares Session format v${fixture.version}, header declares v${headerVersion}`);
	return headerVersion;
}
/**
* Return the canonical persistence basename for one generation and compression.
*
* @param version - Physical format generation; `0` is omitted.
* @param compression - Backend compression mode.
* @returns The canonical persistence basename.
*/
function persistedSessionFilename(version, compression = "raw") {
	return `${sessionFormatLogFilename(version)}${compression === "zstd" ? ".zstd" : ""}`;
}
/**
* Parse a canonical persistence basename from a Session's own directory.
*
* @param name - Candidate basename.
* @returns Its generation and compression, or `undefined` for noise and noncanonical names.
*/
function parsePersistedSessionFilename(name) {
	const compression = name.endsWith(".zstd") ? "zstd" : "raw";
	const version = parseSessionFormatLogFilename(compression === "zstd" ? name.slice(0, -5) : name);
	if (version === void 0) return void 0;
	return {
		version,
		compression,
		name
	};
}
/**
* Select one highest-generation persistence path per physical Session directory.
*
* @param paths - Relative or absolute paths beneath a sessions root.
* @param compression - Compression selected by the snapshot composition.
* @returns Stable path order with older generations and filesystem noise omitted.
*/
function latestPersistedSessionPaths(paths, compression = "raw") {
	const selected = /* @__PURE__ */ new Map();
	for (const path of paths) {
		const parsed = parsePersistedSessionFilename(basename(path));
		if (parsed === void 0 || parsed.compression !== compression) continue;
		const directory = dirname(path);
		const previous = selected.get(directory);
		if (previous === void 0 || parsed.version > previous.version) selected.set(directory, {
			path,
			version: parsed.version
		});
	}
	return [...selected.values()].map((entry) => entry.path).sort();
}
/**
* Require one persistence basename's generation to equal its Session header.
*
* @param name - Canonical persistence basename.
* @param content - Complete uncompressed UTF-8 JSONL content.
* @returns The validated generation.
*/
function assertPersistedSessionVersion(name, content) {
	const persisted = parsePersistedSessionFilename(name);
	if (persisted === void 0) throw new Error(`not a canonical Session persistence filename: ${name}`);
	const headerVersion = sessionHeaderVersion(content, name);
	if (headerVersion !== persisted.version) throw new Error(`${name}: filename declares Session format v${persisted.version}, header declares v${headerVersion}`);
	return headerVersion;
}
//#endregion
//#region lib/types/workspace.js
/** Capture readable, path-stable workspace state for recorded-session tests. */
/** Marker that lets Git retain an expected empty directory without becoming expected workspace state. */
const EMPTY_WORKSPACE_MARKER = ".empty";
function textContent(bytes) {
	if (bytes.includes(0)) return void 0;
	const text = bytes.toString("utf8");
	return Buffer.from(text, "utf8").equals(bytes) ? text : void 0;
}
/**
* Capture one workspace without resolving links or depending on host path separators.
* @param root - Absolute directory whose user-visible state is captured.
* @param options - Harness-owned immediate children to omit.
* @returns Stable entries sorted by relative path.
*/
async function captureWorkspaceSnapshot(root, options = {}) {
	const ignoredRootEntries = new Set(options.ignoredRootEntries ?? []);
	const visit = async (directory, segments) => {
		const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => segments.length > 0 || !ignoredRootEntries.has(entry.name)).sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
		const captured = [];
		for (const entry of entries) {
			const childSegments = [...segments, entry.name];
			const path = childSegments.join("/");
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				const children = await visit(absolute, childSegments);
				captured.push(...children.length === 0 ? [{
					path,
					kind: "empty-directory"
				}] : children);
			} else if (entry.isFile()) {
				const bytes = await readFile(absolute);
				const content = textContent(bytes);
				captured.push(content === void 0 ? {
					path,
					kind: "binary",
					base64: bytes.toString("base64")
				} : {
					path,
					kind: "text",
					content
				});
			} else captured.push({
				path,
				kind: "symlink",
				target: await readlink(absolute)
			});
		}
		return captured;
	};
	return visit(root, []);
}
/**
* Capture a committed `workspace.expected/` tree, excluding its Git-only empty marker.
* @param root - Absolute expected-workspace directory.
* @returns Stable expected entries.
*/
function captureExpectedWorkspaceSnapshot(root) {
	return captureWorkspaceSnapshot(root, { ignoredRootEntries: [EMPTY_WORKSPACE_MARKER] });
}
//#endregion
//#region lib/types/harness.js
/**
* Shared subprocess harness for ACP snapshot suites. A library module driven by
* the suite factory in ./suite.ts (and directly by harness-level specs); each
* profile adapter names its own agent-under-test paths.
*
* It boots the REAL agent bin subprocess via the cordis Loader (so the
* export-shape bug class stays guarded — see docs/postmortem/0001), drives it
* over real ACP JSON-RPC stdio with a deterministic input script, tees raw
* stdout (for the expected-output and purity checks) into an SDK client app,
* and — in record mode — harvests the persisted session JSONL after a graceful
* shutdown flush. The pure normalizers in ./normalize.ts turn the captured
* stdout frames and the session-log events into stable, snapshot-able text.
*
* See packages/test-support/session-snapshot/README.md.
*
* @module @deepseek-ai/dsh-session-snapshot/harness
*/
const DEFAULT_WAIT_TIMEOUT_MS = 1e4;
const WAIT_POLL_INTERVAL_MS = 10;
/**
* Derive the stable, fixed-length logical spill prefix; never allocate files here.
* Windows uses a two-character-shorter root because drive resolution adds its drive prefix.
* @param fixtureFile - The scenario fixture whose parent directory provides the stable identity.
* @param platform - the host platform, injectable for unit coverage.
* @returns the root-relative snapshot spill directory.
*/
function snapshotSpillRoot(fixtureFile, platform = process.platform) {
	const scenario = basename(dirname(fixtureFile));
	const key = createHash("sha256").update(scenario).digest("hex").slice(0, 9);
	return `${platform === "win32" ? "/t" : "/tmp"}/dsh-acp-snap-${key}`;
}
/**
* Run a scenario end-to-end against a freshly-spawned subprocess. Owns the
* child and its generated dirs; always tears them down. Returns the captured stdout
* and (record mode) the harvested session-log path.
*
* @param input The scenario's input script (steps + optional permission answers).
* @param opts The agent to boot, the mode, and the fixture wiring.
* @returns The captured stdout/stderr, session id, generated cwd, and harvested logs.
*/
async function runScenario(input, opts) {
	const cwd = await mkdtemp(join(opts.workspaceParent ?? tmpdir(), "acp-snap-cwd-"));
	const cwdAliases = [...new Set([realpathSync(cwd), realpathSync.native(cwd)])];
	const sessionsRoot = await mkdtemp(join(tmpdir(), "acp-snap-sessions-"));
	let spillRoot;
	let launched;
	let sessionId;
	let sessionLogs = [];
	const outcome = await (async () => {
		spillRoot = await mkdtemp(join(tmpdir(), "acp-snap-spill-"));
		if (opts.workspaceDir !== void 0 && existsSync(opts.workspaceDir)) await cp(opts.workspaceDir, cwd, { recursive: true });
		await opts.prepareWorkspace?.(cwd);
		const initialWorkspace = await captureWorkspaceSnapshot(cwd, { ignoredRootEntries: [
			".agents",
			".dsh",
			".dsh-profile-patches",
			".dsh-snapshot-stream-ready"
		] });
		const env = {
			...opts.env,
			...clearedProxyEnv(),
			DSH_SNAPSHOT: opts.mode,
			DSH_SNAPSHOT_FILE: opts.fixtureFile,
			DSH_SNAPSHOT_SESSIONS_ROOT: sessionsRoot,
			DSH_SNAPSHOT_SPILL_ROOT: spillRoot,
			DSH_SNAPSHOT_SPILL_LOCATOR_ROOT: snapshotSpillRoot(opts.fixtureFile),
			DSH_HOME: join(cwd, ".dsh"),
			DSH_AGENTS_HOME: join(cwd, ".agents"),
			...opts.overrideFile !== void 0 ? { DSH_SNAPSHOT_OVERRIDE: opts.overrideFile } : {},
			...opts.childFiles !== void 0 && opts.childFiles.length > 0 ? { DSH_SNAPSHOT_CHILD_FILES: opts.childFiles.join(delimiter) } : {}
		};
		const permissionQueue = [...input.permissionAnswers ?? []];
		let scriptError;
		launched = launchAcpTestAgent({
			agent: opts.agent,
			cwd,
			...opts.configPath !== void 0 ? { configPath: opts.configPath } : {},
			env,
			requestPermission(params) {
				const answer = permissionQueue.shift();
				if (answer === void 0) return Promise.resolve({ outcome: { outcome: "cancelled" } });
				const option = params.options.find((o) => o.kind === answer.kind);
				if (option === void 0) {
					scriptError = /* @__PURE__ */ new Error(`snapshot-harness: scripted permission answer ${answer.kind} not among the offered options [${params.options.map((o) => o.kind).join(", ")}]`);
					return Promise.resolve({ outcome: { outcome: "cancelled" } });
				}
				return Promise.resolve({ outcome: {
					outcome: "selected",
					optionId: option.optionId
				} });
			}
		});
		const active = launched;
		await active.spawned;
		const { client } = active;
		for (const step of input.steps) {
			await runStep(client, step, cwd, (match) => active.waitForUpdate(match), () => sessionId, (id) => {
				sessionId = id;
			}, (id, timeoutMs, minimumTurn) => waitForPersistedTurnStart(sessionsRoot, id, timeoutMs, minimumTurn), (id, timeoutMs) => waitForPersistedTurnEnd(sessionsRoot, id, timeoutMs), (child, timeoutMs, minimumTurn) => waitForPersistedChildTurnEnd(sessionsRoot, child, timeoutMs, minimumTurn), (id, phase, timeoutMs) => waitForPersistedGoalPhase(sessionsRoot, id, phase, timeoutMs), (id, text, timeoutMs) => waitForPersistedInboxMessage(sessionsRoot, id, text, timeoutMs), (id, timeoutMs) => waitForPersistedTitleAfterTurnEnd(sessionsRoot, id, timeoutMs), (id, type, timeoutMs) => waitForPersistedEventAfterTurnEnd(sessionsRoot, id, type, timeoutMs));
			if (scriptError !== void 0) throw scriptError;
		}
		await active.close();
		sessionLogs = await harvestSessionLogs(sessionsRoot);
		const finalWorkspace = await captureWorkspaceSnapshot(cwd, { ignoredRootEntries: [
			".agents",
			".dsh",
			".dsh-profile-patches",
			".dsh-snapshot-stream-ready"
		] });
		return {
			rawStdout: launched.rawStdout(),
			stderr: launched.stderr(),
			cwd,
			cwdAliases,
			initialWorkspace,
			finalWorkspace,
			...sessionId !== void 0 ? { sessionId } : {},
			sessionLogs
		};
	})().then((value) => ({
		status: "fulfilled",
		value
	}), (error) => {
		const stderr = launched?.stderr() ?? "";
		return {
			status: "rejected",
			error: stderr === "" ? error : new Error(`snapshot-harness: scenario failed: ${String(error)}\nagent stderr:\n${stderr}`, { cause: error })
		};
	});
	const cleanupResults = [];
	const cleanup = async (action) => {
		cleanupResults.push(...await Promise.allSettled([action()]));
	};
	/* v8 ignore next 1 -- launch itself can only throw on a defensive synchronous spawn API failure */
	await cleanup(() => launched?.close("SIGKILL") ?? Promise.resolve());
	await cleanup(() => rm(cwd, {
		recursive: true,
		force: true
	}));
	await cleanup(() => rm(sessionsRoot, {
		recursive: true,
		force: true
	}));
	const allocatedSpillRoot = spillRoot;
	if (allocatedSpillRoot !== void 0) await cleanup(() => rm(allocatedSpillRoot, {
		recursive: true,
		force: true
	}));
	const cleanupFailures = cleanupResults.filter((result) => result.status === "rejected").map((result) => result.reason);
	if (cleanupFailures.length > 0) throw new AggregateError(outcome.status === "rejected" ? [outcome.error, ...cleanupFailures] : cleanupFailures, outcome.status === "rejected" ? "snapshot scenario and cleanup failed" : "snapshot cleanup failed");
	if (outcome.status === "rejected") throw outcome.error;
	return outcome.value;
}
/** Drive one input step over the client connection. */
async function runStep(client, step, cwd, waitForUpdate, getSessionId, setSessionId, waitForTurnStart, waitForTurnEnd, waitForChildTurnEnd, waitForGoalPhase, waitForInboxMessage, waitForTitleAfterTurnEnd, waitForEventAfterTurnEnd) {
	switch (step.op) {
		case "initialize":
			await client.initialize({
				protocolVersion: PROTOCOL_VERSION,
				clientCapabilities: {}
			});
			return;
		case "newSession": {
			const { sessionId } = await client.newSession({
				cwd,
				mcpServers: []
			});
			setSessionId(sessionId);
			return;
		}
		case "newSessionExpectError":
			await client.newSession({
				cwd,
				mcpServers: [],
				...step.additionalDirectories !== void 0 ? { additionalDirectories: step.additionalDirectories } : {}
			}).then(() => {
				throw new Error("snapshot-harness: expected session/new to be rejected but it succeeded");
			}, () => {});
			return;
		case "prompt": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: prompt before newSession");
			await client.prompt({
				sessionId,
				prompt: [{
					type: "text",
					text: step.text
				}]
			});
			return;
		}
		case "promptContent": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: promptContent before newSession");
			await client.prompt({
				sessionId,
				prompt: step.content
			});
			return;
		}
		case "promptAndWaitForAgentMessage": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: promptAndWaitForAgentMessage before newSession");
			const updateDone = waitForUpdate((update) => update.sessionUpdate === "agent_message_chunk" && update.content.type === "text" && update.content.text === step.waitForText);
			await client.prompt({
				sessionId,
				prompt: [{
					type: "text",
					text: step.text
				}]
			});
			await updateDone;
			return;
		}
		case "promptExpectError": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: promptExpectError before newSession");
			await client.prompt({
				sessionId,
				prompt: [{
					type: "text",
					text: step.text
				}]
			}).then(() => {
				throw new Error("snapshot-harness: expected the prompt to fail but it succeeded");
			}, () => {});
			return;
		}
		case "promptAndCancel": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: promptAndCancel before newSession");
			const promptDone = client.prompt({
				sessionId,
				prompt: [{
					type: "text",
					text: step.text
				}]
			});
			if (step.waitForFile !== void 0) await waitForWorkspaceFile(cwd, step.waitForFile.path, step.waitForFile.timeoutMs);
			else await waitForTurnStart(sessionId);
			await client.cancel({ sessionId });
			await promptDone;
			return;
		}
		case "waitForFile":
			await waitForWorkspaceFile(cwd, step.path, step.timeoutMs);
			return;
		case "waitForTurnEnd": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForTurnEnd before newSession");
			await waitForTurnEnd(sessionId, step.timeoutMs);
			return;
		}
		case "waitForSubagentTurnEnd":
			await waitForChildTurnEnd(step.child ?? 1, step.timeoutMs, step.minimumTurn);
			return;
		case "waitForGoalPhase": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForGoalPhase before newSession");
			await waitForGoalPhase(sessionId, step.phase, step.timeoutMs);
			return;
		}
		case "waitForInboxMessage": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForInboxMessage before newSession");
			await waitForInboxMessage(sessionId, step.text, step.timeoutMs);
			return;
		}
		case "waitForTitleAfterTurnEnd": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForTitleAfterTurnEnd before newSession");
			await waitForTitleAfterTurnEnd(sessionId, step.timeoutMs);
			return;
		}
		case "waitForEventAfterTurnEnd": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForEventAfterTurnEnd before newSession");
			await waitForEventAfterTurnEnd(sessionId, step.type, step.timeoutMs);
			return;
		}
		case "waitForTurnStart": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: waitForTurnStart before newSession");
			await waitForTurnStart(sessionId, step.timeoutMs, step.minimumTurn);
			return;
		}
		case "cancel": {
			const sessionId = getSessionId();
			if (sessionId === void 0) throw new Error("snapshot-harness: cancel before newSession");
			if (step.waitForFile !== void 0) await waitForWorkspaceFile(cwd, step.waitForFile.path, step.waitForFile.timeoutMs);
			await client.cancel({ sessionId });
			return;
		}
		default: throw new Error(`snapshot-harness: unknown input op ${JSON.stringify(step)}`);
	}
}
/** Wait until persistence exposes an open turn for the selected session. */
async function waitForPersistedTurnStart(root, sessionId, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, minimumTurn) {
	let invalidRecord;
	const message = `snapshot-harness: session "${sessionId}" did not persist ${minimumTurn === void 0 ? "turn/start" : `turn/start at or beyond turn ${minimumTurn}`} within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			const log = (await harvestSessionLogs(root)).find((candidate) => candidate.id === sessionId);
			let openTurn;
			try {
				openTurn = log === void 0 ? void 0 : latestOpenTurn(log.content);
			} catch (error) {
				invalidRecord = { error };
				return;
			}
			if (openTurn === void 0 || minimumTurn !== void 0 && openTurn < minimumTurn) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
	if (invalidRecord !== void 0) throw invalidRecord.error;
}
/**
* Wait until the raw JSONL backend exposes one complete closing turn boundary.
* The ACP cancel notification settles its prompt before the agent necessarily
* reaches quiescence, so cancellation snapshots use this external boundary to
* keep subprocess disposal from changing an `aborted` turn into `disposed`.
*/
async function waitForPersistedTurnEnd(root, sessionId, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const message = `snapshot-harness: session "${sessionId}" did not persist turn/end within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			const log = (await harvestSessionLogs(root)).find((candidate) => candidate.id === sessionId);
			if (log === void 0 || !latestTurnIsClosed(log.content)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/**
* Wait until the Nth harvested child Session closes a model work turn.
*
* Harvest order matches `session.1.jsonl`, `session.2.jsonl`, and so on. A
* continuable child appends its descriptor after any inherited history and
* before accepting its first prompt, so only a later request header proves its
* own model work reached a closed turn.
*/
async function waitForPersistedChildTurnEnd(root, child, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, minimumTurn = 1) {
	const message = `snapshot-harness: subagent child #${child} did not persist closed turn ${minimumTurn} within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			const log = (await harvestSessionLogs(root))[child];
			if (log === void 0 || !latestTurnIsClosed(log.content) || !hasRequestHeaderAfterDescriptor(log.content) || !hasClosedTurn(log.content, minimumTurn)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/** Whether a raw session log contains the requested closed turn. */
function hasClosedTurn(content, turn) {
	return content.split("\n").filter(Boolean).some((line) => {
		const event = JSON.parse(line);
		return event.type === "turn/end" && event.data?.turn === turn;
	});
}
/** Wait until the latest durable goal snapshot reaches one phase. */
async function waitForPersistedGoalPhase(root, sessionId, phase, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const message = `snapshot-harness: session "${sessionId}" did not persist goal phase "${phase}" within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			if (!(((await harvestSessionLogs(root)).find((log) => log.id === sessionId)?.content)?.split("\n").filter(Boolean).some((line) => {
				const event = JSON.parse(line);
				return event.type === "goal/change" && event.data?.goal?.phase === phase;
			}) ?? false)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/** Wait until an inserted inbox message contains scenario-owned text. */
async function waitForPersistedInboxMessage(root, sessionId, text, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const message = `snapshot-harness: session "${sessionId}" did not persist expected inbox message within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			if (!((await harvestSessionLogs(root)).find((candidate) => candidate.id === sessionId)?.content.split("\n").some((line) => {
				if (line.length === 0) return false;
				const record = JSON.parse(line);
				return record.type === "agent/inbox/spliced" && record.data?.inserted?.some((message) => message.content?.some((block) => block.type === "text" && typeof block.text === "string" && block.text.includes(text))) === true;
			}) ?? false)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/** Whether a child log contains model work after its own descriptor event. */
function hasRequestHeaderAfterDescriptor(content) {
	const events = content.slice(0, content.lastIndexOf("\n") + 1).split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
	const descriptor = events.findLastIndex((event) => event.type === "subagent/descriptor");
	return descriptor >= 0 && events.slice(descriptor + 1).some((event) => event.type === "request/header");
}
/** Wait until a complete provider or fallback title record follows the latest closed turn. */
async function waitForPersistedTitleAfterTurnEnd(root, sessionId, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const message = `snapshot-harness: session "${sessionId}" did not persist session/title after turn/end within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			const log = (await harvestSessionLogs(root)).find((candidate) => candidate.id === sessionId);
			if (log === void 0 || !latestTitleFollowsTurnEnd(log.content)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/** Wait until a complete record of `type` follows the latest closed turn. */
async function waitForPersistedEventAfterTurnEnd(root, sessionId, type, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const message = `snapshot-harness: session "${sessionId}" did not persist ${type} after turn/end within ${timeoutMs}ms`;
	try {
		await vi.waitFor(async () => {
			const log = (await harvestSessionLogs(root)).find((candidate) => candidate.id === sessionId);
			if (log === void 0 || !latestEventFollowsTurnEnd(log.content, type)) throw new Error(message);
		}, {
			interval: WAIT_POLL_INTERVAL_MS,
			timeout: timeoutMs
		});
	} catch (cause) {
		throw new Error(message, { cause });
	}
}
/** Wait for a cwd-relative marker proving an external action reached readiness. */
async function waitForWorkspaceFile(cwd, path, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
	const target = join(cwd, path);
	await vi.waitFor(() => {
		if (!existsSync(target)) throw new Error(`snapshot-harness: workspace file "${path}" did not appear within ${timeoutMs}ms`);
	}, {
		interval: WAIT_POLL_INTERVAL_MS,
		timeout: timeoutMs
	});
}
/** Return whether the last complete raw-JSONL turn boundary closes its turn. */
function latestTurnIsClosed(content) {
	const complete = content.slice(0, content.lastIndexOf("\n") + 1);
	return complete.lastIndexOf("\n{\"type\":\"turn/end\",") > complete.lastIndexOf("\n{\"type\":\"turn/start\",");
}
/** Return whether the last complete title record occurs after the last complete turn end. */
function latestTitleFollowsTurnEnd(content) {
	const complete = content.slice(0, content.lastIndexOf("\n") + 1);
	const turnEnd = complete.lastIndexOf("\n{\"type\":\"turn/end\",");
	return turnEnd >= 0 && complete.lastIndexOf("\n{\"type\":\"session/title\",") > turnEnd;
}
/** Return whether a complete record of `type` occurs after the last complete turn end. */
function latestEventFollowsTurnEnd(content, type) {
	const complete = content.slice(0, content.lastIndexOf("\n") + 1);
	const turnEnd = complete.lastIndexOf("\n{\"type\":\"turn/end\",");
	return turnEnd >= 0 && complete.lastIndexOf(`\n{"type":"${type}",`) > turnEnd;
}
/** Return the latest open turn number, validating the persisted boundary record. */
function latestOpenTurn(content) {
	const complete = content.slice(0, content.lastIndexOf("\n") + 1);
	const start = complete.lastIndexOf("\n{\"type\":\"turn/start\",");
	if (start <= complete.lastIndexOf("\n{\"type\":\"turn/end\",")) return void 0;
	const end = complete.indexOf("\n", start + 1);
	const turn = JSON.parse(complete.slice(start + 1, end)).data?.turn;
	if (!Number.isSafeInteger(turn) || turn < 1) throw new Error("snapshot-harness: invalid persisted turn/start record");
	return turn;
}
/**
* Harvest every latest-generation raw JSONL Session under a sessions root, parse each
* header line, and return them ordered primary-first: the top-level session (no
* `parentSession`) leads, then each subagent child by ascending `createdAt`.
*
* Snapshot configs select the JSONL backend's raw mode, which lays each immutable
* generation beneath `<root>/<project>/<session-id>/`. Recursive collection
* chooses the numerically highest generation for the primary and every child.
* Returns `[]` if no log was
* produced (a no-session scenario).
*/
async function harvestSessionLogs(root) {
	let files;
	try {
		files = await readdir(root, { recursive: true });
	} catch {
		return [];
	}
	const logs = [];
	for (const file of latestPersistedSessionPaths(files)) {
		const content = await readFile(join(root, file), "utf8");
		assertPersistedSessionVersion(basename(file), content);
		/* v8 ignore next -- the generation validator above rejects header-less content. */
		const firstLine = content.split("\n").find((line) => line.trim().length > 0) ?? "{}";
		const header = JSON.parse(firstLine);
		logs.push({
			id: typeof header.id === "string" ? header.id : "",
			createdAt: typeof header.createdAt === "number" ? header.createdAt : 0,
			...typeof header.parentSession === "string" ? { parentSession: header.parentSession } : {},
			content
		});
	}
	logs.sort((a, b) => {
		return Number(a.parentSession !== void 0) - Number(b.parentSession !== void 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
	});
	return logs;
}
//#endregion
//#region lib/types/normalize.js
/**
* Pure ACP transcript and session-log normalizers. They scrub session ids, run cwd, RPC ids,
* timestamps, goal lifecycle clocks, and hook duration while preserving semantic payload values.
* The prompt-text and tool-schema scrubbers stay composable so one scenario per header class can
* pin prompt and tool-schema sidecars.
* @module @deepseek-ai/dsh-session-snapshot/normalize
*/
const SESSION_ID = "{{sessionId}}";
const MESSAGE_ID = "{{messageId}}";
const USED_TOKENS = "{{usedTokens}}";
const CWD = "{{cwd}}";
const SYSTEM = "{{system}}";
const TOOLS = "{{tools}}";
const EVENT_TIME = "{{eventTime}}";
const EVENT_OMITTED_BYTES = "{{eventOmittedBytes}}";
const SOURCE_SESSION_FORMAT = "{{sourceSessionFormatVersion}}";
const PACKED_CHUNK_ROW_TYPES$1 = new Set([
	"text-chunks",
	"reasoning-chunks",
	"tool-call-chunks"
]);
function isPackedFixtureRow(record) {
	return typeof record.type === "string" && PACKED_CHUNK_ROW_TYPES$1.has(record.type);
}
function omitFixtureEnvelope(record) {
	delete record.seq;
	delete record.time;
	delete record.seq0;
	delete record.time0;
}
/** A cwd-rooted path after volatile cwd replacement, through its last separator-delimited segment. */
const CWD_ROOTED_PATH_RE = /\{\{cwd\}\}(?:[\\/][^\s<>"'`]+)+/g;
const PATH_TAG_RE = /(<path>)([^<]*)(<\/path>)/g;
const ADDITIONAL_INSTRUCTIONS_PATH_RE = /(Additional instructions from: )([^\r\n]+)/g;
const EMBEDDED_EVENT_TIME_RE = /^(  "time": )\d+(?=,\r?$)/gm;
const EVENT_READ_OMITTED_BYTES_RE = /(\r?\n\r?\n\(Omitted )\d+( bytes\.)/g;
const EVENT_READ_TARGET_REGION_RE = /^Session [^\r\n]+ — [^\r\n]+\r?\nTarget event seq \d+:\r?\n```json\r?\n\{\r?\n[\s\S]*?(?=\r?\n```(?:\r?\n|$)|\r?\n\r?\n\(Omitted )/;
const PATH_TEXT_BOUNDARY_RE = /[\s<>'"`()\[\]{},;:!?=]/;
const FILE_URI_PATH_PREFIX_RE = /(?:^|[^a-z0-9+.-])file:\/\/\/?$/i;
/** A UUID v4 string, the shape `randomUUID()` produces for session ids. */
const UUID_RE$1 = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LOCAL_SPILL_PATH_RE = new RegExp(String.raw`\{\{cwd\}\}[\\/]+\.spill[\\/]+session-[0-9a-f]{12}[\\/]+[0-9a-f]{12}-([A-Za-z0-9._~-]+?)` + String.raw`(?=\. Use read with offset/limit|[\s)"]|\\+"|$)`, "g");
const SNAPSHOT_SPILL_PATH_RE = new RegExp(String.raw`(?:[A-Za-z]:)?[\\/]+(?:tmp|t)[\\/]+(?:dsh-acp-snap-[0-9a-f]{9}|dsh-acp-snapshot-spill)[\\/]+session-[0-9a-f]{12}[\\/]+[0-9a-f]{12}-([A-Za-z0-9._~-]+?)` + String.raw`(?=\. Use read with offset/limit|[\s)"]|\\+"|$)`, "g");
/**
* Extract every snapshot-mode spill path from a session log, keyed by spill
* filename. Used by refresh write-back to keep spill paths stable across runs.
* @param content - the raw session log text to scan.
* @returns spill filename → the full matched spill path, last match wins per name.
*/
function extractSnapshotSpillPaths(content) {
	const result = /* @__PURE__ */ new Map();
	for (const match of content.matchAll(SNAPSHOT_SPILL_PATH_RE)) {
		const name = match[1];
		/* v8 ignore next -- the filename capture is required and non-empty whenever the spill regex matches */
		if (name === void 0) continue;
		result.set(name, match[0]);
	}
	return result;
}
/** Convert separators only inside generated path-bearing text markers. */
function canonicalizeEmbeddedPaths(value) {
	return value.replace(PATH_TAG_RE, (_match, open, path, close) => `${open}${path.replaceAll("\\", "/")}${close}`).replace(ADDITIONAL_INSTRUCTIONS_PATH_RE, (_match, prefix, path) => `${prefix}${path.replaceAll("\\", "/")}`);
}
/** Return every known spelling of the generated cwd, most specific first. */
function cwdSpellings(ctx) {
	const spellings = [...new Set([ctx.cwd, ...ctx.cwdAliases ?? []])].filter((spelling) => spelling.length > 0);
	const macAliases = spellings.filter((spelling) => spelling.startsWith("/") && !spelling.startsWith("/private/")).map((spelling) => `/private${spelling}`);
	return [...new Set([...spellings, ...macAliases])].sort((left, right) => right.length - left.length);
}
/** Whether an embedded cwd match starts and ends at a path/text boundary. */
function isCwdMatch(value, start, length) {
	const before = value[start - 1];
	const after = value[start + length];
	const afterPunctuation = value[start + length + 1];
	const startsAtBoundary = before === void 0 || PATH_TEXT_BOUNDARY_RE.test(before) || FILE_URI_PATH_PREFIX_RE.test(value.slice(0, start));
	const endsAtBoundary = after === void 0 || after === "/" || after === "\\" || PATH_TEXT_BOUNDARY_RE.test(after) || after === "." && (afterPunctuation === void 0 || PATH_TEXT_BOUNDARY_RE.test(afterPunctuation));
	return startsAtBoundary && endsAtBoundary;
}
/** Replace one cwd spelling without matching a longer path segment that merely shares its prefix. */
function replaceCwdSpelling(value, spelling, replacement) {
	let cursor = 0;
	let out = "";
	while (cursor < value.length) {
		const match = value.indexOf(spelling, cursor);
		if (match < 0) return out + value.slice(cursor);
		const end = match + spelling.length;
		if (isCwdMatch(value, match, spelling.length)) {
			out += value.slice(cursor, match) + replacement;
			cursor = end;
		} else {
			out += value.slice(cursor, end);
			cursor = end;
		}
	}
	return out;
}
/** Replace every known cwd spelling with one stable token. */
function replaceCwd(value, ctx, replacement) {
	let out = value;
	for (const spelling of cwdSpellings(ctx)) out = replaceCwdSpelling(out, spelling, replacement);
	return out;
}
/** Replace cwd, session ids, and any stray UUID with stable tokens in a string. */
function scrubString(value, ctx, cwdPathMode, identityMode) {
	let out = replaceCwd(value, ctx, CWD);
	out = out.split(`/private${CWD}`).join(CWD);
	if (cwdPathMode === "canonical") {
		out = out.replace(CWD_ROOTED_PATH_RE, (path) => path.replaceAll("\\", "/"));
		out = canonicalizeEmbeddedPaths(out);
	}
	out = out.replace(LOCAL_SPILL_PATH_RE, (_match, name) => `{{spillLocator:${name}}}`);
	out = out.replace(SNAPSHOT_SPILL_PATH_RE, (_match, name) => `{{spillLocator:${name}}}`);
	if (EVENT_READ_TARGET_REGION_RE.test(out)) {
		out = out.replace(EVENT_READ_TARGET_REGION_RE, (target) => target.replace(EMBEDDED_EVENT_TIME_RE, `$1${EVENT_TIME}`));
		out = out.replace(EVENT_READ_OMITTED_BYTES_RE, `$1${EVENT_OMITTED_BYTES}$2`);
	}
	if (identityMode === "legacy") {
		for (const id of ctx.sessionIds) out = out.split(id).join(SESSION_ID);
		out = out.replace(UUID_RE$1, SESSION_ID);
	}
	return out;
}
/** Recursively scrub a parsed JSON value (strings replaced; structure kept). */
function scrubValue(value, ctx, cwdPathMode, identityMode, key) {
	if (typeof value === "string") {
		if (identityMode === "legacy" && key === "messageId") return MESSAGE_ID;
		const scrubbed = scrubString(value, ctx, cwdPathMode, identityMode);
		return cwdPathMode === "canonical" && key === "path" ? scrubbed.replaceAll("\\", "/") : scrubbed;
	}
	if (Array.isArray(value)) return value.map((v) => scrubValue(v, ctx, cwdPathMode, identityMode));
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, ctx, cwdPathMode, identityMode, k);
		if (value.sessionUpdate === "usage_update" && typeof value.used === "number") out.used = USED_TOKENS;
		return out;
	}
	return value;
}
/** Escape one literal path segment for use in a regular expression. */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Replace any absolute spelling whose final segment is the generated cwd basename. */
function tokenizeFixtureString(value, ctx, basename) {
	const exact = replaceCwd(value, ctx, CWD);
	const absoluteCwd = new RegExp(String.raw`(?:[A-Za-z]:)?[\\/](?:[^\\/\s<>"]+[\\/])*${escapeRegExp(basename)}` + String.raw`(?=$|[\\/\s<>'"()\[\]{},;:!?=])`, "g");
	return exact.replace(absoluteCwd, CWD).split(`/private${CWD}`).join(CWD);
}
/** Recursively replace generated-cwd spellings while preserving every other JSON value. */
function tokenizeFixtureValue(value, ctx, basename) {
	if (typeof value === "string") return tokenizeFixtureString(value, ctx, basename);
	if (Array.isArray(value)) return value.map((item) => tokenizeFixtureValue(item, ctx, basename));
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tokenizeFixtureValue(item, ctx, basename)]));
	return value;
}
/**
* Store one generated workspace as `{{cwd}}` while retaining every other
* session value. The caller opts in only for workspaces created under a
* platform temporary root; explicitly relocated workspaces keep their real
* path.
*
* @param rawLog The raw or refresh-stabilized session JSONL fixture.
* @returns Compact JSONL whose known cwd spellings become `{{cwd}}`.
* @throws If a non-empty line is invalid JSON or the session cwd has no basename.
*/
function tokenizeSessionFixtureCwd(rawLog) {
	const lines = rawLog.split("\n");
	const firstLine = lines.find((line) => line.trim().length > 0);
	const header = firstLine === void 0 ? void 0 : JSON.parse(firstLine);
	const cwd = typeof header?.cwd === "string" ? header.cwd : "";
	const basename = cwd.split(/[\\/]/).at(-1);
	if (basename === void 0 || basename.length === 0) throw new Error("acp-snapshot: cannot tokenize a cwd without a basename");
	const ctx = {
		sessionIds: [],
		cwd
	};
	return lines.map((line) => {
		if (line.trim().length === 0) return line;
		return JSON.stringify(tokenizeFixtureValue(JSON.parse(line), ctx, basename));
	}).join("\n");
}
/**
* Normalize a raw stdout transcript (newline-delimited JSON-RPC frames) into a stable expected output
* in the same shape as the wire: one compact JSON frame per line (NDJSON), with the JSON-RPC
* `id` rewritten to a per-transcript sequence (1, 2, 3, …) and all volatile strings scrubbed.
* Invalid JSON throws, doubling as a protocol-stdout purity check.
*
* @param rawStdout The captured stdout bytes, decoded utf8.
* @param ctx The run's volatile values to scrub.
* @param options Separator output controls; shared canonical paths are the default.
* @returns The normalized NDJSON transcript, one frame per line.
*/
function normalizeStdout(rawStdout, ctx, options = {}) {
	const cwdPathMode = options.cwdPathMode ?? "canonical";
	const identityMode = options.identityMode ?? "legacy";
	const lines = rawStdout.split("\n").filter((line) => line.trim().length > 0);
	const idSeq = /* @__PURE__ */ new Map();
	const stableId = (id) => {
		const key = JSON.stringify(id);
		let n = idSeq.get(key);
		if (n === void 0) {
			n = idSeq.size + 1;
			idSeq.set(key, n);
		}
		return n;
	};
	return lines.map((line) => {
		const frame = JSON.parse(line);
		if ("id" in frame && frame.id !== void 0 && frame.id !== null) frame.id = stableId(frame.id);
		return scrubValue(frame, ctx, cwdPathMode, identityMode);
	}).map((f) => JSON.stringify(f)).join("\n") + "\n";
}
/**
* Normalize a session JSONL log into a stable expected output: the header line's
* volatile fields (`createdAt`, `id`, `cwd`) are zeroed/scrubbed; event,
* historical packed-row, embedded Assistant-stream, goal lifecycle, and
* catalog child-creation clocks are zeroed; and all volatile strings are
* scrubbed. Projected inputs remain
* projected. Packed `data.dt` gaps are normalized even when the projected row
* omits its `time0` anchor.
* Output is JSONL in the same shape as the input — one compact record per
* line.
*
* @param rawLog The raw session `.jsonl` content.
* @param ctx The run's volatile values to scrub.
* @param options Separator output controls; shared canonical paths are the default.
* @returns The normalized JSONL log, one record per line.
*/
function normalizeSessionLog(rawLog, ctx, options = {}) {
	const cwdPathMode = options.cwdPathMode ?? "canonical";
	const identityMode = options.identityMode ?? "legacy";
	return rawLog.split("\n").filter((line) => line.trim().length > 0).map((line) => {
		const record = JSON.parse(line);
		if (record.type === "session") {
			if ("createdAt" in record) record.createdAt = 0;
		} else if (isPackedFixtureRow(record)) {
			if ("time0" in record) record.time0 = 0;
			const data = record.data;
			if (data !== null && typeof data === "object" && Array.isArray(data.dt)) data.dt = data.dt.map(() => 0);
		} else if ("time" in record) record.time = 0;
		if ((record.type === "assistant/message" || record.type === "assistant/attempt") && record.data !== null && typeof record.data === "object") {
			const stream = record.data.stream;
			if (Array.isArray(stream)) for (const member of stream) {
				if (member === null || typeof member !== "object") continue;
				const timed = member;
				if (typeof timed.time === "number") timed.time = 0;
				if (typeof timed.time0 === "number") timed.time0 = 0;
				if (Array.isArray(timed.dt)) timed.dt = timed.dt.map(() => 0);
			}
		}
		if (record.type === "hook/result" && record.data !== null && typeof record.data === "object") {
			const data = record.data;
			if ("durationMs" in data) data.durationMs = 0;
		}
		normalizeFeedbackClocks(record);
		if (record.type === "goal/change" && record.data !== null && typeof record.data === "object") {
			const data = record.data;
			if ("createdAt" in data) data.createdAt = 0;
			if ("updatedAt" in data) data.updatedAt = 0;
		}
		if (record.type === "subagent/catalog" && record.data !== null && typeof record.data === "object") {
			const data = record.data;
			if ("childCreatedAt" in data) data.childCreatedAt = 0;
		}
		if (Object.hasOwn(record, "sourceEventSeqs")) record.sourceEventSeqs = decodeSeqRanges(record.sourceEventSeqs);
		return scrubValue(record, ctx, cwdPathMode, identityMode);
	}).map((r) => JSON.stringify(r)).join("\n") + "\n";
}
/**
* Canonicalize projected v3 body records. Compact streams are nested event data,
* so persistence flush boundaries cannot change the row layout.
*/
function projectSessionSnapshot(rawLog) {
	const lines = rawLog.split("\n").filter((line) => line.trim().length > 0);
	return [
		lines.shift(),
		...lines.map((line) => {
			const record = JSON.parse(line);
			omitFixtureEnvelope(record);
			return JSON.stringify(record);
		}),
		""
	].join("\n");
}
/**
* Normalize and project persisted session JSONL for a committed fixture.
* This composes ordinary log normalization with request-header scrubbing and
* persistence-envelope projection, then writes the v3 logical event stream as
* one record per event, independent of persistence flush boundaries. Event order
* and source-event references are preserved.
*
* @param rawLog - persisted or already-projected session JSONL.
* @param ctx - the run's volatile values to scrub.
* @param options - separator output controls.
* @returns normalized committed session snapshot JSONL.
*/
function normalizeSessionSnapshot(rawLog, ctx, options = {}) {
	return projectSessionSnapshot(scrubSessionSnapshot(normalizeSessionLog(rawLog, ctx, options)));
}
/**
* Normalize one scenario's primary and child logs with shared typed identity redaction.
* Native-writer comparison strictly restores each input before tokenizing its own delivery generation.
* @param rawLogs - primary-first persisted or projected session JSONL.
* @param ctx - generated cwd spellings and other volatile run facts.
* @param options - separator and native-writer comparison controls; identity relationships are preserved.
* @returns comparison-only Session records in input order; not persistence or fixture write-back input.
*/
function normalizeSessionSnapshots(rawLogs, ctx, options = {}) {
	const { nativeWriterOutput, ...normalizeOptions } = options;
	return redactSessionSnapshotIds(rawLogs.map((log) => {
		if (!hasSessionFormatVersion(log)) return normalizeSessionFormatMetadata(log);
		return normalizeSessionFormatMetadata(prepareSessionSnapshotFixtureForComparison(log), nativeWriterOutput ? sessionHeaderVersion(log, "source Session snapshot") : void 0);
	})).map((log) => projectSessionSnapshot(scrubSessionSnapshot(normalizeSessionLog(log, {
		...ctx,
		sessionIds: []
	}, {
		...normalizeOptions,
		identityMode: "preserve"
	}))));
}
/**
* Omit the artifact header generation after official migration for comparison.
* An explicit source version tokenizes only delivery markers for that original input generation.
* Other delivery generations and every captured-source generation retain their recorded values.
* @param rawLog - Session records or events as compact JSON lines.
* @param sourceVersion - original generation of strictly validated native writer output; otherwise omit.
* @returns comparison-only records with the Session header version omitted and native delivery qualifiers tokenized.
*/
function normalizeSessionFormatMetadata(rawLog, sourceVersion) {
	return rawLog.split("\n").map((line) => {
		if (line.trim().length === 0) return line;
		const record = JSON.parse(line);
		if (record.type === "session" && Object.hasOwn(record, "version")) delete record.version;
		else if (sourceVersion !== void 0 && record.type === "session-log-deepseek/delivery-accepted") {
			const data = record.data;
			if (data?.sessionFormatVersion !== sourceVersion) return line;
			data.sessionFormatVersion = SOURCE_SESSION_FORMAT;
		} else return line;
		return JSON.stringify(record);
	}).join("\n");
}
/** Whether a fixture declares a released Session format and therefore participates in migration burn-in. */
function hasSessionFormatVersion(rawLog) {
	const firstLine = rawLog.split(/\r?\n/).find((line) => line.trim().length > 0);
	if (firstLine === void 0) throw new Error("session snapshot must start with a session header");
	const header = JSON.parse(firstLine);
	if (header === null || typeof header !== "object" || Array.isArray(header) || header["type"] !== "session") throw new Error("session snapshot must start with a session header");
	return Object.hasOwn(header, "version");
}
/**
* Replace the rendered prompt text of every `system/message` event with the
* `{{system}}` token. The text block keeps its position and type, so the
* fixture still shows one system node per prompt version; an empty `content`
* (no system prompt) stays empty. Request headers and every other line pass
* through byte-for-byte; the transform is idempotent.
*
* @param rawLog The raw session `.jsonl` content.
* @returns The JSONL with system-prompt text tokenized.
*/
function scrubSystemPrompts(rawLog) {
	return scrubModelRequestContent(rawLog, { system: true });
}
/**
* Replace tool schemas in full request-header snapshots with `{{tools}}`
* tokens while retaining field presence. Logs containing developer messages
* retain tool names so historical addition references remain verifiable.
* System-prompt text stays verbatim so
* pinning fixtures can move only schema bulk into their dedicated JSON
* sidecar. Lines without a tool payload pass through byte-for-byte; the
* transform is idempotent.
*
* @param rawLog The raw session `.jsonl` content.
* @returns The JSONL with tool-schema content tokenized.
*/
function scrubToolSchemas(rawLog) {
	return scrubModelRequestContent(rawLog, { tools: true });
}
/**
* Replace all bulky model-request content in a session JSONL with stable
* tokens: the `system/message` prompt text handled by
* {@link scrubSystemPrompts} and the request-header tool schemas handled by
* {@link scrubToolSchemas}. Field presence, config, and reason are kept.
* Lines without content to scrub pass through byte-for-byte, and the
* transform is idempotent.
*
* @param rawLog The raw session `.jsonl` content.
* @returns The JSONL with prompt text and schema bulk tokenized, other lines byte-identical.
*/
function scrubModelRequestBulk(rawLog) {
	return scrubModelRequestContent(rawLog, {
		system: true,
		tools: true
	});
}
/**
* Project a persisted session log while tokenizing prompt text and schema
* bulk. Each non-empty line is parsed at most once; the session header stays
* byte-identical. Body records omit their persistence-only envelopes and expand
* source-event ranges without changing reference order.
*
* @param rawLog - persisted or already-projected session JSONL.
* @returns committed snapshot JSONL with prompt text and tool schemas tokenized.
*/
function scrubSessionSnapshot(rawLog) {
	const scrubbed = scrubModelRequestBulk(rawLog);
	let recordIndex = 0;
	return scrubbed.split("\n").map((line) => {
		if (line.trim().length === 0) return line;
		const record = JSON.parse(line);
		if (recordIndex++ === 0) {
			if (record.type !== "session") throw new Error("session snapshot must start with a session header");
			return line;
		}
		omitFixtureEnvelope(record);
		if (Object.hasOwn(record, "sourceEventSeqs")) record.sourceEventSeqs = decodeSeqRanges(record.sourceEventSeqs);
		normalizeFeedbackClocks(record);
		return JSON.stringify(record);
	}).join("\n");
}
/** Normalize service-owned feedback clocks without touching user-authored payloads. */
function normalizeFeedbackClocks(record) {
	if (record.type !== "feedback/message-put" || record.data === null || typeof record.data !== "object") return;
	const item = record.data.item;
	if (item === null || typeof item !== "object") return;
	const clocks = item;
	if ("createdAt" in clocks) clocks.createdAt = 0;
	if ("updatedAt" in clocks) clocks.updatedAt = 0;
}
/** Return the first text block of a `system/message` payload, or `undefined` when it carries none. */
function systemPromptBlock(data) {
	const message = data.message;
	if (message === null || typeof message !== "object" || !Array.isArray(message.content)) return void 0;
	const block = message.content[0];
	return block !== null && typeof block === "object" && typeof block.text === "string" ? block : void 0;
}
/** Transform the selected model-request payloads. */
function scrubModelRequestContent(rawLog, options) {
	const lines = rawLog.split("\n");
	const records = lines.map((line) => line.trim().length === 0 ? void 0 : JSON.parse(line));
	const retainToolNames = records.some((record) => record?.type === "developer/message");
	return lines.map((line, index) => {
		const record = records[index];
		if (record === void 0) return line;
		const data = record.data;
		if (data === null || typeof data !== "object") return line;
		if (options.system === true && record.type === "system/message") {
			const block = systemPromptBlock(data);
			if (block === void 0) return line;
			block.text = SYSTEM;
			return JSON.stringify(record);
		}
		if (options.tools === true && record.type === "request/header") {
			const header = data.header;
			if (header === null || typeof header !== "object" || !("tools" in header)) return line;
			header.tools = retainToolNames && Array.isArray(header.tools) ? header.tools.map((tool) => typeof tool === "string" ? tool : tool.name) : TOOLS;
			return JSON.stringify(record);
		}
		return line;
	}).join("\n");
}
//#endregion
//#region lib/types/manifest.js
/** Parse and validate one recorded-session snapshot manifest. */
/**
* Whether one run writes current-writer Session fixtures for this scenario.
* Explicit historical generations remain immutable replay inputs; record and
* refresh may still update their non-Session expected outputs.
*
* @param manifest - Parsed scenario ownership and retained-generation metadata.
* @param mode - Snapshot execution mode.
* @returns True only when a write-capable mode tracks the current writer.
*/
function writesCurrentSessionFixtures(manifest, mode) {
	return mode !== "replay" && manifest.session === void 0 && manifest.sessionFormat === void 0;
}
const PROFILES = new Set([
	"headless",
	"sdk",
	"acp",
	"web"
]);
const RECORDINGS = new Set(["live", "authored"]);
const PLATFORMS = new Set(["posix", "pwsh"]);
const PERMISSIONS = new Set([
	"read-only",
	"workspace-write",
	"danger-full-access"
]);
const SESSION_FORMAT_COVERAGE = new Set([
	"multi-hop",
	"packed-row",
	"retry-failure",
	"shipped-profile",
	"adjacent-migration",
	"retired-tools"
]);
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function record(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a mapping`);
	return value;
}
function exactKeys(value, allowed, label) {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
	if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.join(", ")}`);
}
function name(value, label) {
	if (typeof value !== "string" || !NAME_RE.test(value)) throw new Error(`${label} must be a lower-kebab-case name`);
	return value;
}
function scenarioSource(value, label) {
	if (typeof value !== "string" || !value.split("/").every((segment) => NAME_RE.test(segment))) throw new Error(`${label} must be a lower-kebab-case name or corpus-relative path`);
	return value;
}
function positiveIndexes(value, label) {
	if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || Number(item) < 1) || new Set(value).size !== value.length) throw new Error(`${label} must be an array of unique positive integers`);
	return [...value];
}
/**
* Parse one `snapshot.yml` without admitting JavaScript YAML tags or unknown fields.
* @param source - complete manifest text.
* @param path - diagnostic path.
* @returns validated manifest metadata.
*/
function parseSnapshotManifest(source, path = "snapshot.yml") {
	let parsed;
	try {
		parsed = yaml.load(source, { schema: yaml.JSON_SCHEMA });
	} catch (error) {
		throw new Error(`session-snapshot: ${path}: invalid YAML: ${String(error)}`);
	}
	try {
		const root = record(parsed, "manifest");
		exactKeys(root, [
			"version",
			"scenario",
			"profile",
			"composition",
			"recording",
			"header",
			"replay",
			"platform",
			"permission",
			"environment",
			"workspace",
			"input",
			"session",
			"sessionFormat"
		], "manifest");
		if (root.version !== 1) throw new Error("manifest.version must equal 1");
		const scenario = root.scenario === void 0 ? void 0 : name(root.scenario, "manifest.scenario");
		if (typeof root.profile !== "string" || !PROFILES.has(root.profile)) throw new Error("manifest.profile must be headless, sdk, acp, or web");
		const composition = root.composition === void 0 ? void 0 : name(root.composition, "manifest.composition");
		let recording;
		if (root.recording !== void 0) {
			if (typeof root.recording !== "string" || !RECORDINGS.has(root.recording)) throw new Error("manifest.recording must be live or authored");
			recording = root.recording;
		}
		let header;
		if (root.header !== void 0) {
			const value = record(root.header, "manifest.header");
			exactKeys(value, [
				"class",
				"pin",
				"systemPromptSource",
				"toolSchemasSource",
				"childSystemPrompts",
				"childToolSchemas",
				"changes",
				"promptChanges"
			], "manifest.header");
			if (value.pin !== void 0 && value.pin !== true) throw new Error("manifest.header.pin must equal true when present");
			for (const field of ["changes", "promptChanges"]) if (value[field] !== void 0 && (!Number.isInteger(value[field]) || Number(value[field]) < 0)) throw new Error(`manifest.header.${field} must be a non-negative integer`);
			header = {
				class: name(value.class, "manifest.header.class"),
				...value.pin === true ? { pin: true } : {},
				...value.systemPromptSource === void 0 ? {} : { systemPromptSource: scenarioSource(value.systemPromptSource, "manifest.header.systemPromptSource") },
				...value.toolSchemasSource === void 0 ? {} : { toolSchemasSource: scenarioSource(value.toolSchemasSource, "manifest.header.toolSchemasSource") },
				...value.childSystemPrompts === void 0 ? {} : { childSystemPrompts: positiveIndexes(value.childSystemPrompts, "manifest.header.childSystemPrompts") },
				...value.childToolSchemas === void 0 ? {} : { childToolSchemas: positiveIndexes(value.childToolSchemas, "manifest.header.childToolSchemas") },
				...value.changes === void 0 ? {} : { changes: Number(value.changes) },
				...value.promptChanges === void 0 ? {} : { promptChanges: Number(value.promptChanges) }
			};
		}
		let replay;
		if (root.replay !== void 0) {
			const value = record(root.replay, "manifest.replay");
			exactKeys(value, ["override"], "manifest.replay");
			if (value.override !== true) throw new Error("manifest.replay.override must equal true");
			replay = { override: true };
		}
		let platform;
		if (root.platform !== void 0) {
			if (typeof root.platform !== "string" || !PLATFORMS.has(root.platform)) throw new Error("manifest.platform must be posix or pwsh");
			platform = root.platform;
		}
		let permission;
		if (root.permission !== void 0) {
			if (typeof root.permission !== "string" || !PERMISSIONS.has(root.permission)) throw new Error("manifest.permission must be read-only, workspace-write, or danger-full-access");
			permission = root.permission;
		}
		let environment;
		if (root.environment !== void 0) {
			const value = record(root.environment, "manifest.environment");
			if (Object.entries(value).some(([key, item]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof item !== "string")) throw new Error("manifest.environment must map uppercase environment names to strings");
			environment = value;
		}
		let workspace;
		if (root.workspace !== void 0) {
			const value = record(root.workspace, "manifest.workspace");
			exactKeys(value, [
				"setup",
				"final",
				"parent"
			], "manifest.workspace");
			if (value.final !== void 0 && value.final !== true) throw new Error("manifest.workspace.final must equal true when present");
			if (value.parent !== void 0 && value.parent !== "outside-temp") throw new Error("manifest.workspace.parent must equal outside-temp");
			workspace = {
				...value.setup === void 0 ? {} : { setup: name(value.setup, "manifest.workspace.setup") },
				...value.final === true ? { final: true } : {},
				...value.parent === "outside-temp" ? { parent: "outside-temp" } : {}
			};
			if (Object.keys(workspace).length === 0) throw new Error("manifest.workspace must not be empty");
		}
		let input;
		if (root.input !== void 0) {
			const value = record(root.input, "manifest.input");
			exactKeys(value, ["task", "attachments"], "manifest.input");
			if (value.task !== void 0 && (typeof value.task !== "string" || value.task.trim() === "")) throw new Error("manifest.input.task must be a non-empty string when present");
			let attachments;
			if (value.attachments !== void 0) {
				if (!Array.isArray(value.attachments) || value.attachments.length === 0) throw new Error("manifest.input.attachments must be a non-empty array");
				attachments = value.attachments.map((item, index) => {
					const attachment = record(item, `manifest.input.attachments[${index}]`);
					exactKeys(attachment, [
						"id",
						"mediaType",
						"data"
					], `manifest.input.attachments[${index}]`);
					if (typeof attachment.id !== "string" || !attachment.id.startsWith("sha256:")) throw new Error(`manifest.input.attachments[${index}].id must start with sha256:`);
					if (typeof attachment.mediaType !== "string" || !attachment.mediaType.includes("/")) throw new Error(`manifest.input.attachments[${index}].mediaType must be a MIME type`);
					if (typeof attachment.data !== "string" || attachment.data.length === 0) throw new Error(`manifest.input.attachments[${index}].data must be non-empty base64`);
					return {
						id: attachment.id,
						mediaType: attachment.mediaType,
						data: attachment.data
					};
				});
				if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length) throw new Error("manifest.input.attachments must have unique ids");
			}
			if (value.task === void 0 && attachments === void 0) throw new Error("manifest.input must declare task or attachments");
			input = {
				...value.task === void 0 ? {} : { task: value.task },
				...attachments === void 0 ? {} : { attachments }
			};
		}
		let session;
		if (root.session !== void 0) {
			const value = record(root.session, "manifest.session");
			exactKeys(value, ["source"], "manifest.session");
			if (typeof value.source !== "string" || value.source.trim() === "") throw new Error("manifest.session.source must be a non-empty string");
			if (isAbsolute(value.source) || value.source.includes("\\") || value.source.includes("\0")) throw new Error("manifest.session.source must be a relative POSIX path");
			session = { source: value.source };
		}
		let sessionFormat;
		if (root.sessionFormat !== void 0) {
			const value = record(root.sessionFormat, "manifest.sessionFormat");
			exactKeys(value, ["version", "coverage"], "manifest.sessionFormat");
			if (!Number.isSafeInteger(value.version) || Number(value.version) < 0 || Object.is(value.version, -0)) throw new Error("manifest.sessionFormat.version must be a non-negative safe integer");
			if (!Array.isArray(value.coverage) || value.coverage.length === 0 || value.coverage.some((item) => typeof item !== "string" || !SESSION_FORMAT_COVERAGE.has(item)) || new Set(value.coverage).size !== value.coverage.length) throw new Error("manifest.sessionFormat.coverage must be a non-empty array of unique supported coverage names");
			if (session !== void 0) throw new Error("manifest.sessionFormat is only valid when the scenario owns its Session fixtures");
			sessionFormat = {
				version: Number(value.version),
				coverage: [...value.coverage]
			};
		}
		return {
			version: 1,
			...scenario === void 0 ? {} : { scenario },
			profile: root.profile,
			...composition === void 0 ? {} : { composition },
			...recording === void 0 ? {} : { recording },
			...header === void 0 ? {} : { header },
			...replay === void 0 ? {} : { replay },
			...platform === void 0 ? {} : { platform },
			...permission === void 0 ? {} : { permission },
			...environment === void 0 ? {} : { environment },
			...workspace === void 0 ? {} : { workspace },
			...input === void 0 ? {} : { input },
			...session === void 0 ? {} : { session },
			...sessionFormat === void 0 ? {} : { sessionFormat }
		};
	} catch (error) {
		/* v8 ignore next -- every parser and validator above throws Error instances. */
		throw new Error(`session-snapshot: ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
//#endregion
//#region lib/types/suite.js
/**
* Keyless-by-default ACP snapshot suite factory. Each scenario drives the real
* subprocess and compares normalized stdout; comparable session fixtures are
* both replay input and expected output. Record mode refreshes reproducible
* model scenarios from the live API, while refresh mode replays committed
* scripts and rewrites derived artifacts without a key.
* Replay scenarios run concurrently because each subprocess owns unique temp
* cwd and persistence roots and reads only committed fixtures. Record and
* refresh stay serial while writing.
*
* Exactly one scenario per header-composition class pins the tokenized header
* sequence and the tokenized `system/message` sequence. Its prompt and
* tool-schema sequences live in independent sidecars, each of which may be
* shared with another class pin when the bytes are identical. Every live
* header and system prompt is checked against the composed pin, so
* session-dependent composition must declare a separate class instead of
* escaping coverage.
* @module @deepseek-ai/dsh-session-snapshot/suite
*/
/** The readable system-prompt snapshot beside its owning header pin. */
const SYSTEM_PROMPT_SNAPSHOT = "system-prompt.expected.md";
/** The structured tool-schema snapshot beside its owning header pin. */
const TOOL_SCHEMAS_SNAPSHOT = "tool-schemas.expected.json";
/** Return the dedicated tool-schema sidecar for one child fixture index. */
function childToolSchemasSnapshot(index) {
	return `tool-schemas.${index}.expected.json`;
}
/** Return the dedicated system-prompt sidecar for one child fixture index. */
function childSystemPromptSnapshot(index) {
	return `system-prompt.${index}.expected.md`;
}
/** The optional full Windows-native stdout transcript. */
const WINDOWS_STDOUT_SNAPSHOT = "stdout.expected.windows.jsonl";
/** Stable session-log token standing in for the sidecar's initial schemas. */
const TOOLS_TOKEN = "{{tools}}";
const PACKED_CHUNK_ROW_TYPES = new Set([
	"text-chunks",
	"reasoning-chunks",
	"tool-call-chunks"
]);
/** Canonical UUID spelling minted for ordinary message identities. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
* Whether a scenario's run test is skipped for this mode and host: record mode
* skips authored (non-`recorded`) scenarios and explicit historical Session
* generations, {@link Scenario.posixOnly} scenarios skip on Windows, and
* {@link Scenario.pwshOnly} scenarios skip when the caller's `hasPwsh` probe
* is false.
*
* @param scenario The scenario whose run test is being registered.
* @param recording Whether the suite runs in record mode.
* @param platform The running Node platform, injectable for unit coverage.
* @param hasPwsh The caller's pwsh-availability probe; `pwshOnly` scenarios
*   skip unless it is true.
* @returns True when the scenario's run test must not execute.
*/
function scenarioSkipped(scenario, recording, platform = process.platform, hasPwsh) {
	if (recording && (!scenario.recorded || scenario.sessionFormat !== void 0)) return true;
	if (scenario.posixOnly === true && platform === "win32") return true;
	return scenario.pwshOnly === true && hasPwsh !== true;
}
/**
* Select the shared stdout expected output plus any platform-native assertion declared by a scenario.
*
* @param scenario The scenario whose stdout contract is being selected.
* @param platform The running Node platform, injectable for unit coverage.
* @returns The ordered expected-output variants: shared canonical first, then optional Windows native.
*/
function stdoutExpectedVariants(scenario, platform = process.platform) {
	const canonical = {
		file: "stdout.expected.jsonl",
		cwdPathMode: "canonical"
	};
	if (platform !== "win32" || scenario.pinsNativeWindowsStdout !== true) return [canonical];
	return [canonical, {
		file: WINDOWS_STDOUT_SNAPSHOT,
		cwdPathMode: "native"
	}];
}
/**
* Record one scenario's generated content for a shared snapshot source.
* A later claimant must generate identical bytes; otherwise record/refresh
* would make the final file depend on scenario order.
*
* @param claims Claims already made in this suite run, keyed by source path.
* @param source The shared snapshot path being claimed.
* @param scenario The scenario generating the content.
* @param content The complete content the scenario generated.
* @returns Nothing.
*/
function claimSharedSnapshot(claims, source, scenario, content) {
	const previous = claims.get(source);
	if (previous !== void 0 && previous.content !== content) throw new Error(`acp-snapshot: shared snapshot ${source} diverged between ${previous.scenario} and ${scenario}`);
	if (previous === void 0) claims.set(source, {
		scenario,
		content
	});
}
/**
* Reject byte-identical committed snapshots stored under different paths.
*
* @param kind Human-readable snapshot kind for the diagnostic.
* @param snapshots The committed files to compare.
* @returns Nothing.
*/
function assertUniqueSnapshotContents(kind, snapshots) {
	const firstPathByContent = /* @__PURE__ */ new Map();
	for (const snapshot of snapshots) {
		const firstPath = firstPathByContent.get(snapshot.content);
		if (firstPath !== void 0) throw new Error(`acp-snapshot: identical ${kind} snapshots appear in ${firstPath} and ${snapshot.path}; reuse one source`);
		firstPathByContent.set(snapshot.content, snapshot.path);
	}
}
/** Read one scenario directory's validated session-fixture inventory. */
async function sessionFixtures(dir) {
	const names = sessionFixtureNames((await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name));
	await Promise.all(names.map(async (name) => {
		assertSessionFixtureVersion(name, await readFile(join(dir, name), "utf8"));
	}));
	return names;
}
/**
* Derive normalization values from a fixture's own session header. Recorded ids and cwd differ
* from the live replay run; the non-empty sentinel for missing cwd avoids accidental empty-
* string replacement.
*
* @param fixture The selected committed parent Session fixture content.
* @returns The fixture's own volatile values, ready for {@link normalizeSessionLog}.
*/
function fixtureContext(fixture) {
	const firstLine = fixture.split("\n").find((line) => line.trim().length > 0) ?? "{}";
	const header = JSON.parse(firstLine);
	return {
		sessionIds: typeof header.id === "string" ? [header.id] : [],
		cwd: typeof header.cwd === "string" ? header.cwd : "\0no-cwd\0"
	};
}
/** Normalize request-header payloads while retaining the reason that selects a pin revision. */
function normalizedHeaderEvents(rawLog, ctx) {
	return parseJsonlRecords(normalizeSessionLog(rawLog, ctx)).filter((record) => record.type === "request/header").map((record) => {
		const data = record.data;
		return {
			header: data?.header,
			reason: data?.reason
		};
	});
}
/**
* Header revisions that own sidecar content. `series` reuses the current revision, while
* `resume` owns sidecars because its full snapshot may drift across the process boundary.
* Pinning fixtures therefore cover one loop instance; a mid-log `resume` fails their
* pin-count invariant.
*/
function pinningHeaderPayloads(rawLog, ctx) {
	return normalizedHeaderEvents(rawLog, ctx).filter((event) => event.reason !== "series").map((event) => event.header);
}
/**
* The rendered prompt text of one parsed `system/message` record: its single
* text block, or `''` when the empty `content` records "no system prompt".
* Any other record yields `undefined`.
*/
function systemPromptOf(record) {
	if (record.type !== "system/message") return void 0;
	const content = record.data?.message?.content;
	if (!Array.isArray(content)) return void 0;
	const block = content[0];
	return content.length === 0 ? "" : typeof block?.text === "string" ? block.text : void 0;
}
/** Extract every array-valued tool catalog from a normalized header sequence. */
function toolSchemasFrom(headers) {
	return headers.flatMap((header) => {
		if (header === null || typeof header !== "object") return [];
		const tools = header.tools;
		return Array.isArray(tools) ? [tools] : [];
	});
}
/**
* The `data.header` payload of every `request/header` event in a session
* JSONL, in log order, with the log's volatile values scrubbed first
* ({@link normalizeSessionLog}) so headers harvested from different runs —
* each embedding its own generated cwd — compare on equal footing.
*
* @param rawLog The session `.jsonl` content to extract headers from.
* @param ctx The volatile values of the run that produced it.
* @returns The normalized `data.header` payloads, in log order.
*/
function normalizedHeaders(rawLog, ctx) {
	return normalizedHeaderEvents(rawLog, ctx).map((event) => event.header);
}
/**
* The normalized prompt text of every `system/message` event in a session
* JSONL, in log order: the first is the initial system prompt (surface node 0)
* and each later one replaced it or, on an in-history route, appended the
* changed prompt after the cached history. An empty `content` yields `''`; a
* `system/message` without a text block is omitted.
*
* @param rawLog The session `.jsonl` content to inspect.
* @param ctx The volatile values of the run that produced it.
* @returns The normalized system prompts, in log order.
*/
function normalizedSystemPrompts(rawLog, ctx) {
	return parseJsonlRecords(normalizeSessionLog(rawLog, ctx)).flatMap((record) => {
		const prompt = systemPromptOf(record);
		return prompt === void 0 ? [] : [prompt];
	});
}
/**
* Whether every model request in a session JSONL is preceded by its system
* prompt: the log has no `request/header`, or a `system/message` event comes
* before its first `request/header`.
*
* @param rawLog The session `.jsonl` content to inspect.
* @returns True when the first `request/header` (if any) follows a `system/message`.
*/
function systemPromptPrecedesRequests(rawLog) {
	const types = parseJsonlRecords(rawLog).map((record) => record.type);
	const firstHeader = types.indexOf("request/header");
	const firstPrompt = types.indexOf("system/message");
	return firstHeader < 0 || firstPrompt >= 0 && firstPrompt < firstHeader;
}
/**
* The normalized tool-schema arrays carried by request headers in a session
* JSONL, in log order. Headers without an array-valued tools field are omitted
* so callers can assert one schema set per header explicitly.
*
* @param rawLog The session `.jsonl` content to inspect.
* @param ctx The volatile values of the run that produced it.
* @returns The normalized initial tool-schema arrays, in header order.
*/
function normalizedToolSchemas(rawLog, ctx) {
	return toolSchemasFrom(normalizedHeaders(rawLog, ctx));
}
/**
* Render the full tool-schema sequence as canonical, readable JSON.
*
* @param initial The pinned request header's complete tool schemas.
* @param changes Complete tool schemas from later changed headers.
* @returns A pretty-printed JSON snapshot ending in one newline.
*/
function formatToolSchemasSnapshot(initial, changes = []) {
	return `${JSON.stringify({
		initial,
		changes
	}, null, 2)}\n`;
}
/**
* Parse and validate the stable top-level fields of a tool-schema sidecar.
*
* @param snapshot The JSON sidecar text.
* @returns Its initial and changed-header schema sets.
*/
function parseToolSchemasSnapshot(snapshot) {
	const parsed = JSON.parse(snapshot);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("acp-snapshot: tool-schema snapshot must be an object");
	const { initial, changes } = parsed;
	if (!Array.isArray(initial) || !Array.isArray(changes) || !changes.every(Array.isArray)) throw new Error("acp-snapshot: tool-schema snapshot must carry array-valued initial and changes fields");
	return {
		initial,
		changes
	};
}
/**
* Restore one sidecar schema set into a tokenized pinned header.
*
* @param header The parsed request header carrying a tools token or ordered tool names matching the sidecar.
* @param schemas The complete schemas for this full header snapshot.
* @returns A copy of the header with its complete schemas restored.
*/
function restorePinnedToolSchemas(header, schemas) {
	if (header === null || typeof header !== "object" || Array.isArray(header)) throw new Error("acp-snapshot: pinned request header must be an object");
	const tools = header.tools;
	const namesMatch = Array.isArray(tools) && tools.length === schemas.length && tools.every((name, index) => {
		const schema = schemas[index];
		return typeof name === "string" && schema !== null && typeof schema === "object" && "name" in schema && schema.name === name;
	});
	if (tools !== TOOLS_TOKEN && !namesMatch) throw new Error(`acp-snapshot: pinned request header tools must equal ${TOOLS_TOKEN} or the ordered sidecar tool names`);
	return {
		...header,
		tools: schemas
	};
}
/** Marker line separating one replaced prompt from the previous one in a prompt sidecar. */
const SYSTEM_PROMPT_CHANGE_MARKER = "\n<!-- system/message change ";
/**
* Render a normalized prompt as a repository-friendly Markdown snapshot.
* Prompt text is unchanged except that a missing terminal newline is added so
* the committed file follows the repository newline contract.
*
* @param prompt The normalized initial system prompt (surface node 0).
* @param changes Full normalized prompts from later `system/message` events, replacements or in-history appends.
* @returns Markdown snapshot text ending in a newline.
*/
function formatSystemPromptSnapshot(prompt, changes = []) {
	let snapshot = prompt.endsWith("\n") ? prompt : `${prompt}\n`;
	for (const [index, change] of changes.entries()) {
		snapshot += `${SYSTEM_PROMPT_CHANGE_MARKER}${index + 1} -->\n\n`;
		snapshot += change.endsWith("\n") ? change : `${change}\n`;
	}
	return snapshot;
}
/**
* Split a prompt sidecar into its initial prompt and each later change, the
* inverse of {@link formatSystemPromptSnapshot}.
*
* @param snapshot The Markdown sidecar text.
* @returns The initial prompt snapshot plus one entry per later `system/message`.
*/
function parseSystemPromptSnapshot(snapshot) {
	const parts = snapshot.split(/\n<!-- system\/message change [1-9]\d* -->\n\n/);
	return {
		initial: parts[0],
		changes: parts.slice(1)
	};
}
/**
* Reject a child prompt sidecar that cannot own distinct, canonical prompt text.
* @param sidecar - committed child prompt snapshot.
* @param classPin - initial prompt snapshot owned by the scenario's header class.
* @param label - repository-relative fixture label for diagnostics.
*/
function assertChildSystemPromptSnapshot(sidecar, classPin, label) {
	if (sidecar.trim().length === 0) throw new Error(`${label} must pin a non-empty prompt`);
	if (!sidecar.endsWith("\n")) throw new Error(`${label} must end in a newline`);
	if (sidecar === classPin) throw new Error(`${label} must differ from its class pin`);
}
/** Return the initial-prompt portion of a possibly multi-prompt snapshot. */
function initialSystemPromptSnapshot(snapshot) {
	return parseSystemPromptSnapshot(snapshot).initial;
}
/**
* Count changed `request/header` snapshots in a session JSONL.
*
* @param rawLog The session `.jsonl` content.
* @returns How many headers carry reason `change`.
*/
function headerChangeCount(rawLog) {
	return rawLog.split("\n").filter((line) => line.trim().length > 0).filter((line) => {
		const record = JSON.parse(line);
		return record.type === "request/header" && record.data?.reason === "change";
	}).length;
}
function parseJsonlRecords(text) {
	return text.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}
/** Narrow one parsed value to the complete identified-message shape retained by fixtures. */
function completeMessage(value) {
	if (!isRecord(value) || typeof value.id !== "string" || !UUID_RE.test(value.id) || typeof value.role !== "string" || !Array.isArray(value.content) || !isRecord(value.source)) return void 0;
	return value;
}
/** Return the complete identified message carried by one surface event. */
function surfaceEventMessage(record) {
	const type = record.type;
	if (typeof type !== "string" || !isSurfaceEligibleType(type)) return void 0;
	const data = record.data;
	if (!isRecord(data)) return void 0;
	let message;
	switch (type) {
		case "user/message":
			message = data;
			break;
		case "system/message":
		case "developer/message":
		case "assistant/message":
		case "tool/result":
			message = data.message;
			break;
		/* v8 ignore next -- the authoritative predicate must fail loud when a new surface shape lands. */
		default: throw new Error(`acp-snapshot: unsupported surface event type "${type}"`);
	}
	return completeMessage(message);
}
/** Return complete message identities structurally owned by one durable record. */
function recordMessages(record) {
	const surfaceMessage = surfaceEventMessage(record);
	if (surfaceMessage !== void 0) return [surfaceMessage];
	if (record.type !== "agent/inbox/spliced" || !isRecord(record.data) || !Array.isArray(record.data.inserted)) return [];
	return record.data.inserted.flatMap((value) => {
		const message = completeMessage(value);
		return message === void 0 ? [] : [message];
	});
}
/** Serialize parsed JSON by value rather than insertion order. */
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
/** Index identity-free message values whose ID and fingerprint are mutually unique. */
function uniqueMessageIds(logs) {
	const fingerprintsById = /* @__PURE__ */ new Map();
	const idsByFingerprint = /* @__PURE__ */ new Map();
	for (const log of logs) for (const record of parseJsonlRecords(log)) for (const message of recordMessages(record)) {
		const { id, ...withoutId } = message;
		const messageId = id;
		const fingerprint = canonicalJson(withoutId);
		const fingerprints = fingerprintsById.get(messageId);
		if (fingerprints === void 0) fingerprintsById.set(messageId, new Set([fingerprint]));
		else fingerprints.add(fingerprint);
		const ids = idsByFingerprint.get(fingerprint);
		if (ids === void 0) idsByFingerprint.set(fingerprint, new Set([messageId]));
		else ids.add(messageId);
	}
	const unique = /* @__PURE__ */ new Map();
	for (const [id, fingerprints] of fingerprintsById) {
		if (fingerprints.size !== 1) continue;
		const fingerprint = fingerprints.values().next().value;
		if (idsByFingerprint.get(fingerprint)?.size !== 1) continue;
		unique.set(fingerprint, id);
	}
	return unique;
}
/**
* Match unchanged complete messages across a scenario's fresh and existing logs.
* New, changed, duplicate-content, or otherwise ambiguous messages keep their fresh ids.
*/
function fixtureMessageIdReplacements(logs, fixtures) {
	const freshIds = uniqueMessageIds(logs);
	const existingIds = uniqueMessageIds(fixtures);
	const replacements = /* @__PURE__ */ new Map();
	for (const [fingerprint, fresh] of freshIds) {
		const existing = existingIds.get(fingerprint);
		if (existing === void 0 || fresh === existing) continue;
		replacements.set(fresh, existing);
	}
	return replacements;
}
/** Apply literal fixture replacements without changing any other fresh value. */
function applyFixtureReplacements(content, replacements) {
	let stable = content;
	for (const { from, to } of replacements) stable = stable.split(from).join(to);
	return stable;
}
/** Rewrite only validated durable-message ID fields, leaving every other occurrence untouched. */
function applyFixtureMessageIds(content, replacements) {
	return content.split("\n").map((line) => {
		if (line.trim().length === 0) return line;
		const record = JSON.parse(line);
		let changed = false;
		for (const message of recordMessages(record)) {
			const replacement = replacements.get(message.id);
			if (replacement === void 0) continue;
			message.id = replacement;
			changed = true;
		}
		return changed ? JSON.stringify(record) : line;
	}).join("\n");
}
/**
* Carry committed UUIDs into unchanged, unambiguous messages in fresh session fixtures.
*
* @param logs Fresh fixture-ready session JSONL contents for one scenario.
* @param fixtures Existing fixture contents in matching order; missing fixtures may be empty strings.
* @returns The fresh contents with only reusable message UUIDs replaced.
*/
function stabilizeFixtureMessageIds(logs, fixtures) {
	const replacements = fixtureMessageIdReplacements(logs, fixtures);
	return logs.map((log) => applyFixtureMessageIds(log, replacements));
}
/** One packed row's member times, or `undefined` for an ordinary record. */
function packedTimes(record) {
	if (!PACKED_CHUNK_ROW_TYPES.has(record.type)) return void 0;
	const row = record;
	const times = [row.time0 ?? 0];
	for (const gap of row.data.dt) times.push(times[times.length - 1] + gap);
	return times;
}
/** Expand packed timing envelopes so refresh alignment follows logical events, not physical lines. */
function logicalRecords(records) {
	return records.flatMap((record) => {
		const times = packedTimes(record);
		return times === void 0 ? [record] : times.map((time) => ({
			type: "assistant/chunk",
			time
		}));
	});
}
/**
* Find tool calls whose structured result reports `UNKNOWN_TOOL`.
*
* Snapshot refresh must not turn a missing registration into accepted behavior;
* intentional unknown-tool behavior belongs in a focused unit or e2e test.
*
* @param rawLog The session JSONL to inspect.
* @returns The failing call ids in log order, using a diagnostic placeholder when absent.
*/
function unknownToolCallIds(rawLog) {
	return parseJsonlRecords(rawLog).flatMap((record) => {
		if (record.type !== "tool/result") return [];
		const data = record.data;
		if (data === null || typeof data !== "object") return [];
		const { message, error } = data;
		if (error === null || typeof error !== "object") return [];
		if (error.code !== "UNKNOWN_TOOL") return [];
		const source = typeof message === "object" && message !== null ? message.source : void 0;
		const callId = typeof source === "object" && source !== null ? source.callId : void 0;
		return [typeof callId === "string" ? callId : "<missing callId>"];
	});
}
/**
* Build refresh write-back replacements for per-log session ids, cwd values,
* and spill paths. Durable message ids have a later structural owner.
*
* @param logs The freshly harvested logs, in fixture order.
* @param fixtures The existing fixture contents, in matching order.
* @returns Literal replacements from fresh values to the fixture's existing values.
*/
function refreshFixtureReplacements(logs, fixtures) {
	const replacements = [];
	for (let i = 0; i < logs.length; i++) {
		const fresh = parseJsonlRecords(logs[i].content)[0];
		const existing = parseJsonlRecords(fixtures[i] ?? "")[0];
		for (const field of ["id", "cwd"]) {
			const from = fresh?.[field];
			const to = existing?.[field];
			if (typeof from === "string" && typeof to === "string" && from.length > 0 && from !== to) replacements.push({
				from,
				to
			});
		}
		const freshSpills = extractSnapshotSpillPaths(logs[i].content);
		const existingSpills = extractSnapshotSpillPaths(fixtures[i] ?? "");
		for (const [name, existingPath] of existingSpills) {
			const freshPath = freshSpills.get(name);
			if (freshPath !== void 0 && freshPath !== existingPath) replacements.push({
				from: freshPath,
				to: existingPath
			});
		}
	}
	return replacements;
}
/**
* Check raw parent/child clocks before normalization, or preserve their equality during refresh.
* @param logs - one scenario's parent and child logs with shared Session ids.
* @param policy - validate live output, or align refreshed catalogs to the retained child headers.
* @returns logs with only conflicting catalog creation times replaced under preserve-headers.
*/
function reconcileCatalogCreationTimes(logs, policy) {
	const headers = new Map(logs.map((log) => {
		const header = parseJsonlRecords(log)[0];
		return [header?.["id"], header];
	}));
	return logs.map((log) => log.split("\n").map((line) => {
		if (line.length === 0) return line;
		const record = JSON.parse(line);
		if (record.type !== "subagent/catalog" || !isRecord(record.data)) return line;
		const child = headers.get(record.data.childId);
		if (child === void 0 || record.data.childCreatedAt === child.createdAt) return line;
		if (policy === "validate") throw new Error(`catalog child ${String(record.data.childId)} creation time ${String(record.data.childCreatedAt)} disagrees with child header ${String(child.createdAt)}`);
		record.data.childCreatedAt = child.createdAt;
		return JSON.stringify(record);
	}).join("\n"));
}
function preserveFixtureVolatiles(record, existing) {
	if (existing === void 0 || existing.type !== record.type) return;
	if (record.type === "session") {
		for (const field of [
			"id",
			"createdAt",
			"cwd",
			"parentSession"
		]) if (field in record && field in existing) record[field] = existing[field];
		return;
	}
	if ("time" in record && "time" in existing) record.time = existing.time;
	if (record.type !== "hook/result") return;
	const data = record.data;
	const existingData = existing.data;
	if (data !== null && typeof data === "object" && existingData !== null && typeof existingData === "object" && "durationMs" in data && "durationMs" in existingData) data.durationMs = existingData.durationMs;
}
/** Carry logical member times into a fresh packed row while leaving its fragment arrays untouched. */
function preservePackedMemberTimes(record, existingMembers) {
	if (!PACKED_CHUNK_ROW_TYPES.has(record.type)) return;
	const row = record;
	const firstTime = existingMembers[0]?.time;
	if (!Number.isSafeInteger(firstTime)) return;
	row.time0 = firstTime;
	if (existingMembers.length !== row.data.dt.length + 1) return;
	const times = existingMembers.map((member) => Number.isSafeInteger(member.time) ? member.time : void 0);
	if (times.some((time) => time === void 0)) return;
	const memberTimes = times;
	const gaps = memberTimes.slice(1).map((time, index) => time - memberTimes[index]);
	if (gaps.some((gap) => !Number.isSafeInteger(gap))) return;
	row.data.dt = gaps;
}
/** Whether a parsed JSON value is a non-array object. */
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Reuse existing leaves whose normalized values equal the fresh values.
* Objects merge by key; arrays merge only when their positions still align.
*/
function preserveNormalizedVolatiles(fresh, existing, normalizedFresh, normalizedExisting, stringMappings) {
	if (Array.isArray(fresh) && Array.isArray(existing) && Array.isArray(normalizedFresh) && Array.isArray(normalizedExisting)) {
		if (fresh.length !== existing.length || fresh.length !== normalizedFresh.length || fresh.length !== normalizedExisting.length) return fresh;
		return fresh.map((value, index) => preserveNormalizedVolatiles(value, existing[index], normalizedFresh[index], normalizedExisting[index], stringMappings));
	}
	if (isRecord(fresh) && isRecord(existing) && isRecord(normalizedFresh) && isRecord(normalizedExisting)) return Object.fromEntries(Object.entries(fresh).map(([key, value]) => [key, Object.hasOwn(existing, key) && Object.hasOwn(normalizedFresh, key) && Object.hasOwn(normalizedExisting, key) ? preserveNormalizedVolatiles(value, existing[key], normalizedFresh[key], normalizedExisting[key], stringMappings) : value]));
	if (typeof fresh === "string" && typeof existing === "string" && typeof normalizedFresh === "string" && normalizedFresh === normalizedExisting) return stringMappings.get(JSON.stringify([normalizedFresh, fresh])) === existing ? existing : fresh;
	return Object.is(normalizedFresh, normalizedExisting) ? existing : fresh;
}
/** Normalize one aligned record with the same contract used by fixture comparison. */
function normalizedRefreshRecord(record, context) {
	return JSON.parse(normalizeSessionLog(`${JSON.stringify(record)}\n`, context));
}
/**
* Add normalized-equivalent string replacements to a bijection.
* Structural differences are fresh-owned and therefore contribute no mapping.
*/
function collectNormalizedStringMappings(fresh, existing, normalizedFresh, normalizedExisting, excludedStrings, forward, reverse) {
	if (Array.isArray(fresh) && Array.isArray(existing) && Array.isArray(normalizedFresh) && Array.isArray(normalizedExisting)) {
		if (fresh.length !== existing.length || fresh.length !== normalizedFresh.length || fresh.length !== normalizedExisting.length) return true;
		return fresh.every((value, index) => collectNormalizedStringMappings(value, existing[index], normalizedFresh[index], normalizedExisting[index], excludedStrings, forward, reverse));
	}
	if (isRecord(fresh) && isRecord(existing) && isRecord(normalizedFresh) && isRecord(normalizedExisting)) return Object.entries(fresh).every(([key, value]) => !Object.hasOwn(existing, key) || !Object.hasOwn(normalizedFresh, key) || !Object.hasOwn(normalizedExisting, key) || collectNormalizedStringMappings(value, existing[key], normalizedFresh[key], normalizedExisting[key], excludedStrings, forward, reverse));
	if (typeof fresh !== "string" || typeof existing !== "string" || typeof normalizedFresh !== "string" || normalizedFresh !== normalizedExisting || fresh === existing || excludedStrings.has(fresh) || excludedStrings.has(existing)) return true;
	const freshKey = JSON.stringify([normalizedFresh, fresh]);
	const existingKey = JSON.stringify([normalizedFresh, existing]);
	const mappedExisting = forward.get(freshKey);
	const mappedFresh = reverse.get(existingKey);
	if (mappedExisting !== void 0 && mappedExisting !== existing || mappedFresh !== void 0 && mappedFresh !== fresh) return false;
	forward.set(freshKey, existing);
	reverse.set(existingKey, fresh);
	return true;
}
/**
* Build a log-wide bijection for normalized-equivalent strings.
* Any unexplained record mismatch or conflicting replacement disables reuse.
*/
function normalizedStringMappings(records, freshRecords, existingRecords, freshContext, existingContext) {
	const excludedStrings = /* @__PURE__ */ new Set();
	for (const record of [...freshRecords, ...existingRecords]) for (const message of recordMessages(record)) excludedStrings.add(message.id);
	const forward = /* @__PURE__ */ new Map();
	const reverse = /* @__PURE__ */ new Map();
	let existingIndex = 0;
	for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
		const record = records[recordIndex];
		const existingRecord = existingRecords[existingIndex];
		const memberCount = packedTimes(record)?.length ?? 1;
		if (record.type === "session/title" && existingRecord?.type !== "session/title") continue;
		if (memberCount > 1) {
			const existingMembers = existingRecords.slice(existingIndex, existingIndex + memberCount);
			if (existingMembers.length !== memberCount || existingMembers.some((member) => member.type !== "assistant/chunk")) return void 0;
		} else {
			if (existingRecord === void 0 || existingRecord.type !== record.type) return void 0;
			if (!collectNormalizedStringMappings(record, existingRecord, normalizedRefreshRecord(freshRecords[recordIndex], freshContext), normalizedRefreshRecord(existingRecord, existingContext), excludedStrings, forward, reverse)) return void 0;
		}
		existingIndex += memberCount;
	}
	return existingIndex === existingRecords.length ? forward : void 0;
}
/**
* Rewrite a fresh replay-produced log so repeated refreshes do not churn
* volatile fixture fields. Meaningful event payloads come from `fresh`; the
* existing fixture lends normalized-equivalent values, including non-message ids, paths,
* creation/event times, spill locators, and hook durations, only when the
* complete record layout aligns and volatile strings form a consistent
* bijection. Complete durable-message ids are excluded because the later
* fixture-ready structural pass owns them. Ambiguous layouts or mappings
* keep fresh strings. Packed timing gaps expand from zero when a projected
* fixture omits `time0`, so packing does not shift later records;
* fresh semantic values and fragment arrays remain authoritative.
*
* @param fresh The newly harvested session JSONL.
* @param existing The committed fixture JSONL being refreshed.
* @param replacements Cross-log literal replacements from {@link refreshFixtureReplacements}.
* @param freshContext The harvested run's ids, cwd, and every cwd alias.
* @returns The stabilized JSONL content to write back.
*/
function stabilizeRefreshLog(fresh, existing, replacements, freshContext) {
	const freshRecords = parseJsonlRecords(fresh);
	const stable = applyFixtureReplacements(fresh, replacements);
	const existingRecords = logicalRecords(parseJsonlRecords(existing));
	const records = parseJsonlRecords(stable);
	const existingContext = fixtureContext(existing);
	const stringMappings = normalizedStringMappings(records, freshRecords, existingRecords, freshContext, existingContext);
	let existingIndex = 0;
	let previousEventTime;
	for (let i = 0; i < records.length; i++) {
		let record = records[i];
		const existingRecord = existingRecords[existingIndex];
		const memberCount = packedTimes(record)?.length ?? 1;
		if (record.type === "session/title" && existingRecord?.type !== "session/title") {
			/* v8 ignore next -- a title is turn-enclosed, so a preceding event time exists in every valid fixture. */
			if (typeof previousEventTime !== "number") throw new Error("acp-snapshot: inserted title has no preceding event time");
			record.time = previousEventTime;
		} else {
			if (stringMappings !== void 0 && memberCount === 1 && existingRecord !== void 0 && existingRecord.type === record.type) {
				record = preserveNormalizedVolatiles(record, existingRecord, normalizedRefreshRecord(freshRecords[i], freshContext), normalizedRefreshRecord(existingRecord, existingContext), stringMappings);
				records[i] = record;
			}
			preservePackedMemberTimes(record, existingRecords.slice(existingIndex, existingIndex + memberCount));
			preserveFixtureVolatiles(record, existingRecord);
			existingIndex += memberCount;
		}
		if (typeof record.time === "number") previousEventTime = record.time;
	}
	return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}
/**
* Check every selected role for tool/path defects and current generations for canonical prompt/identity storage.
* Historical roles retain their released bytes, including roles retired by the current writer.
* @param dir Scenario directory containing canonical Session fixtures.
* @param scenarioName Scenario name used in failure diagnostics.
* @returns Resolves when all selected fixtures satisfy the storage checks.
*/
async function assertSessionFixtureStorage(dir, scenarioName) {
	const files = await sessionFixtures(dir);
	const currentFixtures = [];
	for (const file of files) {
		const fixture = await readFile(join(dir, file), "utf8");
		const version = assertSessionFixtureVersion(file, fixture);
		expect(unknownToolCallIds(fixture), `${scenarioName}/${file} contains UNKNOWN_TOOL`).toEqual([]);
		expect(fixture, `${scenarioName}/${file} carries a non-canonical macOS cwd token`).not.toContain("/private{{cwd}}");
		if (version !== SESSION_FORMAT_VERSION) continue;
		currentFixtures.push(fixture);
		expect(scrubSystemPrompts(fixture), `${scenarioName}/${file} carries an unscrubbed system prompt`).toEqual(fixture);
		expect(scrubToolSchemas(fixture), `${scenarioName}/${file} carries unscrubbed tool schemas`).toEqual(fixture);
		expect(systemPromptPrecedesRequests(fixture), `${scenarioName}/${file} has a request/header with no preceding system/message`).toBe(true);
	}
	expect(redactSessionSnapshotIds(currentFixtures), `${scenarioName}: identity redaction fixed point`).toEqual(currentFixtures);
}
/**
* Register the suite: one test per scenario (the expected-output and log comparisons and
* the header and prompt uniformity guard) plus the fixture guard block (no orphan
* scenario dirs, required files present, exactly one pin per header class,
* shared sidecars unique and well-formed, every JSONL prompt- and
* schema-scrubbed with a `system/message` before its first request). Must
* run at vitest collection time — it calls `describe`/`it`. Throws
* immediately if any header class lacks a pinning scenario or carries two
* (the uniformity guard needs exactly one comparison anchor per class).
*
* @param options The agent, snapshots directory, scenario table, and mode.
*/
function defineAcpSnapshotSuite(options) {
	const { agent, snapshotsDir, scenarios, mode } = options;
	const RECORDING = mode === "record";
	const REFRESHING = mode === "refresh";
	const childMode = RECORDING ? "record" : "replay";
	const scenarioSuite = mode === "replay" ? describe.concurrent : describe;
	/** The class a scenario's header composition belongs to (see {@link Scenario.headerClass}). */
	const classOf = (scenario) => scenario.headerClass ?? "default";
	const scenariosByName = /* @__PURE__ */ new Map();
	for (const scenario of scenarios) {
		if (scenariosByName.has(scenario.name)) throw new Error(`acp-snapshot: duplicate scenario name "${scenario.name}"`);
		scenariosByName.set(scenario.name, scenario);
		for (const field of [
			"systemPromptSource",
			"toolSchemasSource",
			"expectedHeaderChanges",
			"expectedPromptChanges"
		]) if (scenario[field] !== void 0 && scenario.pinsHeader !== true) throw new Error(`acp-snapshot: ${scenario.name}.${field} is only valid on a header-pinning scenario`);
	}
	/** Each header class's single pinning scenario. Guarded here (and by meta-tests) so a pin cannot silently vanish or split. */
	const pinningByClass = /* @__PURE__ */ new Map();
	for (const scenario of scenarios) {
		if (scenario.pinsHeader !== true) continue;
		const cls = classOf(scenario);
		const existing = pinningByClass.get(cls);
		if (existing) throw new Error(`acp-snapshot: header class "${cls}" pinned by both ${existing.name} and ${scenario.name}`);
		pinningByClass.set(cls, scenario);
	}
	for (const scenario of scenarios) if (!pinningByClass.has(classOf(scenario))) throw new Error(`acp-snapshot: no scenario pins the request-header content of class "${classOf(scenario)}" (needed by ${scenario.name})`);
	/**
	* Resolve one pin's sidecar source. A prompt sidecar spans `1 + expectedPromptChanges`
	* prompts and a schema sidecar spans `1 + expectedHeaderChanges` schema sets, so a shared
	* source must declare the count that sizes the sidecar it lends.
	*/
	const sourceFor = (pinningScenario, field, label) => {
		const sourceName = pinningScenario[field] ?? pinningScenario.name;
		const source = scenariosByName.get(sourceName);
		if (source === void 0) throw new Error(`acp-snapshot: ${pinningScenario.name} names unknown ${label} source "${sourceName}"`);
		if (source.pinsHeader !== true) throw new Error(`acp-snapshot: ${pinningScenario.name} names non-pinning ${label} source "${sourceName}"`);
		if (source[field] !== void 0 && source[field] !== source.name) throw new Error(`acp-snapshot: ${pinningScenario.name} names ${label} source "${sourceName}", which does not own its sidecar`);
		const countField = field === "systemPromptSource" ? "expectedPromptChanges" : "expectedHeaderChanges";
		if ((source[countField] ?? 0) !== (pinningScenario[countField] ?? 0)) throw new Error(`acp-snapshot: ${pinningScenario.name} and ${sourceName} declare different ${countField} counts for shared ${label}`);
		return source;
	};
	const promptSourceByClass = /* @__PURE__ */ new Map();
	const schemaSourceByClass = /* @__PURE__ */ new Map();
	for (const [cls, pinningScenario] of pinningByClass) {
		promptSourceByClass.set(cls, sourceFor(pinningScenario, "systemPromptSource", "system-prompt snapshot"));
		schemaSourceByClass.set(cls, sourceFor(pinningScenario, "toolSchemasSource", "tool-schema snapshot"));
	}
	const promptOwners = new Set([...promptSourceByClass.values()].map((source) => source.name));
	const schemaOwners = new Set([...schemaSourceByClass.values()].map((source) => source.name));
	const promptClaims = /* @__PURE__ */ new Map();
	const schemaClaims = /* @__PURE__ */ new Map();
	scenarioSuite("snapshot scenarios", () => {
		for (const scenario of scenarios) it.skipIf(scenarioSkipped(scenario, RECORDING, process.platform, options.hasPwsh))(`snapshot: ${scenario.name} matches the expected outputs`, async ({ expect }) => {
			const dir = join(snapshotsDir, scenario.name);
			const manifestPath = join(dir, "snapshot.yml");
			const manifest = parseSnapshotManifest(await readFile(manifestPath, "utf8"), manifestPath);
			const input = JSON.parse(await readFile(join(dir, "input.json"), "utf8"));
			const overrideFile = join(dir, "replay.override.json");
			const workspaceDir = join(dir, "workspace");
			let fixtureFiles = RECORDING ? [] : await sessionFixtures(dir);
			const childFixtureFiles = fixtureFiles.slice(1);
			const primaryFixtureFile = fixtureFiles[0] ?? sessionFixtureName(0, 0);
			const comparesLog = scenario.comparesLog ?? (scenario.hasModelTurn && manifest.sessionFormat === void 0);
			const result = await runScenario(input, {
				agent,
				mode: childMode,
				fixtureFile: join(dir, primaryFixtureFile),
				...scenario.env !== void 0 ? { env: scenario.env } : {},
				...existsSync(overrideFile) ? { overrideFile } : {},
				...!RECORDING && childFixtureFiles.length > 0 ? { childFiles: childFixtureFiles.map((file) => join(dir, file)) } : {},
				...existsSync(workspaceDir) ? { workspaceDir } : {},
				...scenario.prepareWorkspace !== void 0 ? { prepareWorkspace: scenario.prepareWorkspace } : {},
				...scenario.workspaceParent !== void 0 ? { workspaceParent: scenario.workspaceParent } : {},
				...scenario.configPath !== void 0 ? { configPath: scenario.configPath } : {}
			});
			reconcileCatalogCreationTimes(result.sessionLogs.map((log) => log.content), "validate");
			for (const log of result.sessionLogs) expect(unknownToolCallIds(log.content), `session ${log.id}: snapshot scenarios must not accept UNKNOWN_TOOL`).toEqual([]);
			const ctx = {
				sessionIds: [...result.sessionId !== void 0 ? [result.sessionId] : [], ...result.sessionLogs.map((l) => l.id)],
				cwd: result.cwd,
				cwdAliases: result.cwdAliases
			};
			const childSchemaPins = new Set(scenario.pinsChildToolSchemas ?? []);
			const childPromptPins = new Set(scenario.pinsChildSystemPrompts ?? []);
			const portableFixture = scenario.workspaceParent === void 0 ? tokenizeSessionFixtureCwd : (log) => log;
			if (writesCurrentSessionFixtures(manifest, mode) && (RECORDING && scenario.recorded && scenario.hasModelTurn || REFRESHING && comparesLog)) {
				expect(result.sessionLogs.length, `${mode} produced no session log to harvest`).toBeGreaterThan(0);
				if (REFRESHING) expect(result.sessionLogs.length, `expected ${fixtureFiles.length} session logs (parent + children)`).toBe(fixtureFiles.length);
				const outputFixtureFiles = result.sessionLogs.map((log, index) => sessionFixtureName(index, sessionHeaderVersion(log.content, `harvested Session ${index}`)));
				const existingFixtures = await Promise.all(outputFixtureFiles.map(async (_file, index) => {
					const file = fixtureFiles[index];
					if (file === void 0) return "";
					return readFile(join(dir, file), "utf8");
				}));
				const refreshReplacements = REFRESHING ? refreshFixtureReplacements(result.sessionLogs, existingFixtures) : [];
				const outputFixtures = redactSessionSnapshotIds(stabilizeFixtureMessageIds(reconcileCatalogCreationTimes(REFRESHING ? result.sessionLogs.map((log, index) => scrubSessionSnapshot(portableFixture(stabilizeRefreshLog(log.content, existingFixtures[index], refreshReplacements, ctx)))) : result.sessionLogs.map((log) => scrubSessionSnapshot(portableFixture(log.content))), "preserve-headers"), existingFixtures));
				await Promise.all(outputFixtures.map((fixture, index) => writeFile(join(dir, outputFixtureFiles[index]), fixture)));
				fixtureFiles = outputFixtureFiles;
				if (scenario.pinsHeader === true) {
					const primary = result.sessionLogs[0];
					const prompts = normalizedSystemPrompts(primary.content, ctx);
					expect(prompts.length, `${mode} produced a system prompt count that differs from 1 + expectedPromptChanges`).toBe(1 + (scenario.expectedPromptChanges ?? 0));
					const promptSnapshot = formatSystemPromptSnapshot(prompts[0], prompts.slice(1));
					const promptPath = join(snapshotsDir, (promptSourceByClass.get(classOf(scenario)) ?? scenario).name, SYSTEM_PROMPT_SNAPSHOT);
					claimSharedSnapshot(promptClaims, promptPath, scenario.name, promptSnapshot);
					await writeFile(promptPath, promptSnapshot);
					const schemaSets = toolSchemasFrom(pinningHeaderPayloads(primary.content, ctx));
					expect(schemaSets.length, `${mode} produced a tool-schema count that differs from 1 + expectedHeaderChanges`).toBe(1 + (scenario.expectedHeaderChanges ?? 0));
					const toolSchemasSnapshot = formatToolSchemasSnapshot(schemaSets[0], schemaSets.slice(1));
					const schemaPath = join(snapshotsDir, (schemaSourceByClass.get(classOf(scenario)) ?? scenario).name, TOOL_SCHEMAS_SNAPSHOT);
					claimSharedSnapshot(schemaClaims, schemaPath, scenario.name, toolSchemasSnapshot);
					await writeFile(schemaPath, toolSchemasSnapshot);
				}
				for (const index of childSchemaPins) {
					const log = result.sessionLogs[index];
					expect(log, `${mode}: no child session log at index ${index} to snapshot schemas from`).toBeDefined();
					const schemaSets = toolSchemasFrom(pinningHeaderPayloads(log.content, ctx));
					expect(schemaSets.length, `${mode}: child ${index} produced no tool schemas to snapshot`).toBeGreaterThan(0);
					await writeFile(join(dir, childToolSchemasSnapshot(index)), formatToolSchemasSnapshot(schemaSets[0], schemaSets.slice(1)));
				}
				for (const index of childPromptPins) {
					const log = result.sessionLogs[index];
					expect(log, `${mode}: no child session log at index ${index} to snapshot a prompt from`).toBeDefined();
					const prompts = normalizedSystemPrompts(log.content, ctx);
					expect(prompts.length, `${mode}: child ${index} produced no system prompt to snapshot`).toBeGreaterThan(0);
					await writeFile(join(dir, childSystemPromptSnapshot(index)), formatSystemPromptSnapshot(prompts[0]));
				}
			}
			for (const expected of stdoutExpectedVariants(scenario)) {
				const stdout = normalizeStdout(result.rawStdout, ctx, { cwdPathMode: expected.cwdPathMode });
				if (REFRESHING) await writeFile(join(dir, expected.file), stdout);
				await expect(stdout, `${expected.file} mismatch`).toMatchFileSnapshot(join(dir, expected.file));
			}
			if (comparesLog) {
				expect(result.sessionLogs.length, "this scenario must persist one log per session fixture").toBe(fixtureFiles.length);
				const harvested = result.sessionLogs.map((log) => log.content);
				const fixtures = await Promise.all(fixtureFiles.map((file) => readFile(join(dir, file), "utf8")));
				const fixtureContexts = fixtures.map(fixtureContext);
				const fixtureCtx = {
					sessionIds: fixtureContexts.flatMap((context) => context.sessionIds),
					cwd: fixtureContexts[0].cwd
				};
				const actualSnapshots = normalizeSessionSnapshots(harvested, ctx, { nativeWriterOutput: true });
				const expectedSnapshots = normalizeSessionSnapshots(fixtures, fixtureCtx, { nativeWriterOutput: true });
				for (const [index, actual] of actualSnapshots.entries()) expect(actual, `${fixtureFiles[index]} mismatch`).toEqual(expectedSnapshots[index]);
			}
			/* v8 ignore next -- construction guarantees the pin exists; a miss would fail the one-header assertion loudly. */
			const pinningScenario = pinningByClass.get(classOf(scenario)) ?? scenario;
			/* v8 ignore next -- registration guarantees every scenario class has resolved sources. */
			const promptSource = promptSourceByClass.get(classOf(scenario)) ?? pinningScenario;
			/* v8 ignore next -- registration guarantees every scenario class has resolved sources. */
			const schemaSource = schemaSourceByClass.get(classOf(scenario)) ?? pinningScenario;
			const pinningDir = join(snapshotsDir, pinningScenario.name);
			const [pinningFixtureFile] = await sessionFixtures(pinningDir);
			const pinnedFixture = await readFile(join(pinningDir, pinningFixtureFile), "utf8");
			const pinned = pinningHeaderPayloads(pinnedFixture, fixtureContext(pinnedFixture));
			const promptSnapshot = await readFile(join(snapshotsDir, promptSource.name, SYSTEM_PROMPT_SNAPSHOT), "utf8");
			const initialPromptSnapshot = initialSystemPromptSnapshot(promptSnapshot);
			expect(pinned.length, `the pinning fixture (${pinningScenario.name}) has an unexpected request/header count`).toBe(1 + (pinningScenario.expectedHeaderChanges ?? 0));
			expect(parseSystemPromptSnapshot(promptSnapshot).changes.length, `the prompt source (${promptSource.name}) has an unexpected system prompt change count`).toBe(pinningScenario.expectedPromptChanges ?? 0);
			const toolSchemasSnapshot = await readFile(join(snapshotsDir, schemaSource.name, TOOL_SCHEMAS_SNAPSHOT), "utf8");
			const toolSchemas = parseToolSchemasSnapshot(toolSchemasSnapshot);
			const pinnedSchemaSets = [toolSchemas.initial, ...toolSchemas.changes];
			expect(pinnedSchemaSets.length, `the schema source (${schemaSource.name}) has an unexpected tool-schema count`).toBe(pinned.length);
			const pinnedHeaders = pinned.map((header, index) => restorePinnedToolSchemas(header, pinnedSchemaSets[index]));
			const childPinnedSchemas = /* @__PURE__ */ new Map();
			for (const index of childSchemaPins) {
				const parsed = parseToolSchemasSnapshot(await readFile(join(dir, childToolSchemasSnapshot(index)), "utf8"));
				childPinnedSchemas.set(index, [parsed.initial, ...parsed.changes]);
			}
			const childPinnedPrompts = /* @__PURE__ */ new Map();
			for (const index of childPromptPins) childPinnedPrompts.set(index, await readFile(join(dir, childSystemPromptSnapshot(index)), "utf8"));
			for (const [logIndex, log] of result.sessionLogs.entries()) {
				const childSchemas = childPinnedSchemas.get(logIndex);
				const pinsPrimary = scenario.pinsHeader === true && logIndex === 0;
				const expectedChanges = pinsPrimary ? scenario.expectedHeaderChanges ?? 0 : 0;
				const expectedPromptChanges = pinsPrimary ? scenario.expectedPromptChanges ?? 0 : 0;
				expect(headerChangeCount(log.content), `session ${log.id}: changed request/header count`).toBe(expectedChanges);
				const headerEvents = normalizedHeaderEvents(log.content, ctx);
				const headers = headerEvents.map((event) => event.header);
				const prompts = normalizedSystemPrompts(log.content, ctx);
				expect(normalizedToolSchemas(log.content, ctx).length, `session ${log.id}: every request/header must carry an array-valued tools field`).toBe(headers.length);
				if (headers.length > 0) {
					expect(systemPromptPrecedesRequests(log.content), `session ${log.id}: a system/message must precede the first request/header`).toBe(true);
					expect(prompts.length, `session ${log.id}: system/message count`).toBe(1 + expectedPromptChanges);
				}
				if (childSchemas !== void 0) expect(childSchemas.length, `session ${log.id}: ${childToolSchemasSnapshot(logIndex)} has an unexpected tool-schema count`).toBe(1 + headerChangeCount(log.content));
				let revision = 0;
				for (const [k, header] of headers.entries()) {
					if (headerEvents[k]?.reason === "change") revision++;
					const classPin = expectedChanges > 0 ? pinnedHeaders[revision] : pinnedHeaders[0];
					const expected = childSchemas === void 0 ? classPin : {
						...classPin,
						tools: childSchemas[revision]
					};
					expect(header, `session ${log.id}: request/header #${k + 1} diverged from the pinned (${pinningScenario.name}) header`).toEqual(expected);
				}
				if (expectedPromptChanges === 0) {
					const childPrompt = childPinnedPrompts.get(logIndex);
					const promptOrigin = childPrompt === void 0 ? `${promptSource.name}/${SYSTEM_PROMPT_SNAPSHOT}` : childSystemPromptSnapshot(logIndex);
					for (const [k, prompt] of prompts.entries()) expect(formatSystemPromptSnapshot(prompt), `session ${log.id}: system prompt #${k + 1} diverged from ${promptOrigin}`).toEqual(childPrompt ?? initialPromptSnapshot);
				}
				if (pinsPrimary) {
					const pinningSchemas = toolSchemasFrom(pinningHeaderPayloads(log.content, ctx));
					expect(formatSystemPromptSnapshot(prompts[0], prompts.slice(1)), `session ${log.id}: changed system prompts diverged from ${promptSource.name}/${SYSTEM_PROMPT_SNAPSHOT}`).toEqual(promptSnapshot);
					expect(formatToolSchemasSnapshot(pinningSchemas[0], pinningSchemas.slice(1)), `session ${log.id}: changed tool schemas diverged from ${schemaSource.name}/${TOOL_SCHEMAS_SNAPSHOT}`).toEqual(toolSchemasSnapshot);
				}
			}
			if (manifest.workspace?.final === true) {
				const expectedWorkspace = await captureExpectedWorkspaceSnapshot(join(dir, "workspace.expected"));
				expect(result.finalWorkspace, `${scenario.name}: complete final workspace`).toEqual(expectedWorkspace);
			} else expect(result.finalWorkspace, `${scenario.name}: a changed workspace requires workspace.final`).toEqual(result.initialWorkspace);
		});
	});
	describe("snapshot fixtures", () => {
		it("every scenario directory is registered (no orphans)", async () => {
			const onDisk = (await readdir(snapshotsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
			const registered = scenarios.map((s) => s.name).sort();
			expect(onDisk).toEqual(registered);
		});
		it("every registered scenario has its required fixture files", async () => {
			for (const { name, overridden, pinsNativeWindowsStdout, pinsChildToolSchemas, pinsChildSystemPrompts } of scenarios) {
				const dir = join(snapshotsDir, name);
				const files = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
				const manifestPath = join(dir, "snapshot.yml");
				expect(existsSync(manifestPath), `${name}/snapshot.yml`).toBe(true);
				const manifest = parseSnapshotManifest(await readFile(manifestPath, "utf8"), manifestPath);
				expect(manifest.profile, `${name}: manifest profile`).toBe(agent.profile ?? "acp");
				expect(manifest.session, `${name}: ACP scenarios own their session`).toBeUndefined();
				const childIndices = (pattern) => new Set(files.map((file) => pattern.exec(file)).filter((match) => match !== null).map((match) => Number(match[1])));
				expect(childIndices(/^tool-schemas\.([1-9]\d*)\.expected\.json$/), `${name}: child tool-schema sidecars must match \`pinsChildToolSchemas\``).toEqual(new Set(pinsChildToolSchemas ?? []));
				expect(childIndices(/^system-prompt\.([1-9]\d*)\.expected\.md$/), `${name}: child system-prompt sidecars must match \`pinsChildSystemPrompts\``).toEqual(new Set(pinsChildSystemPrompts ?? []));
				expect(existsSync(join(dir, "input.json")), `${name}/input.json`).toBe(true);
				expect(existsSync(join(dir, "stdout.expected.jsonl")), `${name}/stdout.expected.jsonl`).toBe(true);
				expect(existsSync(join(dir, WINDOWS_STDOUT_SNAPSHOT)), `${name}/${WINDOWS_STDOUT_SNAPSHOT} presence must match \`pinsNativeWindowsStdout\``).toBe(pinsNativeWindowsStdout === true);
				expect(existsSync(join(dir, "replay.override.json")), `${name}/replay.override.json presence must match \`overridden\``).toBe(overridden === true);
				expect(existsSync(join(dir, SYSTEM_PROMPT_SNAPSHOT)), `${name}/${SYSTEM_PROMPT_SNAPSHOT} presence must match snapshot-source ownership`).toBe(promptOwners.has(name));
				expect(existsSync(join(dir, TOOL_SCHEMAS_SNAPSHOT)), `${name}/${TOOL_SCHEMAS_SNAPSHOT} presence must match snapshot-source ownership`).toBe(schemaOwners.has(name));
				await expect(sessionFixtures(dir), `${name}: session fixture inventory`).resolves.toBeDefined();
			}
		});
		it("exactly one scenario pins the request-header content of each header class", () => {
			const pins = /* @__PURE__ */ new Map();
			for (const scenario of scenarios.filter((s) => s.pinsHeader === true)) {
				const cls = classOf(scenario);
				pins.set(cls, [...pins.get(cls) ?? [], scenario.name]);
			}
			expect(Object.fromEntries([...pins].map(([cls, names]) => [cls, names.length]))).toEqual(Object.fromEntries([...pinningByClass.keys()].map((cls) => [cls, 1])));
			for (const scenario of scenarios) expect(pinningByClass.has(classOf(scenario)), `class "${classOf(scenario)}" (scenario ${scenario.name}) has a pin`).toBe(true);
		});
		it("every pinning fixture composes one tokenized header sequence with its referenced sidecars", async () => {
			for (const scenario of pinningByClass.values()) {
				/* v8 ignore next -- registration guarantees every pin has resolved sources. */
				const promptSource = promptSourceByClass.get(classOf(scenario)) ?? scenario;
				/* v8 ignore next -- registration guarantees every pin has resolved sources. */
				const schemaSource = schemaSourceByClass.get(classOf(scenario)) ?? scenario;
				const fixtureDir = join(snapshotsDir, scenario.name);
				const [fixtureFile] = await sessionFixtures(fixtureDir);
				const fixture = await readFile(join(fixtureDir, fixtureFile), "utf8");
				const headers = pinningHeaderPayloads(fixture, fixtureContext(fixture));
				const promptSnapshot = await readFile(join(snapshotsDir, promptSource.name, SYSTEM_PROMPT_SNAPSHOT), "utf8");
				expect(headers.length, `${scenario.name}: unexpected request/header count`).toBe(1 + (scenario.expectedHeaderChanges ?? 0));
				const toolSchemasSnapshot = await readFile(join(snapshotsDir, schemaSource.name, TOOL_SCHEMAS_SNAPSHOT), "utf8");
				const toolSchemas = parseToolSchemasSnapshot(toolSchemasSnapshot);
				const schemaSets = [toolSchemas.initial, ...toolSchemas.changes];
				expect(schemaSets.length, `${schemaSource.name}: tool-schema sequence must match ${scenario.name}'s header sequence`).toBe(headers.length);
				for (const [index, header] of headers.entries()) expect(() => restorePinnedToolSchemas(header, schemaSets[index]), `${scenario.name}: tools must use the sidecar token`).not.toThrow();
				expect(promptSnapshot.length, `${promptSource.name}/${SYSTEM_PROMPT_SNAPSHOT} must not be empty`).toBeGreaterThan(0);
				expect(promptSnapshot.endsWith("\n"), `${promptSource.name}/${SYSTEM_PROMPT_SNAPSHOT} must end in a newline`).toBe(true);
				expect(parseSystemPromptSnapshot(promptSnapshot).changes.length, `${promptSource.name}: prompt change count must match ${scenario.name}'s expectedPromptChanges`).toBe(scenario.expectedPromptChanges ?? 0);
				expect(normalizedSystemPrompts(fixture, fixtureContext(fixture)).length, `${scenario.name}: a pinning fixture must carry exactly its declared system/message count`).toBe(1 + (scenario.expectedPromptChanges ?? 0));
				expect(toolSchemasSnapshot, `${schemaSource.name}/${TOOL_SCHEMAS_SNAPSHOT} must use canonical JSON formatting`).toBe(formatToolSchemasSnapshot(toolSchemas.initial, toolSchemas.changes));
				expect(headerChangeCount(fixture), `${scenario.name}: a pinning fixture must carry exactly its declared changed headers`).toBe(scenario.expectedHeaderChanges ?? 0);
			}
		});
		it("stores each distinct prompt and tool-schema snapshot once", async () => {
			const prompts = await Promise.all([...promptOwners].map(async (owner) => ({
				path: `${owner}/${SYSTEM_PROMPT_SNAPSHOT}`,
				content: await readFile(join(snapshotsDir, owner, SYSTEM_PROMPT_SNAPSHOT), "utf8")
			})));
			const schemas = await Promise.all([...schemaOwners].map(async (owner) => ({
				path: `${owner}/${TOOL_SCHEMAS_SNAPSHOT}`,
				content: await readFile(join(snapshotsDir, owner, TOOL_SCHEMAS_SNAPSHOT), "utf8")
			})));
			assertUniqueSnapshotContents("system-prompt", prompts);
			assertUniqueSnapshotContents("tool-schema", schemas);
		});
		it("every declared child sidecar is canonical and names a real child", async () => {
			for (const scenario of scenarios) {
				const dir = join(snapshotsDir, scenario.name);
				const files = await sessionFixtures(dir);
				for (const index of scenario.pinsChildToolSchemas ?? []) {
					expect(files[index], `${scenario.name}: child schema pin ${index} must name an existing session.<n>.jsonl fixture`).toBeDefined();
					const file = childToolSchemasSnapshot(index);
					const sidecar = await readFile(join(dir, file), "utf8");
					const parsed = parseToolSchemasSnapshot(sidecar);
					expect(sidecar, `${scenario.name}/${file} must use canonical JSON formatting`).toBe(formatToolSchemasSnapshot(parsed.initial, parsed.changes));
					expect(parsed.initial.length, `${scenario.name}/${file} must pin at least one schema`).toBeGreaterThan(0);
				}
				for (const index of scenario.pinsChildSystemPrompts ?? []) {
					expect(files[index], `${scenario.name}: child prompt pin ${index} must name an existing session.<n>.jsonl fixture`).toBeDefined();
					const file = childSystemPromptSnapshot(index);
					assertChildSystemPromptSnapshot(await readFile(join(dir, file), "utf8"), initialSystemPromptSnapshot(await readFile(join(snapshotsDir, (promptSourceByClass.get(classOf(scenario)) ?? scenario).name, SYSTEM_PROMPT_SNAPSHOT), "utf8")), `${scenario.name}/${file}`);
				}
			}
		});
		it("every committed JSONL has valid tool results and canonical fixture storage", async () => {
			for (const scenario of scenarios) await assertSessionFixtureStorage(join(snapshotsDir, scenario.name), scenario.name);
		});
	});
}
//#endregion
export { EMPTY_WORKSPACE_MARKER, assertPersistedSessionVersion, assertSessionFixtureVersion, captureExpectedWorkspaceSnapshot, captureWorkspaceSnapshot, defineAcpSnapshotSuite, extractSnapshotSpillPaths, fixtureContext, formatSystemPromptSnapshot, formatToolSchemasSnapshot, headerChangeCount, latestPersistedSessionPaths, launchAcpTestAgent, materializeProfilePatch, normalizeSessionFormatMetadata, normalizeSessionLog, normalizeSessionSnapshot, normalizeSessionSnapshots, normalizeStdout, normalizedHeaders, normalizedSystemPrompts, normalizedToolSchemas, parsePersistedSessionFilename, parseSessionFixtureName, parseSnapshotManifest, parseSystemPromptSnapshot, parseToolSchemasSnapshot, persistedSessionFilename, reconcileCatalogCreationTimes, redactSessionSnapshotIds, refreshFixtureReplacements, restorePinnedToolSchemas, runScenario, scrubModelRequestBulk, scrubSessionSnapshot, scrubSystemPrompts, scrubToolSchemas, sessionFixtureFiles, sessionFixtureName, sessionFixtureNames, sessionHeaderVersion, snapshotSpillRoot, stabilizeFixtureMessageIds, stabilizeRefreshLog, systemPromptPrecedesRequests, tokenizeSessionFixtureCwd, writerSnapshotName, writesCurrentSessionFixtures };
