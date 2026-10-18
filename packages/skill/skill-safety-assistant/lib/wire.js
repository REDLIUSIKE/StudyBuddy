import { z } from "zod";
//#region ../../util/brand/lib/index.js
/**
* Duplicate-install-safe nominal primitive helpers.
*
* A brand makes structurally identical strings or numbers non-interchangeable
* at the type level: a `SessionId` cannot be passed where a `ToolCallId` is
* expected, and an event sequence cannot be passed as a log offset. Comparison,
* logging, and serialization retain the underlying primitive behavior.
*
* This package owns no concrete domain value and keeps no runtime identity or mutable
* state, so independently installed copies produce interchangeable values.
*
* @module @deepseek-ai/dsh-brand
*/
/**
* Apply a compile-time string brand without changing the value.
* @param value - string admitted by the domain that owns the target brand.
* @returns the same string with the requested compile-time brand.
*/
function brandString(value) {
	return value;
}
//#endregion
//#region lib/types/errors.js
/** Failure code is stable; receiving UI owns localized copy and the safe next action. */
var SkillSafetyError = class extends Error {
	/** Machine-readable failure identity. */
	code;
	constructor(code, options) {
		super(code, options);
		this.name = "SkillSafetyError";
		this.code = code;
	}
};
//#endregion
//#region lib/types/wire.js
/** Closed, bounded private Host–Main messages; no live Agent, path or credential. */
const id = z.string().min(1).max(256).regex(/^[^\p{Cc}]+$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const requestId = id.transform((value) => brandString(value));
const intentId = id.transform((value) => brandString(value));
const actor = z.object({
	accountId: id,
	generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	sessionId: id.transform((value) => brandString(value))
}).strict();
const command = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("find"),
		requestId,
		query: z.string().trim().min(1).max(2048)
	}).strict(),
	z.object({
		kind: z.literal("prepare-scanner"),
		requestId
	}).strict(),
	z.object({
		kind: z.literal("scan"),
		requestId,
		jobId: id.transform((value) => brandString(value)),
		candidateId: id.transform((value) => brandString(value))
	}).strict(),
	z.object({
		kind: z.literal("install"),
		requestId,
		reportId: id.transform((value) => brandString(value))
	}).strict()
]);
const question = z.object({
	id,
	header: z.string().max(64).optional(),
	question: z.string().min(1).max(4096),
	options: z.array(z.object({ label: z.string().min(1).max(128) }).strict()).min(2).max(2)
}).strict();
const prepared = z.object({
	intentId,
	requestId,
	argumentDigest: digest,
	question: question.optional()
}).strict();
const answer = z.object({ answers: z.array(z.object({
	id,
	selected: z.array(z.string().max(128)).max(2),
	custom: z.string().max(4096).optional()
}).strict()).max(1) }).strict();
const context = z.object({
	hostGeneration: id,
	actor
}).strict();
const operation = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("preflight"),
		command
	}).strict(),
	z.object({
		kind: z.literal("execute"),
		prepared,
		answer: answer.optional()
	}).strict(),
	z.object({
		kind: z.literal("release"),
		prepared
	}).strict()
]);
const invocation = z.object({
	rpcId: z.string().uuid(),
	context,
	operation
}).strict();
const severity = z.enum([
	"none",
	"info",
	"low",
	"medium",
	"high",
	"critical"
]);
const failure = z.object({
	code: id,
	action: z.enum([
		"retry",
		"choose-source",
		"choose-model",
		"cancel",
		"contact-support"
	])
}).strict();
/** One strict decoder for durable records and private process results. */
const skillSafetyResultSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("scanner-ready"),
		value: z.object({
			status: z.literal("ready"),
			target: z.literal("win32-x64"),
			scannerVersion: z.literal("2.2.2"),
			manifestSha256: digest
		}).strict()
	}).strict(),
	z.object({
		kind: z.literal("candidates"),
		value: z.object({
			jobId: id.transform((value) => brandString(value)),
			status: z.enum([
				"matches",
				"no-match",
				"incomplete",
				"failed"
			]),
			candidates: z.array(z.object({
				candidateId: id.transform((value) => brandString(value)),
				kind: z.enum(["installed", "github"]),
				displayName: id,
				purpose: z.string().max(2048),
				sourceLabel: id,
				sourceUrl: z.string().max(2048).optional()
			}).strict()).max(1e3),
			failure: failure.optional()
		}).strict()
	}).strict(),
	z.object({
		kind: z.literal("report"),
		value: z.object({
			reportId: id.transform((value) => brandString(value)),
			artifactId: id.transform((value) => brandString(value)),
			artifactDigest: digest,
			configDigest: digest,
			scannerIdentity: id,
			modelIdentity: id,
			status: z.enum([
				"complete",
				"partial",
				"failed",
				"cancelled"
			]),
			findings: z.array(z.object({
				ruleId: id,
				severity,
				originalSeverity: id,
				title: z.string().max(8192),
				evidence: z.string().max(1024 * 1024),
				relativePath: z.string().max(32768).optional(),
				original: z.record(z.string(), z.unknown()).optional()
			}).strict()).max(1e4),
			maxSeverity: severity,
			eligible: z.boolean(),
			reviewRequired: z.boolean(),
			failure: failure.optional()
		}).strict()
	}).strict(),
	z.object({
		kind: z.literal("receipt"),
		value: z.object({
			operationId: id.transform((value) => brandString(value)),
			jobId: id.transform((value) => brandString(value)),
			status: z.enum([
				"installed",
				"conflict",
				"unknown"
			]),
			writesManifestDigest: digest,
			readbackDigest: digest.optional()
		}).strict()
	}).strict()
]);
function decode(schema, value) {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new SkillSafetyError("SKILL_SAFETY_COMMAND_INVALID");
	return parsed.data;
}
/** Decode the private native actor, never model arguments. @param value - Bounded IPC value. */
function parseSkillSafetyActor(value) {
	return decode(actor, value);
}
/** Decode one closed command. @param value - Tool/IPC data with no extra fields. */
function parseSkillSafetyCommand(value) {
	return decode(command, value);
}
/** Decode the private prepared projection. @param value - Main reply. */
function parseSkillSafetyPrepared(value) {
	const parsed = decode(prepared, value);
	const notice = parsed.question;
	return {
		intentId: parsed.intentId,
		requestId: parsed.requestId,
		argumentDigest: parsed.argumentDigest,
		...notice === void 0 ? {} : { question: {
			id: notice.id,
			question: notice.question,
			options: notice.options,
			...notice.header === void 0 ? {} : { header: notice.header }
		} }
	};
}
/** Decode one private Host message. @param value - Native child IPC data. */
function parseSkillSafetyInvocation(value) {
	return decode(invocation, value);
}
/** Decode a scope-bound cancellation context. @param value - Native child IPC data. */
function parseSkillSafetyContext(value) {
	return decode(context, value);
}
/** Decode actual effects without unknown extra fields. @param value - Main result. */
function parseSkillSafetyResult(value) {
	return decode(skillSafetyResultSchema, value);
}
//#endregion
export { parseSkillSafetyActor, parseSkillSafetyCommand, parseSkillSafetyContext, parseSkillSafetyInvocation, parseSkillSafetyPrepared, parseSkillSafetyResult, skillSafetyResultSchema };
