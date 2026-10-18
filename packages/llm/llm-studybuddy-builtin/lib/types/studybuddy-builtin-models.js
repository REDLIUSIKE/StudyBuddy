/** Private, account-fenced model directory installed by the Desktop Main process. */
import { createHash, randomUUID } from 'node:crypto';
import { isAgentLoopRequest, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm';
import { canonicalNativeBuiltinCatalogPayloadV1, parseNativeBuiltinCatalogApplyV1, parseNativeBuiltinFrozenRequestV1, parseNativeBuiltinReadinessV1, parseNativeBuiltinValidationRequestV1, parseNativeBuiltinValidationResultV1, } from '@studybuddy/contracts';
import { deepEqualJson, deepFreeze } from '@deepseek-ai/dsh-util-values';
import { projectBuiltinTerminalUsage } from "./studybuddy-builtin-terminal.js";
const sameScope = (a, b) => a.accountId === b.accountId && a.generation === b.generation;
const scopeKey = (scope) => JSON.stringify([scope.accountId, scope.generation]);
/** Detached exact source reference used by acknowledgements and request freezes.
 * @param route - Native-issued private route.
 * @param authority - Exact member of that route's grant.
 * @returns The complete source, connection, funding, and model identity. */
export function builtinSelectionRef(route, authority) {
    if (route.mode === 'gateway') {
        const grant = route.binding.grant;
        return {
            routeId: route.routeId, sourceId: grant.scope.sourceId, localRef: grant.scope.localRef, providerId: authority.providerId,
            exactModelId: authority.exactModelId, protocol: authority.protocol, connectionId: route.binding.connectionId,
            credentialRevision: grant.scope.credentialRevision, grantRevision: grant.grantRevision, fundingSource: grant.scope.fundingSource,
        };
    }
    return {
        routeId: route.routeId, sourceId: route.grant.sourceId, localRef: route.grant.localRef, providerId: authority.providerId,
        exactModelId: authority.exactModelId, protocol: authority.protocol, connectionId: route.grant.connectionId,
        credentialRevision: route.grant.credentialRevision, grantRevision: route.grant.grantRevision, fundingSource: 'user_api',
    };
}
function fail(code) { throw new LlmError('The built-in model request is unavailable', code); }
function grant(route) { return route.mode === 'gateway' ? route.binding.grant : route.grant; }
function modelInfo(route, model) {
    return {
        provider: route.routeId, id: model.exactModelId, name: model.displayName,
        inputModalities: model.capabilityFlags.includes('image_in') ? ['text', 'image'] : ['text'],
        context: { contextWindow: model.contextWindow },
        ...model.maxOutputTokens === null ? {} : { defaultMaxTokens: model.maxOutputTokens },
    };
}
/** Exact model routing and private Main acknowledgement owner. */
export class BuiltinModelDirectory extends LlmAdapter {
    ctx;
    options;
    routes = new Map();
    installed = new Map();
    published = new Map();
    knownRoutes = new Map();
    latestOperationId;
    registration;
    owner;
    epoch = 0;
    revoked = new Set();
    sourceEpochs = new Map();
    versions = new Map();
    constructor(ctx, options) {
        super();
        this.ctx = ctx;
        this.options = options;
        ctx.effect(() => () => { if (this.owner !== undefined)
            this.revoke(this.owner); });
    }
    /** Install one complete private catalog atomically; failed candidates retain the prior catalog.
     * @param input - Native-issued material bound to the current Host and account.
     * @returns Readback of the exact installed source/model references. */
    async apply(input) {
        let snapshot;
        try {
            snapshot = deepFreeze(parseNativeBuiltinCatalogApplyV1(input));
        }
        catch {
            return fail('BUILTIN_CATALOG_INVALID');
        }
        if (snapshot.hostGeneration !== this.options.hostGeneration)
            fail('BUILTIN_HOST_GENERATION_MISMATCH');
        if (this.revoked.has(scopeKey(snapshot.scope)))
            fail('BUILTIN_SCOPE_REVOKED');
        if (this.owner !== undefined && !sameScope(this.owner, snapshot.scope))
            fail('BUILTIN_SCOPE_MISMATCH');
        const priorDigest = this.versions.get(snapshot.catalogVersion);
        if (priorDigest !== undefined && priorDigest !== snapshot.catalogDigest)
            fail('BUILTIN_CATALOG_CONFLICT');
        const actualDigest = createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(snapshot), 'utf8').digest('hex');
        if (actualDigest !== snapshot.catalogDigest)
            fail('BUILTIN_CATALOG_DIGEST_MISMATCH');
        const localRefs = new Set(snapshot.routes.map(route => this.localRef(route)));
        if (localRefs.size !== 1)
            fail('BUILTIN_SOURCE_CATALOG_INVALID');
        const localRef = localRefs.values().next().value;
        if (localRef === undefined)
            fail('BUILTIN_SOURCE_CATALOG_INVALID');
        const current = this.installed.get(localRef);
        if (current?.snapshot.catalogVersion === snapshot.catalogVersion)
            return structuredClone(current.receipt);
        const candidate = new Map([...this.routes].filter(([, entry]) => this.localRef(entry.route) !== localRef));
        const published = new Map([...this.published].filter(([route]) => {
            const entry = this.routes.get(route);
            if (entry === undefined)
                fail('BUILTIN_CATALOG_INVALID');
            return this.localRef(entry.route) !== localRef;
        }));
        const occupied = new Set(this.ctx.llm.listProviders().filter(provider => !this.published.has(provider.id)).map(provider => provider.id));
        for (const route of snapshot.routes) {
            if (occupied.has(route.routeId) || candidate.has(route.routeId))
                fail('BUILTIN_ROUTE_COLLISION');
            const models = new Map(grant(route).allowedModels.map(model => [model.exactModelId, model]));
            this.options.createAdapter(route, {});
            candidate.set(route.routeId, { route, models, snapshot });
        }
        const previous = this.routes, previousKnown = this.knownRoutes;
        this.routes = candidate;
        this.knownRoutes = new Map([...this.knownRoutes, ...snapshot.routes.map(route => [route.routeId, route.displayName])]);
        try {
            this.replacePublished(published);
        }
        catch (error) {
            this.routes = previous;
            this.knownRoutes = previousKnown;
            throw error;
        }
        this.owner = snapshot.scope;
        this.versions.set(snapshot.catalogVersion, snapshot.catalogDigest);
        const receipt = deepFreeze({
            schemaVersion: 1, operationId: snapshot.operationId, scope: snapshot.scope,
            hostGeneration: snapshot.hostGeneration, catalogVersion: snapshot.catalogVersion, catalogDigest: snapshot.catalogDigest,
            applied: snapshot.routes.flatMap(route => grant(route).allowedModels.map(model => builtinSelectionRef(route, model))),
        });
        this.installed.set(localRef, { snapshot, receipt });
        this.latestOperationId = snapshot.operationId;
        return this.readback(snapshot.scope, snapshot.operationId);
    }
    /** Read the installed catalog for the current account without private material.
     * @param scope - Main-owned account generation.
     * @param operationId - Original saved-source operation; omission addresses the latest installed source.
     * @returns The current Host acknowledgement, detached from owned state. */
    async readback(scope, operationId = this.latestOperationId) {
        this.assertScope(scope);
        const installed = [...this.installed.values()].find(entry => entry.snapshot.operationId === operationId);
        if (installed === undefined)
            fail('BUILTIN_HOST_NOT_APPLIED');
        return structuredClone(installed.receipt);
    }
    /** Publish only the exact models whose current private snapshot native has confirmed ready.
     * @param input - Native-confirmed secret-free readiness, bound to this source acknowledgement. */
    publishReady(input) {
        const readiness = parseNativeBuiltinReadinessV1(input);
        const installed = this.installed.get(readiness.localRef);
        if (readiness.state !== 'ready' || installed === undefined || readiness.hostApplied === null
            || !deepEqualJson(readiness.hostApplied, installed.receipt))
            fail('BUILTIN_READINESS_STALE');
        this.assertScope(installed.snapshot.scope);
        const next = new Map(this.published);
        for (const ref of readiness.appliedModels) {
            const entry = this.routes.get(ref.routeId);
            const authority = entry?.models.get(ref.exactModelId);
            if (entry === undefined || authority === undefined || entry.snapshot !== installed.snapshot
                || !deepEqualJson(builtinSelectionRef(entry.route, authority), ref))
                fail('BUILTIN_READINESS_STALE');
            next.set(ref.routeId, new Set([...(next.get(ref.routeId) ?? []), ref.exactModelId]));
        }
        this.replacePublished(next);
    }
    replacePublished(next) {
        const previous = this.published;
        this.published = next;
        try {
            if (this.registration === undefined &&
                this.knownRoutes.size > 0)
                this.registration = this.ctx.llm.registerAdapter([...this.knownRoutes.keys()], this);
            else
                this.registration?.replace([...this.knownRoutes.keys()]);
        }
        catch (error) {
            this.published = previous;
            throw error;
        }
    }
    localRef(route) {
        return route.mode === 'gateway' ? route.binding.grant.scope.localRef : route.grant.localRef;
    }
    /** Close future admission for one account, including already prepared calls.
     * @param scope - Main-owned account generation to revoke. */
    revoke(scope) {
        this.revoked.add(scopeKey(scope));
        if (this.owner === undefined || !sameScope(this.owner, scope))
            return;
        this.epoch++;
        this.routes = new Map();
        this.replacePublished(new Map());
        this.installed.clear();
        this.latestOperationId = undefined;
        this.owner = undefined;
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
        if (this.revoked.has(scopeKey(scope)))
            fail('BUILTIN_SCOPE_REVOKED');
        if (this.owner === undefined || !sameScope(this.owner, scope))
            fail('BUILTIN_SCOPE_MISMATCH');
    }
    exact(provider, model, requirePublished = true) {
        const entry = this.routes.get(provider);
        if (entry === undefined)
            fail('BUILTIN_SOURCE_UNAVAILABLE');
        const authority = entry.models.get(model);
        if (authority === undefined)
            fail('BUILTIN_MODEL_NOT_ALLOWED');
        this.assertScope(entry.snapshot.scope);
        if (requirePublished && !this.published.get(provider)?.has(model))
            fail('BUILTIN_SOURCE_NOT_READY');
        return {
            entry, authority, snapshot: entry.snapshot, epoch: this.epoch, sourceEpoch: this.sourceEpochs.get(this.localRef(entry.route)) ?? 0,
        };
    }
    catalogVisible(provider) {
        const route = this.routes.get(provider);
        return this.published.has(provider) && route !== undefined;
    }
    /** Current exact owned admission used by explicit Session/default selectors.
     * @param provider - Native-owned route identity.
     * @param model - Exact manually admitted model id.
     * @returns Whether the source is published, unexpired and available for that model. */
    selectionAllowed(provider, model) { try {
        this.exact(provider, model);
        return true;
    }
    catch {
        return false;
    } }
    /** Secret-free tool choices from the current published native catalog.
     * Each provider remains its exact source/funding route; stale or revoked
     * grants and models without canonical image input never become helpers. */
    imageToolModels() {
        return [...this.published].flatMap(([provider, models]) => [...models].flatMap((model) => {
            try {
                const capture = this.exact(provider, model);
                return capture.authority.capabilityFlags.includes('image_in')
                    ? [{ provider, model }]
                    : [];
            }
            catch {
                return [];
            }
        }));
    }
    providerInfo(provider) {
        const name = this.knownRoutes.get(provider);
        if (name === undefined)
            fail('BUILTIN_SOURCE_UNAVAILABLE');
        return { id: provider, name };
    }
    async listModels(provider) {
        const entry = this.routes.get(provider);
        if (entry === undefined)
            fail('BUILTIN_SOURCE_UNAVAILABLE');
        return [...entry.models.values()].filter(model => this.published.get(provider)?.has(model.exactModelId)).map(model => modelInfo(entry.route, model));
    }
    async resolveModel(provider, model) {
        const capture = this.exact(provider, model);
        return modelInfo(capture.entry.route, capture.authority);
    }
    async prepareCall(provider, model) {
        const capture = this.exact(provider, model);
        return { model: modelInfo(capture.entry.route, capture.authority), stream: options => this.dispatch(options, capture) };
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
        if (capture.snapshot.operationId !== request.operationId || !deepEqualJson(request.selection, builtinSelectionRef(capture.entry.route, capture.authority)))
            fail('BUILTIN_REQUEST_IDENTITY_MISMATCH');
        const freeze = deepFreeze({
            schemaVersion: 1, scope: capture.snapshot.scope,
            hostGeneration: capture.snapshot.hostGeneration, catalogVersion: capture.snapshot.catalogVersion, catalogDigest: capture.snapshot.catalogDigest,
            selection: request.selection, authority: capture.authority, clientRequestId: request.clientRequestId, sessionId: null, purpose: request.purpose,
        });
        const headers = await this.admit(capture, freeze);
        const facts = { providerResponseId: null, returnedModel: null, usage: null, outcome: 'unknown' };
        const adapter = this.options.createAdapter(capture.entry.route, headers, facts, request.purpose);
        const started = performance.now();
        let firstVisibleTextMs = null, dispatchToTerminalMs = null;
        let errorCode = null;
        try {
            for await (const chunk of adapter.stream({
                provider: capture.entry.route.routeId, model: capture.authority.exactModelId,
                messages: [{ role: 'user', content: [{ type: 'text', text: request.prompt }] }], maxTokens: Math.min(32, capture.authority.maxOutputTokens ?? 32),
            })) {
                if (chunk.type === 'text-delta' && chunk.text.length > 0 &&
                    firstVisibleTextMs === null)
                    firstVisibleTextMs = Math.round(performance.now() - started);
                if (chunk.type === 'finish') {
                    dispatchToTerminalMs = Math.round(performance.now() - started);
                    if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')
                        errorCode = 'BUILTIN_VALIDATION_FAILED';
                }
            }
        }
        catch {
            errorCode = 'BUILTIN_VALIDATION_FAILED';
        }
        this.assertCapture(capture);
        if (facts.returnedModel !== null && facts.returnedModel !== request.selection.exactModelId) {
            facts.outcome = 'contract_invalid';
            facts.usage = null;
            errorCode = 'BUILTIN_RETURNED_MODEL_MISMATCH';
        }
        if (errorCode !== null && facts.outcome !== 'contract_invalid') {
            facts.outcome = 'failed';
            facts.usage = null;
        }
        return parseNativeBuiltinValidationResultV1({
            schemaVersion: 1, operationId: request.operationId, clientRequestId: request.clientRequestId,
            selection: request.selection, purpose: request.purpose, providerResponseId: facts.providerResponseId,
            returnedModel: facts.returnedModel,
            outcome: facts.outcome, usageOrigin: facts.usage === null ? 'unknown' : 'provider_terminal', usage: facts.usage,
            firstVisibleTextMs, dispatchToTerminalMs, errorCode,
        });
    }
    assertCapture(capture) {
        this.assertScope(capture.snapshot.scope);
        if (capture.epoch !== this.epoch)
            fail('BUILTIN_SCOPE_REVOKED');
        if (capture.sourceEpoch !== (this.sourceEpochs.get(this.localRef(capture.entry.route)) ?? 0))
            fail('BUILTIN_SOURCE_REVOKED');
    }
    async admit(capture, freeze) {
        this.assertCapture(capture);
        let frozen;
        try {
            frozen = parseNativeBuiltinFrozenRequestV1(await this.options.admit(freeze));
        }
        catch (error) {
            if (error instanceof LlmError && /^BUILTIN_[A-Z_]+$/.test(error.code ?? ''))
                throw error;
            fail('BUILTIN_REQUEST_NOT_ADMITTED');
        }
        if (frozen.clientRequestId !== freeze.clientRequestId || frozen.sessionId !== freeze.sessionId || frozen.purpose !== freeze.purpose
            || !deepEqualJson(frozen.selection, freeze.selection) || !deepEqualJson(frozen.authority, freeze.authority))
            fail('BUILTIN_REQUEST_IDENTITY_MISMATCH');
        this.assertCapture(capture);
        if (frozen.requestReceipt !== null)
            fail('BUILTIN_REQUEST_NOT_ADMITTED');
        if (capture.entry.route.mode === 'local_direct')
            return {};
        return { 'X-Request-Id': frozen.clientRequestId, 'X-StudyBuddy-Request-Purpose': frozen.purpose };
    }
    async *dispatch(options, capture) {
        this.assertScope(capture.snapshot.scope);
        if (capture.epoch !== this.epoch)
            fail('BUILTIN_SCOPE_REVOKED');
        if (capture.sourceEpoch !== (this.sourceEpochs.get(this.localRef(capture.entry.route)) ?? 0))
            fail('BUILTIN_SOURCE_REVOKED');
        if (options.provider !== capture.entry.route.routeId ||
            options.model !== capture.authority.exactModelId)
            fail('BUILTIN_MODEL_NOT_ALLOWED');
        if (!isAgentLoopRequest(options))
            fail('BUILTIN_TRUST_REQUIRED');
        const conversation = this.options.trustedConversation(options);
        if (conversation === undefined || options.sessionId === undefined ||
            conversation.sessionId !== String(options.sessionId))
            fail('BUILTIN_TRUST_REQUIRED');
        if (options.reasoningEffort !== undefined || options.temperature !== undefined)
            fail('BUILTIN_PARAMETER_NOT_ALLOWED');
        if ((options.tools?.length ?? 0) > 0 && !capture.authority.capabilityFlags.includes('tool_use'))
            fail('BUILTIN_CAPABILITY_NOT_ALLOWED');
        const freeze = deepFreeze({
            schemaVersion: 1, scope: capture.snapshot.scope,
            hostGeneration: capture.snapshot.hostGeneration, catalogVersion: capture.snapshot.catalogVersion, catalogDigest: capture.snapshot.catalogDigest,
            selection: builtinSelectionRef(capture.entry.route, capture.authority), authority: capture.authority,
            clientRequestId: randomUUID(), sessionId: conversation.sessionId, purpose: 'chat',
        });
        const headers = await this.admit(capture, freeze);
        if (options.signal?.aborted)
            return;
        await conversation.appendAudit(freeze);
        this.assertCapture(capture);
        const facts = { providerResponseId: null, returnedModel: null, usage: null, outcome: 'unknown' };
        const adapter = this.options.createAdapter(capture.entry.route, headers, facts);
        for await (const chunk of adapter.stream(options)) {
            if (chunk.type === 'usage')
                continue;
            if (chunk.type === 'finish' && (chunk.reason.kind === 'stop' || chunk.reason.kind === 'max-tokens' || chunk.reason.kind === 'tool-calls') && facts.returnedModel === capture.authority.exactModelId) {
                const usage = projectBuiltinTerminalUsage(facts);
                if (usage !== undefined)
                    yield { type: 'usage', usage };
            }
            yield chunk;
        }
    }
}
//# sourceMappingURL=studybuddy-builtin-models.js.map