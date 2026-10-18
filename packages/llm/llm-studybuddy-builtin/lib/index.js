import { createHash, randomUUID } from "node:crypto";
import { LlmAdapter, LlmError, isAgentLoopRequest } from "@deepseek-ai/dsh-llm";
import { canonicalNativeBuiltinCatalogPayloadV1, parseNativeBuiltinCatalogApplyV1, parseNativeBuiltinFrozenRequestV1, parseNativeBuiltinHostContextV1, parseNativeBuiltinReadinessV1, parseNativeBuiltinValidationRequestV1, parseNativeBuiltinValidationResultV1, parseNativeToolAuthorityV2, parseNativeToolCatalogV2, parseNativeToolMaterialV2 } from "@studybuddy/contracts";
import { deepEqualJson, deepFreeze } from "@deepseek-ai/dsh-util-values";
import { PiAiAdapter, resolveProfiles } from "@deepseek-ai/dsh-llm-pi-ai";
//#region lib/types/studybuddy-builtin-terminal.js
/** Project provider-terminal aggregate counts; absent raw fields never become SDK zero defaults.
* @param facts - Raw response observation from this exact private request.
* @returns Disjoint known cache/input fields and the authoritative full-call total, or undefined. */
function projectBuiltinTerminalUsage(facts) {
	const usage = facts.usage;
	if (usage === null || ![
		"completed",
		"incomplete",
		"refused"
	].includes(facts.outcome) || usage.inputTotalTokens === null) return;
	const inputTotal = usage.inputTotalTokens, outputTokens = usage.outputTokens, read = usage.cacheReadTokens, write = usage.cacheWriteTokens, reasoning = usage.reasoningTokens;
	if (![
		inputTotal,
		outputTokens,
		...read === null ? [] : [read],
		...write === null ? [] : [write],
		...reasoning === null ? [] : [reasoning]
	].every((value) => Number.isSafeInteger(value) && value >= 0)) return;
	const inputTokens = inputTotal - (read ?? 0) - (write ?? 0), totalTokens = inputTotal + outputTokens;
	if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(totalTokens) || reasoning !== null && reasoning > outputTokens) return;
	return {
		inputTokens,
		outputTokens,
		totalTokens,
		...read === null ? {} : { cacheReadTokens: read },
		...write === null ? {} : { cacheWriteTokens: write },
		...reasoning === null ? {} : { reasoningTokens: reasoning }
	};
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const text$1 = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) ? value : null;
function usage(protocol, value) {
	const row = object(value);
	if (row === void 0) return null;
	const chat = protocol === "openai_chat_completions";
	const inputTokens = count(chat ? row.prompt_tokens : row.input_tokens);
	const outputTokens = count(chat ? row.completion_tokens : row.output_tokens);
	if (inputTokens === null || outputTokens === null) return null;
	const inputDetails = object(chat ? row.prompt_tokens_details : row.input_tokens_details);
	const outputDetails = object(chat ? row.completion_tokens_details : row.output_tokens_details);
	const reads = (protocol === "anthropic_messages" ? [row.cache_read_input_tokens] : chat ? [
		inputDetails?.cached_tokens,
		row.prompt_cache_hit_tokens,
		row.cached_tokens
	] : [inputDetails?.cached_tokens]).filter((value) => value !== void 0);
	if (reads.some((value) => count(value) === null) || new Set(reads).size > 1) return null;
	const cacheReadTokens = count(protocol === "anthropic_messages" ? row.cache_read_input_tokens : inputDetails?.cached_tokens ?? row.prompt_cache_hit_tokens ?? (chat ? row.cached_tokens : void 0));
	const write = protocol === "anthropic_messages" ? row.cache_creation_input_tokens : inputDetails?.cache_write_tokens;
	if (write !== void 0 && count(write) === null) return null;
	const cacheWriteTokens = count(write);
	const cacheCreation = object(row.cache_creation);
	const inputTotalTokens = protocol === "anthropic_messages" ? cacheReadTokens !== null && cacheWriteTokens !== null ? inputTokens + cacheReadTokens + cacheWriteTokens : null : inputTokens;
	if (inputTotalTokens !== null && (!Number.isSafeInteger(inputTotalTokens + outputTokens) || (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) > inputTotalTokens)) return null;
	if (Object.hasOwn(row, "total_tokens") && (count(row.total_tokens) === null || inputTotalTokens === null || row.total_tokens !== inputTotalTokens + outputTokens)) return null;
	return {
		inputTokens,
		outputTokens,
		inputTotalTokens,
		cacheReadTokens,
		cacheWriteTokens,
		reasoningTokens: count(outputDetails?.reasoning_tokens),
		cacheWrite5mTokens: count(cacheCreation?.ephemeral_5m_input_tokens),
		cacheWrite1hTokens: count(cacheCreation?.ephemeral_1h_input_tokens)
	};
}
/** Wrap the provider fetch while leaving its exact response bytes available to the shipped SDK.
* @param transport - The process-owned HTTP implementation.
* @param protocol - Native-issued exact protocol.
* @param facts - One request's private observation, never shared across requests.
* @returns A no-redirect transport with a bounded incremental SSE observer. */
function observeBuiltinTerminal(transport, protocol, facts) {
	return async (input, init) => {
		const result = await transport(input, {
			...init,
			redirect: "error"
		});
		if (!result.ok || result.body === null || !result.headers.get("content-type")?.includes("text/event-stream")) return result;
		let buffer = "", data = [], invalid = false, ended = false;
		let pendingUsage = null;
		let invalidUsage = false;
		let anthropicUsage = {};
		let terminal = "unknown";
		const decoder = new TextDecoder();
		const identity = (row) => {
			const id = text$1(row.id), model = text$1(row.model);
			if (id !== null) {
				if (facts.providerResponseId !== null && facts.providerResponseId !== id) invalid = true;
				facts.providerResponseId = id;
			}
			if (model !== null) {
				if (facts.returnedModel !== null && facts.returnedModel !== model) invalid = true;
				facts.returnedModel = model;
			}
		};
		const end = () => {
			ended = true;
			facts.outcome = invalid ? "contract_invalid" : terminal;
			facts.usage = invalid || invalidUsage || terminal === "unknown" || terminal === "failed" ? null : pendingUsage;
		};
		const rejectUsage = () => {
			invalidUsage = true;
			pendingUsage = null;
			facts.usage = null;
		};
		const recordUsage = (value) => {
			if (value === void 0 || value === null || invalidUsage) return;
			const candidate = usage(protocol, value);
			if (candidate === null) {
				rejectUsage();
				return;
			}
			const combined = { ...candidate };
			if (pendingUsage !== null) for (const key of Object.keys(candidate)) {
				const previous = pendingUsage[key], current = candidate[key];
				if (previous !== null && current !== null && previous !== current) {
					rejectUsage();
					return;
				}
				if (previous !== null && current === null) combined[key] = previous;
			}
			if (combined.inputTotalTokens !== null && (combined.cacheReadTokens ?? 0) + (combined.cacheWriteTokens ?? 0) > combined.inputTotalTokens) {
				rejectUsage();
				return;
			}
			pendingUsage = combined;
		};
		const event = () => {
			const payload = data.join("\n");
			data = [];
			if (payload === "") return;
			if (payload === "[DONE]") {
				if (protocol === "openai_chat_completions") end();
				return;
			}
			let parsed;
			try {
				parsed = JSON.parse(payload);
			} catch {
				invalid = true;
				return;
			}
			const row = object(parsed);
			if (row === void 0) {
				invalid = true;
				return;
			}
			if (protocol === "openai_chat_completions") {
				identity(row);
				recordUsage(row.usage);
				if (Array.isArray(row.choices)) recordUsage(object(row.choices[0])?.usage);
				if (Array.isArray(row.choices)) for (const choice of row.choices) {
					const reason = object(choice)?.finish_reason;
					if (reason === "stop" || reason === "tool_calls") terminal = "completed";
					else if (reason === "length") terminal = "incomplete";
					else if (reason === "content_filter") terminal = "refused";
				}
			} else if (protocol === "openai_responses") {
				const response = object(row.response);
				if (response !== void 0) identity(response);
				if (row.type === "response.completed" || row.type === "response.incomplete" || row.type === "response.failed") {
					terminal = row.type === "response.completed" ? "completed" : row.type === "response.incomplete" ? "incomplete" : "failed";
					recordUsage(response?.usage);
					end();
				}
			} else {
				const message = object(row.message);
				if (row.type === "message_start" && message !== void 0) {
					identity(message);
					anthropicUsage = { ...object(message.usage) };
				}
				if (row.type === "message_delta") {
					anthropicUsage = {
						...anthropicUsage,
						...object(row.usage)
					};
					const reason = object(row.delta)?.stop_reason;
					if (reason === "end_turn" || reason === "tool_use" || reason === "stop_sequence") terminal = "completed";
					else if (reason === "max_tokens") terminal = "incomplete";
					else if (reason === "refusal") terminal = "refused";
				}
				if (row.type === "message_stop") {
					pendingUsage = usage(protocol, anthropicUsage);
					end();
				}
			}
		};
		const feed = (part) => {
			buffer += part;
			if (buffer.length > 256 * 1024) {
				invalid = true;
				buffer = "";
				data = [];
				return;
			}
			let index;
			while ((index = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, index).replace(/\r$/, "");
				buffer = buffer.slice(index + 1);
				if (line === "") event();
				else if (line.startsWith("data:")) {
					data.push(line.slice(5).replace(/^ /, ""));
					if (data.reduce((sum, item) => sum + item.length, 0) > 256 * 1024) {
						invalid = true;
						data = [];
					}
				}
			}
		};
		const body = result.body.pipeThrough(new TransformStream({
			transform(chunk, controller) {
				feed(decoder.decode(chunk, { stream: true }));
				controller.enqueue(chunk);
			},
			flush() {
				feed(decoder.decode());
				if (!ended || invalid) {
					facts.outcome = invalid ? "contract_invalid" : "unknown";
					facts.usage = null;
				}
			}
		}));
		return new Response(body, {
			status: result.status,
			statusText: result.statusText,
			headers: result.headers
		});
	};
}
//#endregion
//#region lib/types/studybuddy-builtin-models.js
/** Private, account-fenced model directory installed by the Desktop Main process. */
const sameScope = (a, b) => a.accountId === b.accountId && a.generation === b.generation;
const scopeKey = (scope) => JSON.stringify([scope.accountId, scope.generation]);
/** Detached exact source reference used by acknowledgements and request freezes.
* @param route - Native-issued private route.
* @param authority - Exact member of that route's grant.
* @returns The complete source, connection, funding, and model identity. */
function builtinSelectionRef(route, authority) {
	if (route.mode === "gateway") {
		const grant = route.binding.grant;
		return {
			routeId: route.routeId,
			sourceId: grant.scope.sourceId,
			localRef: grant.scope.localRef,
			providerId: authority.providerId,
			exactModelId: authority.exactModelId,
			protocol: authority.protocol,
			connectionId: route.binding.connectionId,
			credentialRevision: grant.scope.credentialRevision,
			grantRevision: grant.grantRevision,
			fundingSource: grant.scope.fundingSource
		};
	}
	return {
		routeId: route.routeId,
		sourceId: route.grant.sourceId,
		localRef: route.grant.localRef,
		providerId: authority.providerId,
		exactModelId: authority.exactModelId,
		protocol: authority.protocol,
		connectionId: route.grant.connectionId,
		credentialRevision: route.grant.credentialRevision,
		grantRevision: route.grant.grantRevision,
		fundingSource: "user_api"
	};
}
function fail$2(code) {
	throw new LlmError("The built-in model request is unavailable", code);
}
function grant(route) {
	return route.mode === "gateway" ? route.binding.grant : route.grant;
}
function modelInfo(route, model) {
	return {
		provider: route.routeId,
		id: model.exactModelId,
		name: model.displayName,
		inputModalities: model.capabilityFlags.includes("image_in") ? ["text", "image"] : ["text"],
		context: { contextWindow: model.contextWindow },
		...model.maxOutputTokens === null ? {} : { defaultMaxTokens: model.maxOutputTokens }
	};
}
/** Exact model routing and private Main acknowledgement owner. */
var BuiltinModelDirectory = class extends LlmAdapter {
	ctx;
	options;
	routes = /* @__PURE__ */ new Map();
	installed = /* @__PURE__ */ new Map();
	published = /* @__PURE__ */ new Map();
	knownRoutes = /* @__PURE__ */ new Map();
	latestOperationId;
	registration;
	owner;
	epoch = 0;
	revoked = /* @__PURE__ */ new Set();
	sourceEpochs = /* @__PURE__ */ new Map();
	versions = /* @__PURE__ */ new Map();
	constructor(ctx, options) {
		super();
		this.ctx = ctx;
		this.options = options;
		ctx.effect(() => () => {
			if (this.owner !== void 0) this.revoke(this.owner);
		});
	}
	/** Install one complete private catalog atomically; failed candidates retain the prior catalog.
	* @param input - Native-issued material bound to the current Host and account.
	* @returns Readback of the exact installed source/model references. */
	async apply(input) {
		let snapshot;
		try {
			snapshot = deepFreeze(parseNativeBuiltinCatalogApplyV1(input));
		} catch {
			return fail$2("BUILTIN_CATALOG_INVALID");
		}
		if (snapshot.hostGeneration !== this.options.hostGeneration) fail$2("BUILTIN_HOST_GENERATION_MISMATCH");
		if (this.revoked.has(scopeKey(snapshot.scope))) fail$2("BUILTIN_SCOPE_REVOKED");
		if (this.owner !== void 0 && !sameScope(this.owner, snapshot.scope)) fail$2("BUILTIN_SCOPE_MISMATCH");
		const priorDigest = this.versions.get(snapshot.catalogVersion);
		if (priorDigest !== void 0 && priorDigest !== snapshot.catalogDigest) fail$2("BUILTIN_CATALOG_CONFLICT");
		if (createHash("sha256").update(canonicalNativeBuiltinCatalogPayloadV1(snapshot), "utf8").digest("hex") !== snapshot.catalogDigest) fail$2("BUILTIN_CATALOG_DIGEST_MISMATCH");
		const localRefs = new Set(snapshot.routes.map((route) => this.localRef(route)));
		if (localRefs.size !== 1) fail$2("BUILTIN_SOURCE_CATALOG_INVALID");
		const localRef = localRefs.values().next().value;
		if (localRef === void 0) fail$2("BUILTIN_SOURCE_CATALOG_INVALID");
		const current = this.installed.get(localRef);
		if (current?.snapshot.catalogVersion === snapshot.catalogVersion) return structuredClone(current.receipt);
		const candidate = new Map([...this.routes].filter(([, entry]) => this.localRef(entry.route) !== localRef));
		const published = new Map([...this.published].filter(([route]) => {
			const entry = this.routes.get(route);
			if (entry === void 0) fail$2("BUILTIN_CATALOG_INVALID");
			return this.localRef(entry.route) !== localRef;
		}));
		const occupied = new Set(this.ctx.llm.listProviders().filter((provider) => !this.published.has(provider.id)).map((provider) => provider.id));
		for (const route of snapshot.routes) {
			if (occupied.has(route.routeId) || candidate.has(route.routeId)) fail$2("BUILTIN_ROUTE_COLLISION");
			const models = new Map(grant(route).allowedModels.map((model) => [model.exactModelId, model]));
			this.options.createAdapter(route, {});
			candidate.set(route.routeId, {
				route,
				models,
				snapshot
			});
		}
		const previous = this.routes, previousKnown = this.knownRoutes;
		this.routes = candidate;
		this.knownRoutes = new Map([...this.knownRoutes, ...snapshot.routes.map((route) => [route.routeId, route.displayName])]);
		try {
			this.replacePublished(published);
		} catch (error) {
			this.routes = previous;
			this.knownRoutes = previousKnown;
			throw error;
		}
		this.owner = snapshot.scope;
		this.versions.set(snapshot.catalogVersion, snapshot.catalogDigest);
		const receipt = deepFreeze({
			schemaVersion: 1,
			operationId: snapshot.operationId,
			scope: snapshot.scope,
			hostGeneration: snapshot.hostGeneration,
			catalogVersion: snapshot.catalogVersion,
			catalogDigest: snapshot.catalogDigest,
			applied: snapshot.routes.flatMap((route) => grant(route).allowedModels.map((model) => builtinSelectionRef(route, model)))
		});
		this.installed.set(localRef, {
			snapshot,
			receipt
		});
		this.latestOperationId = snapshot.operationId;
		return this.readback(snapshot.scope, snapshot.operationId);
	}
	/** Read the installed catalog for the current account without private material.
	* @param scope - Main-owned account generation.
	* @param operationId - Original saved-source operation; omission addresses the latest installed source.
	* @returns The current Host acknowledgement, detached from owned state. */
	async readback(scope, operationId = this.latestOperationId) {
		this.assertScope(scope);
		const installed = [...this.installed.values()].find((entry) => entry.snapshot.operationId === operationId);
		if (installed === void 0) fail$2("BUILTIN_HOST_NOT_APPLIED");
		return structuredClone(installed.receipt);
	}
	/** Publish only the exact models whose current private snapshot native has confirmed ready.
	* @param input - Native-confirmed secret-free readiness, bound to this source acknowledgement. */
	publishReady(input) {
		const readiness = parseNativeBuiltinReadinessV1(input);
		const installed = this.installed.get(readiness.localRef);
		if (readiness.state !== "ready" || installed === void 0 || readiness.hostApplied === null || !deepEqualJson(readiness.hostApplied, installed.receipt)) fail$2("BUILTIN_READINESS_STALE");
		this.assertScope(installed.snapshot.scope);
		const next = new Map(this.published);
		for (const ref of readiness.appliedModels) {
			const entry = this.routes.get(ref.routeId);
			const authority = entry?.models.get(ref.exactModelId);
			if (entry === void 0 || authority === void 0 || entry.snapshot !== installed.snapshot || !deepEqualJson(builtinSelectionRef(entry.route, authority), ref)) fail$2("BUILTIN_READINESS_STALE");
			next.set(ref.routeId, new Set([...next.get(ref.routeId) ?? [], ref.exactModelId]));
		}
		this.replacePublished(next);
	}
	replacePublished(next) {
		const previous = this.published;
		this.published = next;
		try {
			if (this.registration === void 0 && this.knownRoutes.size > 0) this.registration = this.ctx.llm.registerAdapter([...this.knownRoutes.keys()], this);
			else this.registration?.replace([...this.knownRoutes.keys()]);
		} catch (error) {
			this.published = previous;
			throw error;
		}
	}
	localRef(route) {
		return route.mode === "gateway" ? route.binding.grant.scope.localRef : route.grant.localRef;
	}
	/** Close future admission for one account, including already prepared calls.
	* @param scope - Main-owned account generation to revoke. */
	revoke(scope) {
		this.revoked.add(scopeKey(scope));
		if (this.owner === void 0 || !sameScope(this.owner, scope)) return;
		this.epoch++;
		this.routes = /* @__PURE__ */ new Map();
		this.replacePublished(/* @__PURE__ */ new Map());
		this.installed.clear();
		this.latestOperationId = void 0;
		this.owner = void 0;
	}
	/** Remove one source while retaining other independent catalogs.
	* @param scope - Current Main-owned account generation.
	* @param localRef - Native source row being rotated or revoked. */
	revokeSource(scope, localRef) {
		this.assertScope(scope);
		this.sourceEpochs.set(localRef, (this.sourceEpochs.get(localRef) ?? 0) + 1);
		const routeIds = new Set([...this.routes].filter(([, entry]) => this.localRef(entry.route) === localRef).map(([route]) => route));
		this.routes = new Map([...this.routes].filter(([route]) => !routeIds.has(route)));
		this.replacePublished(new Map([...this.published].filter(([route]) => !routeIds.has(route))));
		this.installed.delete(localRef);
	}
	assertScope(scope) {
		if (this.revoked.has(scopeKey(scope))) fail$2("BUILTIN_SCOPE_REVOKED");
		if (this.owner === void 0 || !sameScope(this.owner, scope)) fail$2("BUILTIN_SCOPE_MISMATCH");
	}
	exact(provider, model, requirePublished = true) {
		const entry = this.routes.get(provider);
		if (entry === void 0) fail$2("BUILTIN_SOURCE_UNAVAILABLE");
		const authority = entry.models.get(model);
		if (authority === void 0) fail$2("BUILTIN_MODEL_NOT_ALLOWED");
		this.assertScope(entry.snapshot.scope);
		if (requirePublished && !this.published.get(provider)?.has(model)) fail$2("BUILTIN_SOURCE_NOT_READY");
		return {
			entry,
			authority,
			snapshot: entry.snapshot,
			epoch: this.epoch,
			sourceEpoch: this.sourceEpochs.get(this.localRef(entry.route)) ?? 0
		};
	}
	catalogVisible(provider) {
		const route = this.routes.get(provider);
		return this.published.has(provider) && route !== void 0;
	}
	/** Current exact owned admission used by explicit Session/default selectors.
	* @param provider - Native-owned route identity.
	* @param model - Exact manually admitted model id.
	* @returns Whether the source is published, unexpired and available for that model. */
	selectionAllowed(provider, model) {
		try {
			this.exact(provider, model);
			return true;
		} catch {
			return false;
		}
	}
	/** Secret-free tool choices from the current published native catalog.
	* Each provider remains its exact source/funding route; stale or revoked
	* grants and models without canonical image input never become helpers. */
	imageToolModels() {
		return [...this.published].flatMap(([provider, models]) => [...models].flatMap((model) => {
			try {
				return this.exact(provider, model).authority.capabilityFlags.includes("image_in") ? [{
					provider,
					model
				}] : [];
			} catch {
				return [];
			}
		}));
	}
	providerInfo(provider) {
		const name = this.knownRoutes.get(provider);
		if (name === void 0) fail$2("BUILTIN_SOURCE_UNAVAILABLE");
		return {
			id: provider,
			name
		};
	}
	async listModels(provider) {
		const entry = this.routes.get(provider);
		if (entry === void 0) fail$2("BUILTIN_SOURCE_UNAVAILABLE");
		return [...entry.models.values()].filter((model) => this.published.get(provider)?.has(model.exactModelId)).map((model) => modelInfo(entry.route, model));
	}
	async resolveModel(provider, model) {
		const capture = this.exact(provider, model);
		return modelInfo(capture.entry.route, capture.authority);
	}
	async prepareCall(provider, model) {
		const capture = this.exact(provider, model);
		return {
			model: modelInfo(capture.entry.route, capture.authority),
			stream: (options) => this.dispatch(options, capture)
		};
	}
	stream(options) {
		return this.dispatch(options, this.exact(options.provider, options.model));
	}
	/** Execute a Main-only user-authorized validation against an installed exact source.
	* @param input - Closed private command; renderer call options never enter this boundary.
	* @returns Actual provider identity, terminal facts, and measured visible-text timing. */
	async validate(input) {
		const request = parseNativeBuiltinValidationRequestV1(input);
		const capture = this.exact(request.selection.routeId, request.selection.exactModelId, false);
		if (capture.snapshot.operationId !== request.operationId || !deepEqualJson(request.selection, builtinSelectionRef(capture.entry.route, capture.authority))) fail$2("BUILTIN_REQUEST_IDENTITY_MISMATCH");
		const freeze = deepFreeze({
			schemaVersion: 1,
			scope: capture.snapshot.scope,
			hostGeneration: capture.snapshot.hostGeneration,
			catalogVersion: capture.snapshot.catalogVersion,
			catalogDigest: capture.snapshot.catalogDigest,
			selection: request.selection,
			authority: capture.authority,
			clientRequestId: request.clientRequestId,
			sessionId: null,
			purpose: request.purpose
		});
		const headers = await this.admit(capture, freeze);
		const facts = {
			providerResponseId: null,
			returnedModel: null,
			usage: null,
			outcome: "unknown"
		};
		const adapter = this.options.createAdapter(capture.entry.route, headers, facts, request.purpose);
		const started = performance.now();
		let firstVisibleTextMs = null, dispatchToTerminalMs = null;
		let errorCode = null;
		try {
			for await (const chunk of adapter.stream({
				provider: capture.entry.route.routeId,
				model: capture.authority.exactModelId,
				messages: [{
					role: "user",
					content: [{
						type: "text",
						text: request.prompt
					}]
				}],
				maxTokens: Math.min(32, capture.authority.maxOutputTokens ?? 32)
			})) {
				if (chunk.type === "text-delta" && chunk.text.length > 0 && firstVisibleTextMs === null) firstVisibleTextMs = Math.round(performance.now() - started);
				if (chunk.type === "finish") {
					dispatchToTerminalMs = Math.round(performance.now() - started);
					if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted") errorCode = "BUILTIN_VALIDATION_FAILED";
				}
			}
		} catch {
			errorCode = "BUILTIN_VALIDATION_FAILED";
		}
		this.assertCapture(capture);
		if (facts.returnedModel !== null && facts.returnedModel !== request.selection.exactModelId) {
			facts.outcome = "contract_invalid";
			facts.usage = null;
			errorCode = "BUILTIN_RETURNED_MODEL_MISMATCH";
		}
		if (errorCode !== null && facts.outcome !== "contract_invalid") {
			facts.outcome = "failed";
			facts.usage = null;
		}
		return parseNativeBuiltinValidationResultV1({
			schemaVersion: 1,
			operationId: request.operationId,
			clientRequestId: request.clientRequestId,
			selection: request.selection,
			purpose: request.purpose,
			providerResponseId: facts.providerResponseId,
			returnedModel: facts.returnedModel,
			outcome: facts.outcome,
			usageOrigin: facts.usage === null ? "unknown" : "provider_terminal",
			usage: facts.usage,
			firstVisibleTextMs,
			dispatchToTerminalMs,
			errorCode
		});
	}
	assertCapture(capture) {
		this.assertScope(capture.snapshot.scope);
		if (capture.epoch !== this.epoch) fail$2("BUILTIN_SCOPE_REVOKED");
		if (capture.sourceEpoch !== (this.sourceEpochs.get(this.localRef(capture.entry.route)) ?? 0)) fail$2("BUILTIN_SOURCE_REVOKED");
	}
	async admit(capture, freeze) {
		this.assertCapture(capture);
		let frozen;
		try {
			frozen = parseNativeBuiltinFrozenRequestV1(await this.options.admit(freeze));
		} catch (error) {
			if (error instanceof LlmError && /^BUILTIN_[A-Z_]+$/.test(error.code ?? "")) throw error;
			fail$2("BUILTIN_REQUEST_NOT_ADMITTED");
		}
		if (frozen.clientRequestId !== freeze.clientRequestId || frozen.sessionId !== freeze.sessionId || frozen.purpose !== freeze.purpose || !deepEqualJson(frozen.selection, freeze.selection) || !deepEqualJson(frozen.authority, freeze.authority)) fail$2("BUILTIN_REQUEST_IDENTITY_MISMATCH");
		this.assertCapture(capture);
		if (frozen.requestReceipt !== null) fail$2("BUILTIN_REQUEST_NOT_ADMITTED");
		if (capture.entry.route.mode === "local_direct") return {};
		return {
			"X-Request-Id": frozen.clientRequestId,
			"X-StudyBuddy-Request-Purpose": frozen.purpose
		};
	}
	async *dispatch(options, capture) {
		this.assertScope(capture.snapshot.scope);
		if (capture.epoch !== this.epoch) fail$2("BUILTIN_SCOPE_REVOKED");
		if (capture.sourceEpoch !== (this.sourceEpochs.get(this.localRef(capture.entry.route)) ?? 0)) fail$2("BUILTIN_SOURCE_REVOKED");
		if (options.provider !== capture.entry.route.routeId || options.model !== capture.authority.exactModelId) fail$2("BUILTIN_MODEL_NOT_ALLOWED");
		if (!isAgentLoopRequest(options)) fail$2("BUILTIN_TRUST_REQUIRED");
		const conversation = this.options.trustedConversation(options);
		if (conversation === void 0 || options.sessionId === void 0 || conversation.sessionId !== String(options.sessionId)) fail$2("BUILTIN_TRUST_REQUIRED");
		if (options.reasoningEffort !== void 0 || options.temperature !== void 0) fail$2("BUILTIN_PARAMETER_NOT_ALLOWED");
		if ((options.tools?.length ?? 0) > 0 && !capture.authority.capabilityFlags.includes("tool_use")) fail$2("BUILTIN_CAPABILITY_NOT_ALLOWED");
		const freeze = deepFreeze({
			schemaVersion: 1,
			scope: capture.snapshot.scope,
			hostGeneration: capture.snapshot.hostGeneration,
			catalogVersion: capture.snapshot.catalogVersion,
			catalogDigest: capture.snapshot.catalogDigest,
			selection: builtinSelectionRef(capture.entry.route, capture.authority),
			authority: capture.authority,
			clientRequestId: randomUUID(),
			sessionId: conversation.sessionId,
			purpose: "chat"
		});
		const headers = await this.admit(capture, freeze);
		if (options.signal?.aborted) return;
		await conversation.appendAudit(freeze);
		this.assertCapture(capture);
		const facts = {
			providerResponseId: null,
			returnedModel: null,
			usage: null,
			outcome: "unknown"
		};
		const adapter = this.options.createAdapter(capture.entry.route, headers, facts);
		for await (const chunk of adapter.stream(options)) {
			if (chunk.type === "usage") continue;
			if (chunk.type === "finish" && (chunk.reason.kind === "stop" || chunk.reason.kind === "max-tokens" || chunk.reason.kind === "tool-calls") && facts.returnedModel === capture.authority.exactModelId) {
				const usage = projectBuiltinTerminalUsage(facts);
				if (usage !== void 0) yield {
					type: "usage",
					usage
				};
			}
			yield chunk;
		}
	}
};
//#endregion
//#region lib/types/studybuddy-builtin-wire.js
/** Exact native authority projected onto the existing pi-ai wire adapter. */
const protocols = {
	openai_chat_completions: "openai-completions",
	openai_responses: "openai-responses",
	anthropic_messages: "anthropic-messages"
};
/** Construct an adapter containing only one private exact route, without ambient auth or discovery.
* @param route - Private native material, retained only by the prepared request.
* @param headers - Protected per-request admission ticket headers.
* @param observation - Optional raw terminal observation and explicit transport or attachment resolvers.
* @returns The shipped pi-ai adapter with fully explicit model capabilities. */
function createBuiltinWireAdapter(route, headers, observation) {
	const grant = route.mode === "gateway" ? route.binding.grant : route.grant;
	const protocol = route.mode === "gateway" ? route.binding.grant.scope.protocol : route.grant.protocol;
	const baseURL = route.mode === "gateway" ? route.gatewayOrigin + (protocol === "anthropic_messages" ? "" : "/v1") : route.baseUrl;
	const models = grant.allowedModels.map((model) => {
		if (model.maxOutputTokens === null) throw new LlmError("The exact model output capability is unavailable", "BUILTIN_CAPABILITY_INCOMPLETE");
		const explicitChat = protocol === "openai_chat_completions" && (model.providerId === "deepseek" || model.providerId === "kimi");
		return {
			id: model.exactModelId,
			name: model.displayName,
			contextWindow: model.contextWindow,
			maxTokens: model.maxOutputTokens,
			input: model.capabilityFlags.includes("image_in") ? ["text", "image"] : ["text"],
			reasoningEfforts: false,
			...explicitChat ? { compat: {
				maxTokensField: model.providerId === "deepseek" ? "max_tokens" : "max_completion_tokens",
				supportsStore: false,
				supportsDeveloperRole: false,
				supportsReasoningEffort: false,
				requiresReasoningContentOnAssistantMessages: true
			} } : {}
		};
	});
	const profiles = resolveProfiles({ [route.routeId]: {
		displayName: route.displayName,
		api: protocols[protocol],
		baseURL,
		models,
		apiKeyEnv: "PRIVATE_BUILTIN_MATERIAL",
		headers: { ...headers }
	} });
	const transport = observation?.fetch ?? fetch;
	const privateFetch = (input, init) => {
		if (observation?.purpose === "validation" && protocol === "openai_chat_completions" && grant.allowedModels.some((model) => model.providerId === "deepseek")) {
			if (typeof init?.body !== "string") throw new LlmError("The validation request body is unavailable", "BUILTIN_VALIDATION_BODY_INVALID");
			const body = JSON.parse(init.body);
			if (!grant.allowedModels.some((model) => model.providerId === "deepseek" && model.exactModelId === body.model) || !Number.isSafeInteger(body.max_tokens) || Number(body.max_tokens) < 1 || Number(body.max_tokens) > 32) throw new LlmError("The exact validation model or output budget is invalid", "BUILTIN_VALIDATION_BODY_INVALID");
			return transport(input, {
				...init,
				body: JSON.stringify({
					...body,
					thinking: { type: "disabled" }
				}),
				redirect: "error"
			});
		}
		return transport(input, {
			...init,
			redirect: "error"
		});
	};
	return new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: async () => route.apiKey,
		providerFetch: observation?.facts === void 0 ? privateFetch : observeBuiltinTerminal(privateFetch, protocol, observation.facts),
		...observation?.resolveAttachments === void 0 ? {} : { resolveAttachments: observation.resolveAttachments },
		...observation?.resolveImageAccess === void 0 ? {} : { resolveImageAccess: observation.resolveImageAccess },
		auth: {
			credentials: {
				read: async () => void 0,
				list: async () => [],
				modify: async () => {
					throw new LlmError("Built-in credentials cannot be changed by the adapter", "BUILTIN_AUTH_DENIED");
				},
				delete: async () => {
					throw new LlmError("Built-in credentials cannot be changed by the adapter", "BUILTIN_AUTH_DENIED");
				}
			},
			authContext: {
				env: async () => void 0,
				fileExists: async () => false
			}
		}
	});
}
//#endregion
//#region lib/types/studybuddy-platform-contracts.js
/** Private desktop control plane for the existing native platform contract. */
const PLATFORM_PROVIDER = "studybuddy-platform";
function fail$1() {
	throw new Error("BUILTIN_PLATFORM_AUTHORITY_INVALID");
}
function record(value, keys) {
	if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) fail$1();
	const d = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(value);
	if (actual.length !== keys.length || actual.some((k) => typeof k !== "string" || !keys.includes(k) || d[k] === void 0 || !Object.hasOwn(d[k], "value"))) fail$1();
	return value;
}
function text(value) {
	if (typeof value !== "string" || !value || value.length > 128 || /\p{Cc}/u.test(value)) fail$1();
	return value;
}
function instant(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail$1();
	return value;
}
/** Validate the separately leased, manually reviewed platform authority. */
function parsePlatformSnapshot(value) {
	const r = record(value, [
		"scope",
		"hostGeneration",
		"catalog",
		"checkedAt",
		"expiresAt"
	]), context = parseNativeBuiltinHostContextV1({
		scope: r.scope,
		hostGeneration: r.hostGeneration
	});
	const checkedAt = instant(r.checkedAt), expiresAt = instant(r.expiresAt), catalog = parseNativeToolCatalogV2(r.catalog);
	if (Date.parse(expiresAt) <= Date.now() || Date.parse(checkedAt) > Date.now() || Date.parse(expiresAt) <= Date.parse(checkedAt) || !catalog.catalogRevision.startsWith("harness-platform-") || catalog.models.some((m) => m.toolId !== "dsh" || m.protocol !== "openai_chat_completions")) fail$1();
	return {
		...context,
		catalog,
		checkedAt,
		expiresAt
	};
}
/** Expose native Harness Chat memberships joined to exact current reviewed facts. */
function platformChoices(snapshot) {
	return snapshot.catalog.models.flatMap((member) => {
		if (member.toolId !== "dsh" || member.protocol !== "openai_chat_completions" || member.availability !== "available") return [];
		return member.maxOutputTokens === null ? [] : [{
			member,
			model: member
		}];
	});
}
/** Parse only the keyless private Host request, never a browser-authorized selection. */
function parsePlatformRequest(value) {
	const r = record(value, [
		"scope",
		"hostGeneration",
		"catalogRevision",
		"clientRequestId",
		"sessionId",
		"exactModelId"
	]);
	const context = parseNativeBuiltinHostContextV1({
		scope: r.scope,
		hostGeneration: r.hostGeneration
	});
	const clientRequestId = text(r.clientRequestId);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clientRequestId)) fail$1();
	return {
		...context,
		clientRequestId,
		catalogRevision: text(r.catalogRevision),
		sessionId: text(r.sessionId),
		exactModelId: text(r.exactModelId)
	};
}
/** Parse configured Key transport, or the legacy management disclosure receipt.
* A null authority uses bearer-Key admission at the gateway, without an account grant. */
function parsePlatformPrepared(value) {
	const r = record(value, [
		"request",
		"material",
		"authority"
	]), request = parsePlatformRequest(r.request), material = parseNativeToolMaterialV2(r.material), authority = r.authority === null ? null : parseNativeToolAuthorityV2(r.authority);
	if (authority === null) {
		if (material.fundingSource !== "platform" || material.userApi !== void 0 || material.selectedModelId !== request.exactModelId || material.protocol !== "openai_chat_completions" || !material.authorizedModelIds.includes(request.exactModelId)) fail$1();
		return {
			request,
			material,
			authority: null
		};
	}
	if (material.fundingSource !== "platform" || authority.fundingSource !== "platform" || material.toolId !== "dsh" || authority.toolId !== "dsh" || material.userApi !== void 0 || authority.userApi !== void 0 || material.gatewayOrigin !== "https://guijitongzhuo.com" || material.protocol !== "openai_chat_completions" || material.selectedModelId !== request.exactModelId || material.accountOwner !== request.scope.accountId || material.catalogRevision !== request.catalogRevision || authority.state !== "connected" || authority.permissionState !== "eligible" || authority.accountOwner !== material.accountOwner || authority.deviceId !== material.deviceId || authority.protocol !== material.protocol || authority.authorityHandle !== material.authorityHandle || authority.bindingRevision !== material.pendingBindingRevision || authority.credentialRevision !== material.credentialRevision || authority.receiptRevision !== material.receiptRevision || authority.catalogRevision !== material.catalogRevision || authority.policyRevision !== material.policyRevision || authority.membershipRevision !== material.membershipRevision || JSON.stringify(authority.authorizedModels) !== JSON.stringify(material.authorizedModels)) fail$1();
	return {
		request,
		material,
		authority
	};
}
//#endregion
//#region lib/types/studybuddy-platform-models.js
/** Platform adapter consumes existing native-tool authority, separately from personal sources. */
function fail(code) {
	throw new LlmError("平台模型暂时不可用，请重新选择。", code);
}
/** One platform directory mounted with the private Desktop Host lifetime. */
var PlatformModelDirectory = class extends LlmAdapter {
	ctx;
	options;
	snapshot;
	registration;
	epoch = 0;
	constructor(ctx, options) {
		super();
		this.ctx = ctx;
		this.options = options;
		ctx.effect(() => () => {
			this.snapshot = void 0;
			this.epoch++;
			this.registration?.();
			this.registration = void 0;
		});
	}
	/** Apply only Main-owned keyless authorities for this exact Host. */
	apply(input, hostGeneration) {
		const next = deepFreeze(parsePlatformSnapshot(input));
		if (next.hostGeneration !== hostGeneration) fail("BUILTIN_HOST_GENERATION_MISMATCH");
		if (this.snapshot?.scope.accountId !== next.scope.accountId || this.snapshot.scope.generation !== next.scope.generation || this.snapshot.hostGeneration !== next.hostGeneration) this.epoch++;
		this.snapshot = next;
		if (this.registration === void 0) this.registration = this.ctx.llm.registerAdapter([PLATFORM_PROVIDER], this);
		else this.registration.replace([PLATFORM_PROVIDER]);
	}
	/** Withdraw the exact old account before logout or account replacement. */
	revoke(scope) {
		if (this.snapshot?.scope.accountId !== scope.accountId || this.snapshot.scope.generation !== scope.generation) return;
		this.snapshot = void 0;
		this.epoch++;
		this.registration?.replace([]);
	}
	catalogVisible(provider) {
		return provider === "studybuddy-platform" && this.snapshot !== void 0 && platformChoices(this.snapshot).length > 0;
	}
	selectionAllowed(provider, model) {
		return this.catalogVisible(provider) && this.snapshot !== void 0 && platformChoices(this.snapshot).some((choice) => choice.model.exactModelId === model);
	}
	/** Expose current exact vision routes to image tools without returning credentials or granting dispatch.
	* @returns Available platform routes whose reviewed catalog declares native image input. */
	imageToolModels() {
		return this.snapshot === void 0 ? [] : platformChoices(this.snapshot).filter((choice) => choice.model.capabilityFlags.includes("image_in")).map((choice) => ({
			provider: PLATFORM_PROVIDER,
			model: choice.model.exactModelId
		}));
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: "StudyBuddy 平台模型"
		};
	}
	listModels(provider) {
		const models = !this.catalogVisible(provider) || this.snapshot === void 0 ? [] : platformChoices(this.snapshot).map((choice) => this.info(choice));
		return Promise.resolve(models);
	}
	info(choice) {
		return {
			provider: PLATFORM_PROVIDER,
			id: choice.model.exactModelId,
			name: choice.model.displayName,
			inputModalities: this.inputModalities(choice),
			context: { contextWindow: choice.model.contextWindow },
			...choice.model.maxOutputTokens === null ? {} : { defaultMaxTokens: choice.model.maxOutputTokens }
		};
	}
	inputModalities(choice) {
		return choice.model.capabilityFlags.includes("image_in") ? ["text", "image"] : ["text"];
	}
	resolveModel(provider, model) {
		return Promise.resolve().then(() => this.info(this.exact(provider, model).choice));
	}
	prepareCall(provider, model) {
		return Promise.resolve().then(() => {
			const captured = this.exact(provider, model);
			return {
				model: this.info(captured.choice),
				stream: (options) => this.dispatch(options, captured)
			};
		});
	}
	async *stream(options) {
		yield* this.dispatch(options, this.exact(options.provider, options.model));
	}
	exact(provider, model) {
		const snapshot = this.snapshot, choice = snapshot && platformChoices(snapshot).find((row) => row.model.exactModelId === model);
		if (provider !== "studybuddy-platform" || snapshot === void 0 || choice === void 0) fail("BUILTIN_PLATFORM_MODEL_NOT_ALLOWED");
		return {
			snapshot,
			choice,
			epoch: this.epoch
		};
	}
	current(capture, admitted = false) {
		if (this.epoch !== capture.epoch || this.snapshot === void 0 || !admitted && (this.snapshot !== capture.snapshot || !this.selectionAllowed("studybuddy-platform", capture.choice.model.exactModelId))) fail("BUILTIN_PLATFORM_SCOPE_REVOKED");
	}
	async *dispatch(options, capture) {
		this.current(capture);
		if (options.provider !== "studybuddy-platform" || options.model !== capture.choice.model.exactModelId) fail("BUILTIN_PLATFORM_MODEL_NOT_ALLOWED");
		const sessionId = this.options.trustedSession(options);
		if (!isAgentLoopRequest(options) || sessionId === void 0 || String(options.sessionId) !== sessionId) fail("BUILTIN_TRUST_REQUIRED");
		if (options.reasoningEffort !== void 0 || options.temperature !== void 0) fail("BUILTIN_PARAMETER_NOT_ALLOWED");
		const toolsSupported = capture.choice.model.capabilityFlags.includes("tool_use");
		const request = {
			scope: capture.snapshot.scope,
			hostGeneration: capture.snapshot.hostGeneration,
			catalogRevision: capture.snapshot.catalog.catalogRevision,
			clientRequestId: randomUUID(),
			sessionId,
			exactModelId: options.model
		};
		const prepared = parsePlatformPrepared(await this.options.admit(request));
		this.current(capture, true);
		if (!deepEqualJson(prepared.request, request) || prepared.material.selectedProviderId !== capture.choice.model.providerId || !prepared.material.authorizedModels.some((member) => prepared.authority === null ? member.toolId === capture.choice.member.toolId && member.providerId === capture.choice.member.providerId && member.exactModelId === capture.choice.member.exactModelId && member.protocol === capture.choice.member.protocol : deepEqualJson(member, capture.choice.member))) fail("BUILTIN_PLATFORM_AUTHORITY_INVALID");
		if (options.signal?.aborted) return;
		const model = capture.choice.model;
		if (model.maxOutputTokens === null) fail("BUILTIN_CAPABILITY_INCOMPLETE");
		const facts = {
			providerResponseId: null,
			returnedModel: null,
			usage: null,
			outcome: "unknown"
		};
		const guardedFetch = async (input, init) => {
			this.current(capture, true);
			const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
			if (url.origin !== prepared.material.gatewayOrigin || url.pathname !== "/v1/chat/completions" || typeof init?.body !== "string") fail("BUILTIN_PLATFORM_ROUTE_INVALID");
			const body = JSON.parse(init.body);
			if (body === null || typeof body !== "object" || !("model" in body) || body.model !== options.model) fail("BUILTIN_PLATFORM_ROUTE_INVALID");
			const headers = new Headers(init.headers);
			headers.set("X-Request-Id", request.clientRequestId);
			return (this.options.fetch ?? fetch)(input, {
				...init,
				headers,
				redirect: "error"
			});
		};
		const profiles = resolveProfiles({ [PLATFORM_PROVIDER]: {
			displayName: "StudyBuddy 平台模型",
			api: "openai-completions",
			baseURL: prepared.material.gatewayOrigin + "/v1",
			apiKeyEnv: "PRIVATE_PLATFORM_MATERIAL",
			models: [{
				id: model.exactModelId,
				name: model.displayName,
				contextWindow: model.contextWindow,
				maxTokens: model.maxOutputTokens,
				input: this.inputModalities(capture.choice),
				reasoningEfforts: false,
				compat: {
					maxTokensField: [
						"deepseek",
						"zhipu",
						"hunyuan"
					].includes(model.providerId) ? "max_tokens" : "max_completion_tokens",
					supportsStore: false,
					supportsDeveloperRole: false,
					supportsReasoningEffort: false,
					requiresReasoningContentOnAssistantMessages: model.providerId !== "minimax"
				}
			}]
		} });
		const adapter = new PiAiAdapter({
			profiles: () => profiles,
			resolveApiKey: () => Promise.resolve(prepared.material.apiKey),
			providerFetch: observeBuiltinTerminal(guardedFetch, "openai_chat_completions", facts),
			...this.options.resolveAttachments === void 0 ? {} : { resolveAttachments: this.options.resolveAttachments },
			...this.options.resolveImageAccess === void 0 ? {} : { resolveImageAccess: this.options.resolveImageAccess },
			auth: {
				credentials: {
					read: () => Promise.resolve(void 0),
					list: () => Promise.resolve([]),
					modify: () => Promise.reject(new LlmError("平台模型暂时不可用，请重新选择。", "BUILTIN_AUTH_DENIED")),
					delete: () => Promise.reject(new LlmError("平台模型暂时不可用，请重新选择。", "BUILTIN_AUTH_DENIED"))
				},
				authContext: {
					env: () => Promise.resolve(void 0),
					fileExists: () => Promise.resolve(false)
				}
			}
		});
		const wireOptions = toolsSupported ? options : {
			...options,
			tools: []
		};
		for await (const chunk of adapter.stream(wireOptions)) {
			this.current(capture, true);
			if (!toolsSupported && chunk.type === "tool-call-delta") fail("BUILTIN_CAPABILITY_NOT_ALLOWED");
			if (facts.returnedModel !== null && facts.returnedModel !== model.exactModelId || facts.outcome === "contract_invalid") fail("BUILTIN_RETURNED_MODEL_MISMATCH");
			if (chunk.type === "usage") continue;
			if (chunk.type === "finish" && (chunk.reason.kind === "stop" || chunk.reason.kind === "max-tokens" || chunk.reason.kind === "tool-calls")) {
				const usage = projectBuiltinTerminalUsage(facts);
				if (usage !== void 0) yield {
					type: "usage",
					usage
				};
			}
			yield chunk;
			if (chunk.type === "finish" && (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")) return;
		}
		if (facts.returnedModel !== model.exactModelId) fail("BUILTIN_RETURNED_MODEL_MISMATCH");
	}
};
//#endregion
export { BuiltinModelDirectory, PLATFORM_PROVIDER, PlatformModelDirectory, builtinSelectionRef, createBuiltinWireAdapter, parsePlatformPrepared, parsePlatformRequest, parsePlatformSnapshot, platformChoices };
