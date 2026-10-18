import { getNativeToolDefinition } from './native-tools.js';
import { parseExactNativeToolVersion } from './native-tool-version.js';
import { TOOL_CONNECTION_PERMISSION_STATES, TOOL_CONNECTION_STATES } from './tool-connection.js';
import { parseNativeRegisteredSourceRefV2 } from './native-user-sources.js';
import { parseNativeToolFrozenModelV2 } from './native-tool-connection-v2.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PROTOCOLS = ['openai_responses', 'openai_chat_completions', 'anthropic_messages'];
const MODEL_KEYS = ['logicalModelId', 'providerId', 'exactModelId', 'displayName', 'toolId', 'protocol', 'contextWindow', 'maxOutputTokens', 'capabilityFlags', 'evidenceSha256', 'membershipRevision', 'availability'];
const COUNTS = ['inputTokens', 'outputTokens', 'inputTotalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens'];
function invalid() { throw new TypeError('NATIVE_SOURCE_GRANT_V3_INVALID'); }
function record(value, keys) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const actual = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k) || !Object.hasOwn(descriptors[k], 'value')))
        invalid();
    return value;
}
function text(value, max = 128) { if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || /\p{Cc}/u.test(value))
    invalid(); return value; }
function id(value) { if (typeof value !== 'string' || !MODEL.test(value))
    invalid(); return value; }
function uuid(value, v4 = false) { const result = text(value); if (!UUID.test(result) || v4 && result[14] !== '4')
    invalid(); return result; }
function hash(value) { const result = text(value); if (!/^[0-9a-f]{64}$/.test(result))
    invalid(); return result; }
function positive(value) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    invalid(); return value; }
function instant(value) { const result = text(value); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result)
    invalid(); return result; }
function protocol(value) { if (!PROTOCOLS.includes(value))
    invalid(); return value; }
function provider(value) { if (value !== 'deepseek' && value !== 'kimi')
    invalid(); return value; }
function tool(value) { return getNativeToolDefinition(value).id; }
function configurable(toolId, wire) { const definition = getNativeToolDefinition(toolId); if (definition.noModelConfig || definition.configurationRestriction !== null || definition.configurationEvidence !== 'verified' || !definition.protocols.includes(wire))
    invalid(); }
function nullableRevision(value) { return value === null ? null : text(value); }
function origin(value) {
    const result = text(value, 512);
    const URLClass = globalThis.URL;
    const url = new URLClass(result);
    if (url.protocol !== 'https:' || url.origin !== result || url.pathname !== '/' || url.username || url.password || !url.hostname.includes('.') || url.hostname.includes(':') || /^\d+(\.\d+){3}$/.test(url.hostname) || /(^|\.)(localhost|local|internal)$/.test(url.hostname))
        invalid();
    return result;
}
/** Syntax-only codecs: none of these issue or refresh authority. */
export function parseNativeSourceGrantModelV1(value) {
    const row = record(value, [...MODEL_KEYS, 'capabilityRevision', 'adapterRevision', 'priceAuthorityRevision']);
    const base = parseNativeToolFrozenModelV2(Object.fromEntries(MODEL_KEYS.map(k => [k, row[k]])));
    return { ...base, capabilityRevision: text(row.capabilityRevision), adapterRevision: text(row.adapterRevision), priceAuthorityRevision: nullableRevision(row.priceAuthorityRevision) };
}
export function parseNativeSourceGrantV1(value) {
    const row = record(value, ['schemaVersion', 'grantRevision', 'scope', 'allowedModels']);
    if (row.schemaVersion !== 1)
        invalid();
    const s = record(row.scope, ['ownerReference', 'deviceReference', 'toolId', 'providerId', 'baseUrl', 'credentialReference', 'credentialRevision', 'protocol', 'fundingSource']);
    const providerId = provider(s.providerId), wire = protocol(s.protocol), toolId = tool(s.toolId);
    const baseUrl = text(s.baseUrl, 512), root = providerId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.moonshot.cn';
    if (s.fundingSource !== 'user_api' || !(wire === 'anthropic_messages' ? [root + '/anthropic'] : [root, root + '/v1']).includes(baseUrl))
        invalid();
    const scope = { ownerReference: uuid(s.ownerReference), deviceReference: uuid(s.deviceReference), toolId, providerId, baseUrl, credentialReference: text(s.credentialReference), credentialRevision: text(s.credentialRevision), protocol: wire, fundingSource: 'user_api' };
    if (!Array.isArray(row.allowedModels) || row.allowedModels.length < 1 || row.allowedModels.length > 64)
        invalid();
    const allowedModels = row.allowedModels.map(parseNativeSourceGrantModelV1);
    const logical = new Set();
    for (let i = 0; i < allowedModels.length; i++) {
        const m = allowedModels[i];
        if (m.providerId !== providerId || m.toolId !== toolId || m.protocol !== wire || m.availability !== 'available' || logical.has(m.logicalModelId) || i > 0 && allowedModels[i - 1].exactModelId >= m.exactModelId)
            invalid();
        logical.add(m.logicalModelId);
    }
    return { schemaVersion: 1, grantRevision: hash(row.grantRevision), scope, allowedModels };
}
export function parseNativeUserSourceMaterialRequestV3(value) {
    const r = record(value, ['audience', 'toolId', 'selectedModelId', 'selectedProtocol', 'catalogRevision', 'materialNonce', 'receiptRevision', 'registration', 'installedToolVersion']);
    const toolId = tool(r.toolId), selectedProtocol = protocol(r.selectedProtocol);
    configurable(toolId, selectedProtocol);
    if (r.audience !== 'studybuddy-native-tools-v3')
        invalid();
    const installedToolVersion = text(r.installedToolVersion);
    parseExactNativeToolVersion(installedToolVersion);
    return { audience: 'studybuddy-native-tools-v3', toolId, selectedModelId: id(r.selectedModelId), selectedProtocol, catalogRevision: text(r.catalogRevision), materialNonce: uuid(r.materialNonce, true), receiptRevision: positive(r.receiptRevision), registration: parseNativeRegisteredSourceRefV2(r.registration), installedToolVersion };
}
function userApi(row) { if (row.fundingSource !== 'user_api')
    invalid(); const r = record(row.userApi, ['connectionId', 'credentialReference', 'credentialRevision']); return { connectionId: uuid(r.connectionId, true), credentialReference: text(r.credentialReference), credentialRevision: text(r.credentialRevision) }; }
function grantScopeMatches(g, row, u) {
    if (g.scope.ownerReference !== row.accountOwner || g.scope.deviceReference !== row.deviceId || g.scope.toolId !== row.toolId || g.scope.protocol !== row.protocol || g.scope.credentialReference !== u.credentialReference || g.scope.credentialRevision !== u.credentialRevision)
        invalid();
}
export function parseNativeToolMaterialV3(value) {
    const r = record(value, ['schemaVersion', 'connectionId', 'accountOwner', 'deviceId', 'toolId', 'fundingSource', 'userApi', 'selectedProviderId', 'gatewayOrigin', 'protocol', 'selectedModelId', 'sourceGrant', 'apiKey', 'authorityHandle', 'pendingBindingRevision', 'credentialRevision', 'receiptRevision', 'catalogRevision', 'policyRevision', 'pendingExpiresAt']);
    if (r.schemaVersion !== 3)
        invalid();
    const u = userApi(r), sourceGrant = parseNativeSourceGrantV1(r.sourceGrant), toolId = tool(r.toolId), wire = protocol(r.protocol);
    configurable(toolId, wire);
    grantScopeMatches(sourceGrant, r, u);
    const connectionId = uuid(r.connectionId, true), selectedModelId = id(r.selectedModelId), selectedProviderId = provider(r.selectedProviderId), apiKey = text(r.apiKey, 4096);
    if (connectionId !== u.connectionId || /\s/u.test(apiKey) || selectedProviderId !== sourceGrant.scope.providerId || !sourceGrant.allowedModels.some(m => m.exactModelId === selectedModelId))
        invalid();
    return { schemaVersion: 3, connectionId, accountOwner: uuid(r.accountOwner), deviceId: uuid(r.deviceId), toolId, fundingSource: 'user_api', userApi: u, selectedProviderId, gatewayOrigin: origin(r.gatewayOrigin), protocol: wire, selectedModelId, sourceGrant, apiKey, authorityHandle: uuid(r.authorityHandle), pendingBindingRevision: text(r.pendingBindingRevision), credentialRevision: positive(r.credentialRevision), receiptRevision: positive(r.receiptRevision), catalogRevision: text(r.catalogRevision), policyRevision: text(r.policyRevision), pendingExpiresAt: instant(r.pendingExpiresAt) };
}
export function parseNativeToolBindingV3(value) {
    const r = record(value, ['schemaVersion', 'toolId', 'protocol', 'connectionId', 'authorityHandle', 'bindingRevision', 'credentialRevision', 'receiptRevision', 'catalogRevision', 'policyRevision', 'grantRevision']);
    if (r.schemaVersion !== 3)
        invalid();
    return { schemaVersion: 3, toolId: tool(r.toolId), protocol: protocol(r.protocol), connectionId: uuid(r.connectionId, true), authorityHandle: uuid(r.authorityHandle), bindingRevision: text(r.bindingRevision), credentialRevision: positive(r.credentialRevision), receiptRevision: positive(r.receiptRevision), catalogRevision: text(r.catalogRevision), policyRevision: text(r.policyRevision), grantRevision: hash(r.grantRevision) };
}
export function parseNativeToolUsageRequestV3(value) {
    const r = record(value, ['binding', 'cursor', 'limit']), c = record(r.cursor, ['createdAt', 'requestId']), limit = positive(r.limit);
    if (limit > 100 || typeof c.createdAt !== 'number' || !Number.isSafeInteger(c.createdAt) || c.createdAt < 0 || typeof c.requestId !== 'string' || (c.createdAt === 0) !== (c.requestId === ''))
        invalid();
    return { binding: parseNativeToolBindingV3(r.binding), cursor: { createdAt: c.createdAt, requestId: c.requestId === '' ? '' : text(c.requestId) }, limit };
}
export function parseNativeToolAuthorityV3(value) {
    const r = record(value, ['schemaVersion', 'toolId', 'protocol', 'state', 'permissionState', 'accountOwner', 'deviceId', 'fundingSource', 'userApi', 'sourceGrant', 'bindingRevision', 'authorityHandle', 'credentialRevision', 'receiptRevision', 'catalogRevision', 'policyRevision', 'lastVerifiedAt']);
    if (r.schemaVersion !== 3)
        invalid();
    const u = userApi(r), toolId = tool(r.toolId), wire = protocol(r.protocol), state = r.state, permissionState = r.permissionState;
    if (state !== 'pending' && !TOOL_CONNECTION_STATES.includes(state) || !TOOL_CONNECTION_PERMISSION_STATES.includes(permissionState))
        invalid();
    const sourceGrant = r.sourceGrant === null ? null : parseNativeSourceGrantV1(r.sourceGrant);
    if (sourceGrant !== null)
        grantScopeMatches(sourceGrant, r, u);
    const bindingRevision = nullableRevision(r.bindingRevision), authorityHandle = r.authorityHandle === null ? null : uuid(r.authorityHandle), credentialRevision = r.credentialRevision === null ? null : positive(r.credentialRevision), receiptRevision = r.receiptRevision === null ? null : positive(r.receiptRevision), policyRevision = nullableRevision(r.policyRevision);
    const parts = [sourceGrant, bindingRevision, authorityHandle, credentialRevision, receiptRevision, policyRevision], active = parts.every(p => p !== null), absent = parts.every(p => p === null), cleanup = state === 'conflict' || state === 'revocation_pending';
    if (!active && !absent || state === 'connected' && (!active || permissionState === 'unavailable') || state === 'pending' && (!active || permissionState !== 'unavailable') || (state === 'available' || state === 'unavailable') && !absent || cleanup && permissionState === 'eligible' || state === 'unavailable' && permissionState !== 'unavailable' || state === 'available' && permissionState === 'membership_reconnect_required')
        invalid();
    if (state === 'connected' || state === 'pending' || state === 'available' && permissionState === 'eligible')
        configurable(toolId, wire);
    return { schemaVersion: 3, toolId, protocol: wire, state, permissionState, accountOwner: uuid(r.accountOwner), deviceId: uuid(r.deviceId), fundingSource: 'user_api', userApi: u, sourceGrant, bindingRevision, authorityHandle, credentialRevision, receiptRevision, catalogRevision: text(r.catalogRevision), policyRevision, lastVerifiedAt: r.lastVerifiedAt === null ? null : instant(r.lastVerifiedAt) };
}
function cursor(value) { const r = record(value, ['createdAt', 'requestId']); return { createdAt: positive(r.createdAt), requestId: text(r.requestId) }; }
export function parseNativeToolUsagePageV3(value) {
    const r = record(value, ['schemaVersion', 'accountOwner', 'deviceId', 'toolId', 'protocol', 'fundingSource', 'billingMode', 'binding', 'records', 'nextCursor']);
    if (r.schemaVersion !== 3)
        invalid();
    const binding = parseNativeToolBindingV3(r.binding), toolId = tool(r.toolId), wire = protocol(r.protocol);
    if (r.fundingSource !== 'user_api' || r.billingMode !== 'external_provider' || binding.toolId !== toolId || binding.protocol !== wire || !Array.isArray(r.records) || r.records.length > 100)
        invalid();
    const facts = parseNativeUserAPIUsageFactsV3({ records: r.records, nextCursor: r.nextCursor }, wire, binding.grantRevision);
    return { schemaVersion: 3, accountOwner: uuid(r.accountOwner), deviceId: uuid(r.deviceId), toolId, protocol: wire, fundingSource: 'user_api', billingMode: 'external_provider', binding, ...facts };
}
/** Syntax and terminal-count checks only; callers supply a separately verified
 * grant. A private gateway usage page need not invent a public receipt. */
export function parseNativeUserAPIUsageFactsV3(value, wire, grantRevision) {
    protocol(wire);
    hash(grantRevision);
    const r = record(value, ['records', 'nextCursor']);
    if (!Array.isArray(r.records) || r.records.length > 100)
        invalid();
    const records = r.records.map(value => {
        const fact = record(value, ['requestId', 'providerResponseId', 'providerId', 'modelId', 'returnedModel', 'outcome', 'createdAt', ...COUNTS, 'grantRevision', 'membershipRevision', 'capabilityRevision', 'adapterRevision', 'priceAuthorityRevision']);
        const counts = Object.fromEntries(COUNTS.map(k => { const n = fact[k]; if (n !== null && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0))
            invalid(); return [k, n]; }));
        const { inputTokens, outputTokens, inputTotalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, cacheWrite5mTokens, cacheWrite1hTokens } = counts;
        if ((inputTokens === null) !== (outputTokens === null) || inputTokens === null && COUNTS.some(k => counts[k] !== null) || inputTokens !== null && (fact.returnedModel !== fact.modelId || reasoningTokens !== null && reasoningTokens > outputTokens || wire !== 'anthropic_messages' && (inputTotalTokens !== null && inputTotalTokens !== inputTokens || cacheReadTokens !== null && cacheReadTokens > inputTokens) || wire === 'anthropic_messages' && inputTotalTokens !== null && (cacheReadTokens === null || cacheWriteTokens === null || inputTotalTokens !== inputTokens + cacheReadTokens + cacheWriteTokens) || cacheWrite5mTokens !== null && cacheWrite1hTokens !== null && cacheWriteTokens !== null && cacheWrite5mTokens + cacheWrite1hTokens !== cacheWriteTokens))
            invalid();
        if (!['completed', 'incomplete', 'refused', 'failed', 'contract_invalid', 'unknown'].includes(fact.outcome) || hash(fact.grantRevision) !== grantRevision)
            invalid();
        return { requestId: text(fact.requestId), providerResponseId: fact.providerResponseId === '' ? '' : text(fact.providerResponseId), providerId: provider(fact.providerId), modelId: id(fact.modelId), returnedModel: fact.returnedModel === '' ? '' : id(fact.returnedModel), outcome: fact.outcome, createdAt: positive(fact.createdAt), ...counts, grantRevision: hash(fact.grantRevision), membershipRevision: text(fact.membershipRevision), capabilityRevision: text(fact.capabilityRevision), adapterRevision: text(fact.adapterRevision), priceAuthorityRevision: nullableRevision(fact.priceAuthorityRevision) };
    });
    const seen = new Set();
    for (let i = 0; i < records.length; i++) {
        const c = records[i];
        if (seen.has(c.requestId) || i > 0 && (c.createdAt > records[i - 1].createdAt || c.createdAt === records[i - 1].createdAt && c.requestId >= records[i - 1].requestId))
            invalid();
        seen.add(c.requestId);
    }
    const nextCursor = r.nextCursor === null ? null : cursor(r.nextCursor), last = records.at(-1);
    if (nextCursor !== null && (last === undefined || nextCursor.createdAt !== last.createdAt || nextCursor.requestId !== last.requestId))
        invalid();
    return { records, nextCursor };
}
//# sourceMappingURL=native-source-grants-v3.js.map