import { getNativeToolDefinition, NATIVE_TOOLS } from './native-tools.js';
import { TOOL_CONNECTION_MAX_AUTHORIZED_MODELS, TOOL_CONNECTION_PERMISSION_STATES, TOOL_CONNECTION_STATES } from './tool-connection.js';
const PROTOCOLS = ['openai_responses', 'openai_chat_completions', 'anthropic_messages'];
const CAPABILITIES = ['thinking', 'always_thinking', 'image_in', 'video_in', 'audio_in', 'tool_use', 'dynamically_loaded_tools'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MODEL_KEYS = ['logicalModelId', 'providerId', 'exactModelId', 'displayName', 'toolId', 'protocol', 'contextWindow',
    'maxOutputTokens', 'capabilityFlags', 'evidenceSha256', 'membershipRevision', 'availability'];
function invalid(error) { throw new TypeError(error); }
function record(value, keys, error) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid(error);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some(key => {
        if (typeof key !== 'string' || !keys.includes(key))
            return true;
        const descriptor = descriptors[key];
        return !descriptor || !Object.hasOwn(descriptor, 'value');
    }))
        invalid(error);
    return value;
}
function literal(value, max, error) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value || /\p{Cc}/u.test(value))
        invalid(error);
    return value;
}
function revision(value, error) { return literal(value, 128, error); }
function modelId(value, error) {
    if (typeof value !== 'string' || !MODEL.test(value))
        invalid(error);
    return value;
}
function positive(value, error) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
        invalid(error);
    return value;
}
function uuid(value, error, v4 = false) {
    if (typeof value !== 'string' || !(v4 ? UUID_V4 : UUID).test(value))
        invalid(error);
    return value;
}
function instant(value, error) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
        invalid(error);
    return value;
}
function tool(value, error) {
    try {
        return getNativeToolDefinition(value);
    }
    catch {
        return invalid(error);
    }
}
function protocol(value, error) {
    if (!PROTOCOLS.includes(value))
        invalid(error);
    return value;
}
function configurable(definition, value, error) {
    if (definition.noModelConfig || definition.configurationRestriction !== null
        || definition.configurationEvidence !== 'verified' || !definition.protocols.includes(value))
        invalid(error);
}
function source(value, error) {
    if (value !== 'deepseek' && value !== 'kimi')
        invalid(error);
    return value;
}
function catalogSource(value, toolId, wire, error) {
    if (value === 'deepseek' || value === 'kimi')
        return value;
    if (wire === 'openai_chat_completions' && ['dsh', 'hermes', 'kimicode', 'openclaw', 'workbuddy'].includes(toolId)
        && (value === 'hunyuan' || value === 'zhipu' || value === 'minimax' || value === 'mimo' || value === 'volcengine'))
        return value;
    if (wire === 'openai_responses' && ['chatgptdesktop', 'codex', 'kimicode'].includes(toolId) && value === 'hunyuan')
        return value;
    if (wire === 'anthropic_messages' && ['claude_code', 'dsh', 'kimicode', 'openclaw'].includes(toolId)
        && (value === 'hunyuan' || value === 'minimax' || value === 'mimo'))
        return value;
    return invalid(error);
}
function sourceKeys(value, keys) {
    return value !== null && typeof value === 'object' && Object.hasOwn(value, 'userApi') ? [...keys, 'userApi'] : keys;
}
function userApiBinding(row, error) {
    if (row.fundingSource === 'platform') {
        if (Object.hasOwn(row, 'userApi'))
            invalid(error);
        return undefined;
    }
    if (row.fundingSource !== 'user_api')
        invalid(error);
    const binding = record(row.userApi, ['connectionId', 'credentialReference', 'credentialRevision'], error);
    return { connectionId: uuid(binding.connectionId, error, true), credentialReference: revision(binding.credentialReference, error), credentialRevision: revision(binding.credentialRevision, error) };
}
function origin(value, error) {
    const text = literal(value, 512, error);
    let parsed;
    try {
        const URLConstructor = globalThis.URL;
        parsed = new URLConstructor(text);
    }
    catch {
        return invalid(error);
    }
    const host = parsed.hostname;
    // Platform gateway origins are canonical public DNS HTTPS origins. This does
    // not affect explicit local/private endpoints for separate BYOK bindings.
    if (parsed.protocol !== 'https:' || parsed.origin !== text || parsed.pathname !== '/' || parsed.search || parsed.hash
        || parsed.username || parsed.password || !host.includes('.') || host.includes(':') || host.startsWith('[')
        || /^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|internal)$/.test(host))
        invalid(error);
    return text;
}
function model(value, error, frozenForCleanup = false) {
    const row = record(value, MODEL_KEYS, error);
    const definition = tool(row.toolId, error);
    const wire = protocol(row.protocol, error);
    if (!frozenForCleanup)
        configurable(definition, wire, error);
    const contextWindow = positive(row.contextWindow, error);
    const maxOutputTokens = row.maxOutputTokens === null ? null : positive(row.maxOutputTokens, error);
    if (maxOutputTokens !== null && maxOutputTokens > contextWindow)
        invalid(error);
    if (!Array.isArray(row.capabilityFlags) || row.capabilityFlags.some(flag => !CAPABILITIES.includes(flag))
        || new Set(row.capabilityFlags).size !== row.capabilityFlags.length
        || typeof row.evidenceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.evidenceSha256)
        || (row.availability !== 'available' && row.availability !== 'unavailable'))
        invalid(error);
    return { logicalModelId: modelId(row.logicalModelId, error), providerId: catalogSource(row.providerId, definition.id, wire, error),
        exactModelId: modelId(row.exactModelId, error), displayName: literal(row.displayName, 256, error),
        toolId: definition.id, protocol: wire, contextWindow, maxOutputTokens, capabilityFlags: [...row.capabilityFlags],
        evidenceSha256: row.evidenceSha256, membershipRevision: revision(row.membershipRevision, error), availability: row.availability };
}
/** Syntax-only persisted fact snapshot for recovery/revocation. It does NOT
 * grant membership, configuration eligibility or new material authority. */
export function parseNativeToolFrozenModelV2(value) {
    return model(value, 'NATIVE_TOOL_FROZEN_MODEL_V2_INVALID', true);
}
function ids(value, error) {
    if (!Array.isArray(value) || value.length > TOOL_CONNECTION_MAX_AUTHORIZED_MODELS)
        invalid(error);
    const result = value.map(id => modelId(id, error));
    const sorted = [...result].sort();
    if (new Set(result).size !== result.length || result.some((id, i) => id !== sorted[i]))
        invalid(error);
    return result;
}
function membership(value, ordered, toolId, wire, membershipRevision, available, error) {
    if (!Array.isArray(value) || value.length !== ordered.length)
        invalid(error);
    const result = value.map(candidate => model(candidate, error));
    if (result.some((row, i) => row.exactModelId !== ordered[i] || row.toolId !== toolId || row.protocol !== wire
        || row.membershipRevision !== membershipRevision || (available && row.availability !== 'available'))
        || new Set(result.map(row => row.logicalModelId)).size !== result.length)
        invalid(error);
    return result;
}
function version(row, error) { if (row.schemaVersion !== 2)
    invalid(error); }
function equivalent(actual, expected, error) {
    if (Array.isArray(expected))
        return Array.isArray(actual) && actual.length === expected.length
            && actual.every((value, index) => equivalent(value, expected[index], error));
    if (expected !== null && typeof expected === 'object') {
        const keys = Object.keys(expected);
        const row = record(actual, keys, error);
        return keys.every(key => equivalent(row[key], expected[key], error));
    }
    return actual === expected;
}
export function parseNativeToolCatalogV2(value) {
    const error = 'NATIVE_TOOL_CATALOG_V2_INVALID';
    const row = record(value, ['schemaVersion', 'catalogRevision', 'tools', 'models'], error);
    version(row, error);
    if (!Array.isArray(row.tools) || row.tools.length !== NATIVE_TOOLS.length)
        invalid(error);
    const seenTools = new Set();
    for (const candidate of row.tools) {
        const actual = record(candidate, Object.keys(NATIVE_TOOLS[0]), error);
        const definition = tool(actual.id, error);
        if (seenTools.has(definition.id) || !equivalent(actual, definition, error))
            invalid(error);
        seenTools.add(definition.id);
    }
    if (!Array.isArray(row.models) || row.models.length > NATIVE_TOOLS.length * PROTOCOLS.length * TOOL_CONNECTION_MAX_AUTHORIZED_MODELS)
        invalid(error);
    const models = row.models.map(value => model(value, error));
    const seen = new Set();
    const groups = new Map();
    for (const model of models) {
        const key = JSON.stringify([model.toolId, model.protocol, model.exactModelId]);
        if (seen.has(key))
            invalid(error);
        seen.add(key);
        const groupKey = JSON.stringify([model.toolId, model.protocol]);
        const group = groups.get(groupKey) ?? { revision: model.membershipRevision, count: 0, logicalIds: new Set() };
        if (group.revision !== model.membershipRevision || group.logicalIds.has(model.logicalModelId)
            || ++group.count > TOOL_CONNECTION_MAX_AUTHORIZED_MODELS)
            invalid(error);
        group.logicalIds.add(model.logicalModelId);
        groups.set(groupKey, group);
    }
    return { schemaVersion: 2, catalogRevision: revision(row.catalogRevision, error), tools: NATIVE_TOOLS, models };
}
export function parseNativeToolMaterialRequestV2(value) {
    const error = 'NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID';
    const row = record(value, ['audience', 'toolId', 'selectedModelId',
        'selectedProtocol', 'catalogRevision', 'materialNonce', 'receiptRevision'], error);
    const definition = tool(row.toolId, error);
    const selectedProtocol = protocol(row.selectedProtocol, error);
    configurable(definition, selectedProtocol, error);
    if (row.audience !== 'studybuddy-native-tools-v2')
        invalid(error);
    return { audience: row.audience, toolId: definition.id, selectedModelId: modelId(row.selectedModelId, error), selectedProtocol,
        catalogRevision: revision(row.catalogRevision, error), materialNonce: uuid(row.materialNonce, error, true), receiptRevision: positive(row.receiptRevision, error) };
}
export function parseNativeToolUserAPIMaterialRequestV2(value) {
    const error = 'NATIVE_TOOL_USER_API_MATERIAL_REQUEST_V2_INVALID';
    try {
        const row = record(value, ['audience', 'toolId', 'selectedModelId', 'selectedProtocol', 'catalogRevision', 'materialNonce', 'receiptRevision', 'userApi'], error);
        const { userApi: raw, ...base } = row, request = parseNativeToolMaterialRequestV2(base);
        const input = record(raw, ['providerId', 'baseUrl', 'apiKey', 'credentialReference', 'credentialRevision'], error);
        const providerId = source(input.providerId, error), baseUrl = literal(input.baseUrl, 512, error);
        const origin = providerId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.moonshot.cn';
        const allowed = request.selectedProtocol === 'anthropic_messages' ? [origin + '/anthropic'] : [origin, origin + '/v1'];
        if (!allowed.includes(baseUrl))
            invalid(error);
        return { ...request, userApi: { providerId, baseUrl, apiKey: literal(input.apiKey, 8192, error),
                credentialReference: revision(input.credentialReference, error), credentialRevision: revision(input.credentialRevision, error) } };
    }
    catch {
        return invalid(error);
    }
}
export function parseNativeToolMaterialV2(value) {
    const error = 'NATIVE_TOOL_MATERIAL_V2_INVALID';
    const row = record(value, sourceKeys(value, ['schemaVersion', 'connectionId', 'accountOwner', 'deviceId',
        'toolId', 'fundingSource', 'selectedProviderId', 'gatewayOrigin', 'protocol', 'selectedModelId', 'authorizedModelIds',
        'authorizedModels', 'membershipRevision', 'apiKey', 'authorityHandle', 'pendingBindingRevision', 'credentialRevision',
        'receiptRevision', 'catalogRevision', 'policyRevision', 'pendingExpiresAt']), error);
    version(row, error);
    const userApi = userApiBinding(row, error);
    const definition = tool(row.toolId, error);
    const wire = protocol(row.protocol, error);
    configurable(definition, wire, error);
    const authorizedModelIds = ids(row.authorizedModelIds, error);
    const membershipRevision = revision(row.membershipRevision, error);
    if (authorizedModelIds.length === 0 || userApi !== undefined && authorizedModelIds.length !== 1)
        invalid(error);
    const authorizedModels = membership(row.authorizedModels, authorizedModelIds, definition.id, wire, membershipRevision, true, error);
    const selectedModelId = modelId(row.selectedModelId, error);
    const selectedProviderId = userApi === undefined ? catalogSource(row.selectedProviderId, definition.id, wire, error) : source(row.selectedProviderId, error);
    if (authorizedModels.find(m => m.exactModelId === selectedModelId)?.providerId !== selectedProviderId)
        invalid(error);
    const apiKey = literal(row.apiKey, 4096, error);
    if (/\s/u.test(apiKey))
        invalid(error);
    return { schemaVersion: 2, connectionId: uuid(row.connectionId, error, true), accountOwner: uuid(row.accountOwner, error),
        deviceId: uuid(row.deviceId, error), toolId: definition.id, fundingSource: userApi === undefined ? 'platform' : 'user_api', ...(userApi === undefined ? {} : { userApi }), selectedProviderId, gatewayOrigin: origin(row.gatewayOrigin, error),
        protocol: wire, selectedModelId, authorizedModelIds, authorizedModels, membershipRevision, apiKey, authorityHandle: uuid(row.authorityHandle, error),
        pendingBindingRevision: revision(row.pendingBindingRevision, error), credentialRevision: positive(row.credentialRevision, error),
        receiptRevision: positive(row.receiptRevision, error), catalogRevision: revision(row.catalogRevision, error),
        policyRevision: revision(row.policyRevision, error), pendingExpiresAt: instant(row.pendingExpiresAt, error) };
}
export function parseNativeToolAuthorityV2(value) {
    const error = 'NATIVE_TOOL_AUTHORITY_V2_INVALID';
    const row = record(value, sourceKeys(value, ['schemaVersion', 'toolId', 'protocol', 'state', 'permissionState',
        'accountOwner', 'deviceId', 'fundingSource', 'authorizedModelIds', 'authorizedModels', 'membershipRevision', 'bindingRevision', 'authorityHandle',
        'credentialRevision', 'receiptRevision', 'catalogRevision', 'policyRevision', 'lastVerifiedAt']), error);
    version(row, error);
    const userApi = userApiBinding(row, error);
    const definition = tool(row.toolId, error);
    const wire = protocol(row.protocol, error);
    const state = row.state;
    const permissionState = row.permissionState;
    if ((state !== 'pending' && !TOOL_CONNECTION_STATES.includes(state)) || !TOOL_CONNECTION_PERMISSION_STATES.includes(permissionState))
        invalid(error);
    const authorizedModelIds = ids(row.authorizedModelIds, error);
    if (userApi !== undefined && authorizedModelIds.length > 1)
        invalid(error);
    const bindingRevision = row.bindingRevision === null ? null : revision(row.bindingRevision, error);
    const authorityHandle = row.authorityHandle === null ? null : uuid(row.authorityHandle, error);
    const credentialRevision = row.credentialRevision === null ? null : positive(row.credentialRevision, error);
    const receiptRevision = row.receiptRevision === null ? null : positive(row.receiptRevision, error);
    const policyRevision = row.policyRevision === null ? null : revision(row.policyRevision, error);
    const membershipRevision = row.membershipRevision === null ? null : revision(row.membershipRevision, error);
    const parts = [bindingRevision, authorityHandle, credentialRevision, receiptRevision, policyRevision, membershipRevision];
    const active = parts.every(part => part !== null) && authorizedModelIds.length > 0;
    const absent = parts.every(part => part === null) && authorizedModelIds.length === 0;
    const cleanup = state === 'conflict' || state === 'revocation_pending';
    if ((!active && !absent) || (state === 'connected' && (!active || permissionState === 'unavailable'))
        || (state === 'pending' && (!active || permissionState !== 'unavailable'))
        || ((state === 'available' || state === 'unavailable') && !absent) || (cleanup && permissionState === 'eligible')
        || (state === 'unavailable' && permissionState !== 'unavailable')
        || (state === 'available' && permissionState === 'membership_reconnect_required'))
        invalid(error);
    if (state === 'connected' || state === 'pending' || (state === 'available' && permissionState === 'eligible'))
        configurable(definition, wire, error);
    let authorizedModels;
    if (row.authorizedModels === null) {
        if (!cleanup || permissionState !== 'unavailable' || !active)
            invalid(error);
        authorizedModels = null;
    }
    else if (absent) {
        if (!Array.isArray(row.authorizedModels) || row.authorizedModels.length !== 0)
            invalid(error);
        authorizedModels = [];
    }
    else {
        authorizedModels = membership(row.authorizedModels, authorizedModelIds, definition.id, wire, membershipRevision, state === 'connected' || state === 'pending', error);
    }
    return { schemaVersion: 2, toolId: definition.id, protocol: wire, state, permissionState, accountOwner: uuid(row.accountOwner, error),
        deviceId: uuid(row.deviceId, error), fundingSource: userApi === undefined ? 'platform' : 'user_api', ...(userApi === undefined ? {} : { userApi }), authorizedModelIds, authorizedModels, membershipRevision, bindingRevision,
        authorityHandle, credentialRevision, receiptRevision, catalogRevision: revision(row.catalogRevision, error), policyRevision,
        lastVerifiedAt: row.lastVerifiedAt === null ? null : instant(row.lastVerifiedAt, error) };
}
export function parseNativeToolBindingRequestV2(value) {
    const error = 'NATIVE_TOOL_BINDING_REQUEST_V2_INVALID';
    const row = record(value, ['schemaVersion', 'toolId', 'protocol', 'connectionId',
        'authorityHandle', 'bindingRevision', 'credentialRevision', 'receiptRevision', 'catalogRevision', 'policyRevision', 'membershipRevision'], error);
    version(row, error);
    // Cancellation/revocation remains decodable after contract retirement or
    // user deferment. Activate separately rechecks current eligibility.
    return { schemaVersion: 2, toolId: tool(row.toolId, error).id, protocol: protocol(row.protocol, error), connectionId: uuid(row.connectionId, error, true),
        authorityHandle: uuid(row.authorityHandle, error), bindingRevision: revision(row.bindingRevision, error),
        credentialRevision: positive(row.credentialRevision, error), receiptRevision: positive(row.receiptRevision, error),
        catalogRevision: revision(row.catalogRevision, error), policyRevision: revision(row.policyRevision, error), membershipRevision: revision(row.membershipRevision, error) };
}
/** Rebind before recording connection success; never grant authority from a
 * local receipt alone. The gateway must independently enforce this policy.
 */
export function parseNativeToolUsageRequestV2(value) {
    const error = 'NATIVE_TOOL_USAGE_REQUEST_V2_INVALID';
    try {
        const row = record(value, ['binding', 'cursor', 'limit'], error), limit = positive(row.limit, error);
        if (limit > 100)
            invalid(error);
        return { binding: parseNativeToolBindingRequestV2(row.binding), cursor: usageCursor(row.cursor, error, true), limit };
    }
    catch {
        return invalid(error);
    }
}
function usageCursor(value, error, initial) {
    const row = record(value, ['createdAt', 'requestId'], error);
    if (initial && row.createdAt === 0 && row.requestId === '')
        return { createdAt: 0, requestId: '' };
    return { createdAt: positive(row.createdAt, error), requestId: revision(row.requestId, error) };
}
const USAGE_COUNTS = ['inputTokens', 'outputTokens', 'inputTotalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens'];
export function parseNativeToolUsagePageV2(value) {
    const error = 'NATIVE_TOOL_USAGE_PAGE_V2_INVALID';
    try {
        const row = record(value, ['schemaVersion', 'accountOwner', 'deviceId', 'toolId', 'protocol', 'fundingSource', 'billingMode', 'binding', 'records', 'nextCursor'], error);
        version(row, error);
        const binding = parseNativeToolBindingRequestV2(row.binding), definition = tool(row.toolId, error), wire = protocol(row.protocol, error);
        if (row.fundingSource !== 'user_api' || row.billingMode !== 'external_provider' || binding.toolId !== definition.id || binding.protocol !== wire || !Array.isArray(row.records) || row.records.length > 100)
            invalid(error);
        const records = row.records.map(value => {
            const fact = record(value, ['requestId', 'providerResponseId', 'providerId', 'modelId', 'returnedModel', 'outcome', 'createdAt', ...USAGE_COUNTS], error);
            const counts = Object.fromEntries(USAGE_COUNTS.map(key => {
                const count = fact[key];
                if (count !== null && (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0))
                    invalid(error);
                return [key, count];
            }));
            const { inputTokens, outputTokens, inputTotalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, cacheWrite5mTokens, cacheWrite1hTokens } = counts;
            if ((inputTokens === null) !== (outputTokens === null) || inputTokens === null && USAGE_COUNTS.some(key => counts[key] !== null) ||
                inputTokens !== null && (fact.returnedModel !== fact.modelId || reasoningTokens !== null && reasoningTokens > outputTokens ||
                    wire !== 'anthropic_messages' && (inputTotalTokens !== null && inputTotalTokens !== inputTokens || cacheReadTokens !== null && cacheReadTokens > inputTokens) ||
                    wire === 'anthropic_messages' && inputTotalTokens !== null && (cacheReadTokens === null || cacheWriteTokens === null || inputTotalTokens !== inputTokens + cacheReadTokens + cacheWriteTokens) ||
                    cacheWrite5mTokens !== null && cacheWrite1hTokens !== null && cacheWriteTokens !== null && cacheWrite5mTokens + cacheWrite1hTokens !== cacheWriteTokens))
                invalid(error);
            if (!['completed', 'incomplete', 'refused', 'failed', 'contract_invalid', 'unknown'].includes(fact.outcome))
                invalid(error);
            return { requestId: revision(fact.requestId, error), providerResponseId: fact.providerResponseId === '' ? '' : revision(fact.providerResponseId, error),
                providerId: source(fact.providerId, error), modelId: modelId(fact.modelId, error), returnedModel: fact.returnedModel === '' ? '' : modelId(fact.returnedModel, error),
                outcome: fact.outcome, createdAt: positive(fact.createdAt, error), ...counts };
        });
        const seen = new Set();
        for (let i = 0; i < records.length; i++) {
            const current = records[i];
            if (seen.has(current.requestId) || i > 0 && (current.createdAt > records[i - 1].createdAt || current.createdAt === records[i - 1].createdAt && current.requestId >= records[i - 1].requestId))
                invalid(error);
            seen.add(current.requestId);
        }
        const nextCursor = row.nextCursor === null ? null : usageCursor(row.nextCursor, error, false), last = records.at(-1);
        if (nextCursor !== null && (last === undefined || nextCursor.createdAt !== last.createdAt || nextCursor.requestId !== last.requestId))
            invalid(error);
        return { schemaVersion: 2, accountOwner: uuid(row.accountOwner, error), deviceId: uuid(row.deviceId, error), toolId: definition.id, protocol: wire, fundingSource: 'user_api', billingMode: 'external_provider', binding, records, nextCursor };
    }
    catch {
        return invalid(error);
    }
}
export function bindNativeToolAuthorityV2(materialValue, authorityValue, owner, device, now) {
    const error = 'NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID';
    try {
        const material = parseNativeToolMaterialV2(materialValue);
        const authority = parseNativeToolAuthorityV2(authorityValue);
        uuid(owner, error);
        uuid(device, error);
        const checkedAt = instant(now, error);
        if (material.accountOwner !== owner || material.deviceId !== device || authority.accountOwner !== owner || authority.deviceId !== device
            || authority.state !== 'connected' || authority.permissionState !== 'eligible' || authority.lastVerifiedAt === null
            || authority.toolId !== material.toolId || authority.protocol !== material.protocol
            || authority.fundingSource !== material.fundingSource
            || !equivalent(authority.userApi, material.userApi, error)
            || authority.bindingRevision !== material.pendingBindingRevision || authority.authorityHandle !== material.authorityHandle
            || authority.credentialRevision !== material.credentialRevision || authority.receiptRevision !== material.receiptRevision
            || authority.catalogRevision !== material.catalogRevision || authority.policyRevision !== material.policyRevision
            || authority.membershipRevision !== material.membershipRevision
            || !equivalent(authority.authorizedModelIds, material.authorizedModelIds, error)
            || !equivalent(authority.authorizedModels, material.authorizedModels, error)
            || Date.parse(material.pendingExpiresAt) <= Date.parse(checkedAt))
            invalid(error);
    }
    catch {
        return invalid(error);
    }
}
//# sourceMappingURL=native-tool-connection-v2.js.map