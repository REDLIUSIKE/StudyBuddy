import { parseNativeToolMaterialRequestV2 } from './native-tool-connection-v2.js';
const PROTOCOLS = ['openai_chat_completions', 'anthropic_messages', 'openai_responses'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
function invalid() { throw new TypeError('NATIVE_USER_MODEL_CONTRACT_INVALID'); }
function record(value, keys) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value')))
        invalid();
    return value;
}
function text(value, max = 128) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value || /\p{Cc}/u.test(value))
        invalid();
    return value;
}
function identifier(value) { const result = text(value); if (!IDENTIFIER.test(result))
    invalid(); return result; }
function nullable(value, parse) { return value === null ? null : parse(value); }
function uuid(value) { const result = text(value); if (!UUID.test(result))
    invalid(); return result; }
function instant(value) {
    const result = text(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result)
        || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result)
        invalid();
    return result;
}
function version(row) { if (row.schemaVersion !== 1)
    invalid(); }
function protocol(value) { if (!PROTOCOLS.includes(value))
    invalid(); return value; }
function protocols(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 3)
        invalid();
    const result = value.map(protocol);
    if (new Set(result).size !== result.length)
        invalid();
    return result;
}
function endpoint(value) {
    const result = text(value, 512);
    let parsed;
    try {
        const Constructor = globalThis.URL;
        parsed = new Constructor(result);
    }
    catch {
        return invalid();
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash)
        invalid();
    return result;
}
function provider(value) { if (value !== 'deepseek' && value !== 'kimi')
    invalid(); return value; }
function registeredSource(source, base, anthropic, wire) {
    const origin = source === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.moonshot.cn';
    if (![origin, `${origin}/v1`].includes(base) || anthropic !== null && anthropic !== `${origin}/anthropic`
        || wire.includes('anthropic_messages') && anthropic === null)
        invalid();
}
export function parseNativeUserModelDraftV1(value) {
    const row = record(value, ['schemaVersion', 'internalId', 'expectedLocalRevision', 'name', 'baseUrl', 'anthropicUrl', 'apiKey', 'modelId', 'protocols']);
    version(row);
    const internalId = nullable(row.internalId, identifier), expectedLocalRevision = nullable(row.expectedLocalRevision, text);
    if ((internalId === null) !== (expectedLocalRevision === null))
        invalid();
    const wire = protocols(row.protocols), anthropicUrl = nullable(row.anthropicUrl, endpoint);
    if (wire.includes('anthropic_messages') && anthropicUrl === null)
        invalid();
    return { schemaVersion: 1, internalId, expectedLocalRevision, name: text(row.name, 256), baseUrl: endpoint(row.baseUrl), anthropicUrl,
        apiKey: text(row.apiKey, 8192), modelId: identifier(row.modelId), protocols: wire };
}
function probe(value) {
    const row = record(value, ['protocol', 'success', 'latencyMs', 'returnedModel', 'response', 'errorCode']);
    if (typeof row.success !== 'boolean' || typeof row.latencyMs !== 'number' || !Number.isSafeInteger(row.latencyMs) || row.latencyMs < 0)
        invalid();
    const returnedModel = nullable(row.returnedModel, identifier), response = nullable(row.response, v => {
        if (typeof v !== 'string' || v.trim().length === 0 || v.length > 1024 * 1024)
            invalid();
        return v;
    }), errorCode = nullable(row.errorCode, identifier);
    if (row.success ? (returnedModel === null || response === null || errorCode !== null) : (returnedModel !== null || response !== null || errorCode === null))
        invalid();
    return { protocol: protocol(row.protocol), success: row.success, latencyMs: row.latencyMs, returnedModel, response, errorCode };
}
export function parseNativeUserModelProbeResultV1(value) {
    const row = record(value, ['schemaVersion', 'probes', 'verificationId', 'verifiedAt', 'expiresAt']);
    version(row);
    if (!Array.isArray(row.probes) || row.probes.length < 1 || row.probes.length > 3)
        invalid();
    const probes = row.probes.map(probe);
    if (new Set(probes.map(p => p.protocol)).size !== probes.length)
        invalid();
    const verificationId = nullable(row.verificationId, uuid), verifiedAt = nullable(row.verifiedAt, instant), expiresAt = nullable(row.expiresAt, instant);
    if (verificationId === null ? (verifiedAt !== null || expiresAt !== null) :
        (verifiedAt === null || expiresAt === null || probes.some(p => !p.success) || Date.parse(expiresAt) <= Date.parse(verifiedAt)
            || Date.parse(expiresAt) - Date.parse(verifiedAt) > 600000))
        invalid();
    return { schemaVersion: 1, probes, verificationId, verifiedAt, expiresAt };
}
export function parseNativeUserModelSaveRequestV1(value) {
    const row = record(value, ['schemaVersion', 'operationId', 'draft', 'verificationId']);
    version(row);
    return { schemaVersion: 1, operationId: uuid(row.operationId), draft: parseNativeUserModelDraftV1(row.draft), verificationId: uuid(row.verificationId) };
}
export function parseNativeUserModelRegistrationV1(value) {
    const row = record(value, ['schemaVersion', 'operationId', 'credentialId', 'credentialRevision', 'localRef', 'state', 'providerId', 'modelId', 'protocols', 'catalogRevision', 'membershipRevision', 'verifiedAt']);
    version(row);
    if (row.state !== 'prepared' && row.state !== 'active' && row.state !== 'expired')
        invalid();
    return { schemaVersion: 1, operationId: uuid(row.operationId), credentialId: uuid(row.credentialId), credentialRevision: text(row.credentialRevision), localRef: identifier(row.localRef), state: row.state,
        providerId: provider(row.providerId), modelId: identifier(row.modelId), protocols: protocols(row.protocols), catalogRevision: text(row.catalogRevision), membershipRevision: text(row.membershipRevision), verifiedAt: instant(row.verifiedAt) };
}
export function parseNativeUserModelSaveResultV1(value) {
    const row = record(value, ['state', 'localRef', 'registration']);
    if (row.state !== 'saved' && row.state !== 'pending')
        invalid();
    const localRef = identifier(row.localRef), registration = parseNativeUserModelRegistrationV1(row.registration);
    if (localRef !== registration.localRef || row.state === 'saved' && registration.state !== 'active' || row.state === 'pending' && registration.state === 'active')
        invalid();
    return { state: row.state, localRef, registration };
}
export function parseNativeUserCredentialPrepareV1(value) {
    const row = record(value, ['schemaVersion', 'operationId', 'localRef', 'expectedCredentialRevision', 'providerId', 'baseUrl', 'anthropicUrl', 'apiKey', 'modelId', 'protocols', 'catalogRevision', 'membershipRevision', 'clientVerifiedAt']);
    version(row);
    const providerId = provider(row.providerId), baseUrl = endpoint(row.baseUrl), anthropicUrl = nullable(row.anthropicUrl, endpoint), wire = protocols(row.protocols);
    registeredSource(providerId, baseUrl, anthropicUrl, wire);
    return { schemaVersion: 1, operationId: uuid(row.operationId), localRef: identifier(row.localRef), expectedCredentialRevision: nullable(row.expectedCredentialRevision, text), providerId, baseUrl, anthropicUrl,
        apiKey: text(row.apiKey, 8192), modelId: identifier(row.modelId), protocols: wire, catalogRevision: text(row.catalogRevision), membershipRevision: text(row.membershipRevision), clientVerifiedAt: instant(row.clientVerifiedAt) };
}
export function parseNativeUserCredentialRefV1(value) {
    const row = record(value, ['schemaVersion', 'operationId', 'credentialId', 'credentialRevision', 'localRef']);
    version(row);
    return { schemaVersion: 1, operationId: uuid(row.operationId), credentialId: uuid(row.credentialId), credentialRevision: text(row.credentialRevision), localRef: identifier(row.localRef) };
}
export function parseNativeRegisteredUserAPIMaterialRequestV2(value) {
    const row = record(value, ['audience', 'toolId', 'selectedModelId', 'selectedProtocol', 'catalogRevision', 'materialNonce', 'receiptRevision', 'registration']);
    const ref = record(row.registration, ['credentialId', 'credentialRevision', 'localRef']);
    const { registration: _registration, ...base } = row;
    return { ...parseNativeToolMaterialRequestV2(base), registration: { credentialId: uuid(ref.credentialId), credentialRevision: text(ref.credentialRevision), localRef: identifier(ref.localRef) } };
}
//# sourceMappingURL=native-user-models.js.map