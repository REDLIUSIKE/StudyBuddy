/** Main-owned bridge from saved native sources to exact private Host consumer routing. */
import { createHash, randomUUID } from 'node:crypto';
import { canonicalNativeBuiltinCatalogPayloadV1, parseNativeBuiltinCatalogAppliedV1, parseNativeBuiltinPreparedSourceV1, parseNativeBuiltinReadinessV1, parseNativeBuiltinRequestFreezeV1, parseNativeBuiltinValidationRequestV1, parseNativeBuiltinValidationResultV1, parseNativeBuiltinFrozenRequestV1, parseNativeBuiltinRequestReceiptV1, } from '@studybuddy/contracts';
import { ModelKeyClient } from "./model-key-client.js";
const requestUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function retainedKeyRequest(raw, owner, requestId) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
    const row = value;
    if (Object.keys(row).sort().join(',') !== 'accountOwner,apiKey,frozen,gatewayOrigin,keySha256,schemaVersion' ||
        row.schemaVersion !== 1 || row.accountOwner !== owner || typeof row.apiKey !== 'string' ||
        !row.apiKey || row.apiKey.length > 4096 || /[\s\p{Cc}]/u.test(row.apiKey) ||
        row.keySha256 !== createHash('sha256').update(row.apiKey).digest('hex') || typeof row.gatewayOrigin !== 'string') {
        throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
    }
    const url = new URL(row.gatewayOrigin);
    if (url.protocol !== 'https:' || url.origin !== row.gatewayOrigin || url.username || url.password)
        throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
    const frozen = parseNativeBuiltinFrozenRequestV1(row.frozen);
    if (frozen.clientRequestId !== requestId || frozen.requestReceipt !== null)
        throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
    return { schemaVersion: 1, accountOwner: owner, frozen, gatewayOrigin: row.gatewayOrigin, apiKey: row.apiKey,
        keySha256: row.keySha256 };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const scopeKey = (scope) => JSON.stringify([scope.accountId, scope.generation]);
// Derive the keyless readback from the actual native grant, never from discovery.
function grantedRefs(material) {
    return material.routes.flatMap((route) => {
        const grant = route.mode === 'gateway' ? route.binding.grant : route.grant;
        const owner = route.mode === 'gateway' ? route.binding.grant.scope : route.grant;
        const connectionId = route.mode === 'gateway' ? route.binding.connectionId : route.grant.connectionId;
        return grant.allowedModels.map(model => ({
            routeId: route.routeId, sourceId: owner.sourceId, localRef: owner.localRef, providerId: model.providerId,
            exactModelId: model.exactModelId, protocol: model.protocol, connectionId, credentialRevision: owner.credentialRevision,
            grantRevision: grant.grantRevision, fundingSource: route.mode === 'gateway' ? route.binding.grant.scope.fundingSource : 'user_api',
        }));
    });
}
const sameRefs = (a, b) => same(a.map(row => JSON.stringify(row)).sort(), b.map(row => JSON.stringify(row)).sort());
/** Per-source catalogs, account fences, and user-authorized validation owner. */
export class BuiltinCoordinator {
    deps;
    keyRequests = new Map();
    installed = new Map();
    published = new Map();
    revoked = new Set();
    queues = new Map();
    diagnostics = new Map();
    sourceEpochs = new Map();
    hostGeneration;
    constructor(deps) {
        this.deps = deps;
    }
    assert(scope, host) {
        if (this.revoked.has(scopeKey(scope)) || !this.deps.isCurrent(scope))
            throw new Error('BUILTIN_SCOPE_REVOKED');
        const current = this.deps.host();
        if (current === undefined || host !== undefined && current !== host)
            throw new Error('BUILTIN_HOST_UNAVAILABLE');
        const generation = current.builtinContext(scope).hostGeneration;
        if (generation !== this.hostGeneration) {
            this.installed.clear();
            this.published.clear();
            this.hostGeneration = generation;
        }
        return current;
    }
    enqueue(scope, operationId, operation, accountWide = false) {
        const key = JSON.stringify([accountWide ? [scope.accountId, 'model-key-request'] : scopeKey(scope), operationId]);
        const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
        this.queues.set(key, next);
        void next.finally(() => { if (this.queues.get(key) === next)
            this.queues.delete(key); }).catch(() => undefined);
        return next;
    }
    async install(scope, operationId) {
        const epochs = new Map(this.sourceEpochs);
        const host = this.assert(scope), context = host.builtinContext(scope);
        let readiness = parseNativeBuiltinReadinessV1(await this.deps.native.invokeBuiltin(scope, 'prepareBuiltinSource', [operationId, context]));
        this.assert(scope, host);
        if (readiness.operationId !== operationId)
            throw new Error('BUILTIN_OPERATION_MISMATCH');
        const assertSource = () => {
            this.assert(scope, host);
            if ((epochs.get(readiness.localRef) ?? 0) !== (this.sourceEpochs.get(readiness.localRef) ?? 0))
                throw new Error('BUILTIN_SOURCE_REVOKED');
        };
        assertSource();
        if (readiness.state === 'unsupported' || readiness.state === 'failed' && readiness.phase !== 'validation')
            return { readiness, host };
        const material = parseNativeBuiltinPreparedSourceV1(await this.deps.native.invokeBuiltin(scope, 'getBuiltinSourceMaterial', [operationId, context]));
        assertSource();
        if (material.operationId !== operationId || material.localRef !== readiness.localRef ||
            material.sourceRevision !== readiness.sourceRevision)
            throw new Error('BUILTIN_SOURCE_REVISION_MISMATCH');
        let source = this.installed.get(material.localRef);
        if (source === undefined || !same(source.material, material) || !same(source.snapshot.scope, scope) ||
            source.snapshot.hostGeneration !== context.hostGeneration) {
            const input = {
                schemaVersion: 1, operationId, scope, hostGeneration: context.hostGeneration,
                catalogVersion: `source-${randomUUID()}`, catalogDigest: '0'.repeat(64), routes: material.routes,
            };
            const snapshot = {
                ...input, catalogDigest: createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(input), 'utf8').digest('hex'),
            };
            const applied = parseNativeBuiltinCatalogAppliedV1(await host.builtinApply(snapshot));
            assertSource();
            const ack = parseNativeBuiltinCatalogAppliedV1(await host.builtinReadback(scope, operationId));
            if (!same(applied, ack) || ack.operationId !== operationId || !same(ack.scope, scope) ||
                ack.hostGeneration !== snapshot.hostGeneration
                || ack.catalogVersion !== snapshot.catalogVersion || ack.catalogDigest !== snapshot.catalogDigest
                || !sameRefs(ack.applied, grantedRefs(material)))
                throw new Error('BUILTIN_HOST_ACK_MISMATCH');
            assertSource();
            source = { material, snapshot, ack };
            this.installed.set(material.localRef, source);
            this.published.delete(material.localRef);
        }
        readiness = parseNativeBuiltinReadinessV1(await this.deps.native.invokeBuiltin(scope, 'acknowledgeBuiltinCatalog', [source.ack]));
        assertSource();
        return { source, readiness, host };
    }
    async publish(scope, host, readiness) {
        this.assert(scope, host);
        if (readiness.state === 'ready') {
            const source = this.installed.get(readiness.localRef);
            if (source === undefined || readiness.operationId !== source.material.operationId ||
                readiness.sourceRevision !== source.material.sourceRevision
                || !same(readiness.hostApplied, source.ack))
                throw new Error('BUILTIN_READINESS_STALE');
            await host.builtinPublish({ schemaVersion: 1, readiness });
            this.assert(scope, host);
            this.published.set(readiness.localRef, readiness);
        }
        else if (this.published.has(readiness.localRef)) {
            await this.withdraw(scope, host, readiness.localRef);
        }
        return readiness;
    }
    publicReadiness(scope, host, readiness) {
        if (readiness.state !== 'ready')
            return readiness;
        const source = this.installed.get(readiness.localRef);
        const current = source !== undefined && same(source.snapshot.scope, scope) &&
            source.snapshot.hostGeneration === host.builtinContext(scope).hostGeneration
            && readiness.operationId === source.material.operationId && readiness.sourceRevision === source.material.sourceRevision
            && same(readiness.hostApplied, source.ack);
        if (current && same(this.published.get(readiness.localRef), readiness))
            return readiness;
        return {
            ...readiness, state: 'pending', phase: 'host_apply', appliedModels: [], errorCode: null,
            hostApplied: current ? source.ack : null, catalogVersion: current ? source.ack.catalogVersion : null,
            catalogDigest: current ? source.ack.catalogDigest : null,
        };
    }
    async withdraw(scope, host, localRef) {
        this.published.delete(localRef);
        this.installed.delete(localRef);
        await host.builtinRevoke(scope, localRef);
        this.assert(scope, host);
    }
    rememberDiagnostic(result) {
        this.diagnostics.set(result.clientRequestId, result);
        const rows = [...this.diagnostics].filter(([, row]) => row.selection.localRef === result.selection.localRef);
        for (const [id] of rows.slice(0, -3))
            this.diagnostics.delete(id);
    }
    /** Resume the original journal stage; never issue another inference.
     * @param scope - Main-owned authenticated account generation.
     * @param operationId - Original source saved journal operation.
     * @returns Truthful current native readiness. */
    resume(scope, operationId) {
        return this.enqueue(scope, operationId, async () => {
            const installed = await this.install(scope, operationId);
            if (installed.source === undefined)
                return installed.readiness;
            const readiness = parseNativeBuiltinReadinessV1(await this.deps.native.invokeBuiltin(scope, 'resumeBuiltinSource', [operationId, installed.host.builtinContext(scope)]));
            return this.publish(scope, installed.host, readiness);
        });
    }
    /** User-authorized save/validation action: exactly one selected model, no automatic first model.
     * @param scope - Main-owned account generation.
     * @param operationId - Saved journal identity.
     * @param selection - Explicit human model/protocol membership selection.
     * @returns Native-confirmed readiness after real protected dispatch. */
    prepareAndValidate(scope, operationId, selection) {
        return this.enqueue(scope, operationId, async () => {
            const { source, readiness: initial, host } = await this.install(scope, operationId);
            if (source === undefined || initial.state === 'ready')
                return this.publish(scope, host, initial);
            const ref = source.ack.applied.find(row => row.exactModelId === selection.exactModelId && row.protocol === selection.protocol);
            if (ref === undefined)
                throw new Error('BUILTIN_MODEL_NOT_ALLOWED');
            this.assert(scope, host);
            const request = {
                schemaVersion: 1, operationId, selection: ref,
                clientRequestId: randomUUID(), purpose: 'validation', prompt: 'Reply with OK.',
            };
            const result = parseNativeBuiltinValidationResultV1(await host.builtinValidate(request));
            this.assert(scope, host);
            if (result.operationId !== request.operationId || result.clientRequestId !== request.clientRequestId ||
                result.purpose !== 'validation' || !same(result.selection, ref))
                throw new Error('BUILTIN_DIAGNOSTIC_MISMATCH');
            this.rememberDiagnostic(result);
            let readiness;
            const route = source.material.routes.find(row => row.routeId === ref.routeId);
            if (route === undefined)
                throw new Error('BUILTIN_ROUTE_MISMATCH');
            if (route.mode === 'local_direct' && result.outcome === 'completed' &&
                result.usageOrigin === 'provider_terminal' && result.providerResponseId !== null && result.returnedModel === ref.exactModelId) {
                readiness = parseNativeBuiltinReadinessV1(await this.deps.native.invokeBuiltin(scope, 'acknowledgeBuiltinLocalValidation', [{
                        schemaVersion: 1, operationId, clientRequestId: result.clientRequestId, scope, hostGeneration: source.snapshot.hostGeneration,
                        catalogVersion: source.snapshot.catalogVersion, catalogDigest: source.snapshot.catalogDigest, selection: ref,
                        providerResponseId: result.providerResponseId, returnedModel: result.returnedModel, outcome: result.outcome,
                        usageOrigin: 'provider_terminal', usage: result.usage,
                    }]));
            }
            else
                readiness = parseNativeBuiltinReadinessV1(await this.deps.native.invokeBuiltin(scope, 'resumeBuiltinSource', [operationId, host.builtinContext(scope)]));
            return this.publish(scope, host, readiness);
        });
    }
    /** Per-source login/Host restore uses existing protected source journals without a paid probe.
     * @param scope - New authenticated Main generation. */
    async restore(scope) {
        this.assert(scope);
        const owned = await this.deps.ownedOperations?.(scope);
        this.assert(scope);
        const rows = owned === undefined ? await this.list(scope) : await this.list(scope).catch(() => []);
        for (const operationId of new Set(owned ?? rows.map(row => row.operationId))) {
            this.assert(scope);
            await this.resume(scope, operationId).catch(() => undefined);
        }
    }
    /** Read secret-free native readiness for the actual current Host.
     * @param scope - Main-owned authenticated generation.
     * @returns Independent readiness for each source. */
    async list(scope) {
        const host = this.assert(scope);
        const rows = await this.deps.native.invokeBuiltin(scope, 'listBuiltinReadiness', [host.builtinContext(scope)]);
        this.assert(scope, host);
        const readiness = rows.map(parseNativeBuiltinReadinessV1);
        for (const [localRef, confirmed] of this.published) {
            const current = readiness.find(row => row.localRef === localRef);
            if (current === undefined || current.state !== 'ready' || !same(current, confirmed))
                await this.withdraw(scope, host, localRef);
        }
        return readiness.map(row => this.publicReadiness(scope, host, row));
    }
    /** Read source diagnostics and balance metadata without dispatching or fetching balance.
     * @param scope - Authenticated Main owner.
     * @param localRef - Owned source row.
     * @returns Cached secret-free detail bound to the current installed proof. */
    async detail(scope, localRef) {
        const host = this.assert(scope);
        const cached = await this.deps.native.invokeBuiltin(scope, 'getBuiltinSourceDetail', [localRef]);
        this.assert(scope, host);
        const lastDiagnostics = [...this.diagnostics.values()].filter(row => row.selection.localRef === localRef);
        return {
            ...cached, readiness: cached.readiness === null ? null : this.publicReadiness(scope, host, cached.readiness),
            lastDiagnostics: [...cached.lastDiagnostics.filter(row => !lastDiagnostics.some(value => value.clientRequestId === row.clientRequestId)), ...lastDiagnostics].slice(-3),
        };
    }
    /** Execute only an explicit diagnostic from the signed-in source detail action.
     * @param scope - Main-authenticated owner; no renderer scope or authority is accepted.
     * @param input - Human-selected exact public source reference.
     * @returns Actual private adapter diagnostic, containing no Key or ticket. */
    async diagnostic(scope, input) {
        const request = parseNativeBuiltinValidationRequestV1(input);
        if (request.purpose !== 'diagnostic')
            throw new Error('BUILTIN_DIAGNOSTIC_PURPOSE_REQUIRED');
        return this.enqueue(scope, request.operationId, async () => {
            const host = this.assert(scope), source = this.installed.get(request.selection.localRef);
            if (source === undefined || source.material.operationId !== request.operationId || !source.ack.applied.some(row => same(row, request.selection)))
                throw new Error('BUILTIN_HOST_NOT_APPLIED');
            const owned = { ...request, clientRequestId: randomUUID() };
            const result = parseNativeBuiltinValidationResultV1(await host.builtinValidate(owned));
            this.assert(scope, host);
            if (result.operationId !== owned.operationId || result.clientRequestId !== owned.clientRequestId ||
                result.purpose !== 'diagnostic' || !same(result.selection, owned.selection))
                throw new Error('BUILTIN_DIAGNOSTIC_MISMATCH');
            this.rememberDiagnostic(result);
            return result;
        });
    }
    /** Explicit balance refresh preserves native balance authority and never triggers model dispatch.
     * @param scope - Main owner.
     * @param localRef - Exact native source. */
    async refreshBalance(scope, localRef) {
        const host = this.assert(scope);
        const result = await this.deps.native.invokeBuiltin(scope, 'refreshBuiltinBalance', [localRef]);
        this.assert(scope, host);
        return result;
    }
    /** Admit freezes from the current Host or a Main-owned consumer.
     * @param input - Process-owned exact source request freeze.
     * @returns The exact Key-only request freeze; never passed to renderer IPC. */
    async admit(input) {
        const request = parseNativeBuiltinRequestFreezeV1(input);
        return this.enqueue(request.scope, request.clientRequestId, async () => {
            const host = this.assert(request.scope);
            if (host.builtinContext(request.scope).hostGeneration !== request.hostGeneration)
                throw new Error('BUILTIN_HOST_GENERATION_MISMATCH');
            const source = this.installed.get(request.selection.localRef);
            if (source === undefined || source.snapshot.catalogVersion !== request.catalogVersion ||
                source.snapshot.catalogDigest !== request.catalogDigest
                || !source.ack.applied.some(row => same(row, request.selection)))
                throw new Error('BUILTIN_HOST_NOT_APPLIED');
            const result = parseNativeBuiltinFrozenRequestV1(await this.deps.native.invokeBuiltin(request.scope, 'prepareBuiltinKeyRequest', [request]));
            this.assert(request.scope, host);
            if (result.clientRequestId !== request.clientRequestId || result.sessionId !== request.sessionId ||
                result.purpose !== request.purpose || !same(result.selection, request.selection) || !same(result.authority, request.authority) || result.requestReceipt !== null) {
                throw Error('BUILTIN_REQUEST_FREEZE_INVALID');
            }
            const route = source.material.routes.find(row => row.routeId === request.selection.routeId);
            if (!route)
                throw Error('BUILTIN_SOURCE_UNAVAILABLE');
            if (route.mode === 'gateway') {
                const record = { schemaVersion: 1, accountOwner: request.scope.accountId,
                    frozen: result, gatewayOrigin: route.gatewayOrigin, apiKey: route.apiKey,
                    keySha256: createHash('sha256').update(route.apiKey).digest('hex') };
                const vault = this.deps.requestVault?.(request.scope.accountId, request.clientRequestId);
                if (!vault)
                    throw Error('BUILTIN_REQUEST_RECOVERY_UNAVAILABLE');
                const prior = await vault.read();
                if (prior !== null && !same(retainedKeyRequest(prior, request.scope.accountId, request.clientRequestId), record))
                    throw Error('BUILTIN_REQUEST_CONFLICT');
                if (prior === null)
                    await vault.write(JSON.stringify(record));
                this.assert(request.scope, host);
                this.keyRequests.set(request.clientRequestId, { scope: request.scope, record });
            }
            return result;
        }, true);
    }
    /** Read exact, published gateway choices without exposing private routes.
     * @param scope - Current Main account generation.
     * @returns Keyless choices; local direct credentials are excluded. */
    async consumerCatalog(scope) {
        // Published configured material is local. A model call must not refresh
        // business login/readiness; the target API checks the actual Key.
        const host = this.assert(scope), rows = [...this.published.values()], result = [];
        for (const row of rows) {
            if (row.state !== 'ready')
                continue;
            const source = this.installed.get(row.localRef);
            if (source === undefined)
                continue;
            for (const selection of source.ack.applied) {
                const route = source.material.routes.find(value => value.routeId === selection.routeId);
                if (route?.mode !== 'gateway' || route.binding.state !== 'active')
                    continue;
                const authority = route.binding.grant.allowedModels.find(value => value.exactModelId === selection.exactModelId &&
                    value.protocol === selection.protocol && value.providerId === selection.providerId);
                if (authority === undefined || authority.maxOutputTokens === null)
                    continue;
                const identity = [scope, host.builtinContext(scope).hostGeneration, source.ack.catalogDigest, selection, authority];
                result.push({ handle: createHash('sha256').update(JSON.stringify(identity)).digest('hex'), sourceLabel: route.displayName,
                    selection, authority, catalogVersion: source.ack.catalogVersion, catalogDigest: source.ack.catalogDigest });
            }
        }
        return result;
    }
    /** Freeze one current gateway choice; revalidate all authority after native preparation.
     * @param scope - Main-owned authenticated generation.
     * @param input - Private local consumer request, never a renderer authority.
     * @returns The exact Key-only freeze and gateway route. */
    async prepareConsumerRequest(scope, input) {
        const chosen = (await this.consumerCatalog(scope)).find(row => row.handle === input.handle);
        const host = this.assert(scope), source = chosen && this.installed.get(chosen.selection.localRef);
        if (!chosen || !source || chosen.selection.protocol !== input.protocol)
            throw new Error('AIGC_MODEL_UNAVAILABLE');
        const frozen = parseNativeBuiltinFrozenRequestV1(await this.admit({ schemaVersion: 1, scope,
            hostGeneration: source.snapshot.hostGeneration, catalogVersion: chosen.catalogVersion, catalogDigest: chosen.catalogDigest,
            selection: chosen.selection, authority: chosen.authority, clientRequestId: input.clientRequestId,
            sessionId: input.sessionId, purpose: 'chat' }));
        this.assert(scope, host);
        const current = (await this.consumerCatalog(scope)).find(row => row.handle === chosen.handle);
        this.assert(scope, host);
        const route = source.material.routes.find(row => row.routeId === chosen.selection.routeId);
        if (!same(current, chosen) || this.installed.get(chosen.selection.localRef) !== source || route?.mode !== 'gateway' ||
            frozen.clientRequestId !== input.clientRequestId || frozen.sessionId !== input.sessionId || frozen.purpose !== 'chat' ||
            !same(frozen.selection, chosen.selection) || !same(frozen.authority, chosen.authority) ||
            frozen.requestReceipt !== null)
            throw new Error('AIGC_MODEL_UNAVAILABLE');
        return { frozen, route };
    }
    /** Read the native request journal without inferring billing from transport usage.
     * @param scope - Current Main account generation.
     * @param requestId - Original frozen request identity.
     * @returns Trusted native state or unknown; no request ticket leaves Main. */
    async consumerRequestStatus(scope, requestId) {
        const host = this.assert(scope);
        if (!requestUUID.test(requestId))
            throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
        let entry = this.keyRequests.get(requestId);
        if (!entry || !same(entry.scope, scope)) {
            const raw = await this.deps.requestVault?.(scope.accountId, requestId).read();
            this.assert(scope, host);
            if (raw === undefined || raw === null)
                return null;
            entry = { scope, record: retainedKeyRequest(raw, scope.accountId, requestId) };
            this.keyRequests.set(requestId, entry);
        }
        if (!this.deps.fetch)
            throw Error('BUILTIN_REQUEST_STATUS_UNAVAILABLE');
        const client = new ModelKeyClient({ baseUrl: entry.record.gatewayOrigin, readKey: async () => entry.record.apiKey, fetch: this.deps.fetch });
        const response = await client.requestStatus(requestId, AbortSignal.timeout(30_000));
        this.assert(scope, host);
        if (!response.ok) {
            await response.body?.cancel();
            this.assert(scope, host);
            if (response.status === 404)
                return null;
            throw Error('BUILTIN_REQUEST_STATUS_UNAVAILABLE');
        }
        if (!response.body)
            throw Error('BUILTIN_REQUEST_STATUS_UNAVAILABLE');
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try {
            for (;;) {
                const part = await reader.read();
                this.assert(scope, host);
                if (part.done)
                    break;
                size += part.value.byteLength;
                if (size > 32 * 1024)
                    throw Error('BUILTIN_REQUEST_STATUS_UNAVAILABLE');
                chunks.push(part.value);
            }
        }
        finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
        let value;
        try {
            value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        }
        catch {
            throw Error('BUILTIN_REQUEST_STATUS_UNAVAILABLE');
        }
        this.assert(scope, host);
        const receipt = value === null ? null : parseNativeBuiltinRequestReceiptV1(value);
        if (receipt !== null && (receipt.requestId !== requestId || receipt.purpose !== entry.record.frozen.purpose))
            throw new Error('AIGC_RECEIPT_INVALID');
        return receipt === null ? null : { ...receipt, requestTicket: null };
    }
    /** Fence all old Main requests before awaiting the private Host revocation.
     * @param scope - Account generation being invalidated. */
    async revoke(scope) {
        this.revoked.add(scopeKey(scope));
        this.installed.clear();
        this.published.clear();
        this.diagnostics.clear();
        this.keyRequests.clear();
        await this.deps.host()?.builtinRevoke(scope);
    }
    /** Revoke one source independently, retaining every other private catalog.
     * @param scope - Current owner.
     * @param localRef - Native local source identifier. */
    async revokeSource(scope, localRef) {
        const host = this.assert(scope);
        this.sourceEpochs.set(localRef, (this.sourceEpochs.get(localRef) ?? 0) + 1);
        this.installed.delete(localRef);
        this.published.delete(localRef);
        await host.builtinRevoke(scope, localRef);
        this.assert(scope, host);
        await this.deps.native.invokeBuiltin(scope, 'revokeBuiltinSource', [localRef]);
    }
    /** Close Host routing after native has confirmed an existing source delete/revoke.
     * @param scope - Current owner.
     * @param localRef - Already revoked native source. */
    async forgetSource(scope, localRef) {
        const host = this.assert(scope);
        this.sourceEpochs.set(localRef, (this.sourceEpochs.get(localRef) ?? 0) + 1);
        this.installed.delete(localRef);
        this.published.delete(localRef);
        for (const [id, row] of this.diagnostics)
            if (row.selection.localRef === localRef)
                this.diagnostics.delete(id);
        await host.builtinRevoke(scope, localRef);
    }
}
//# sourceMappingURL=builtin-coordinator.js.map