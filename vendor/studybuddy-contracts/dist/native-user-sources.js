import { parseNativeUserCredentialPrepareV1, parseNativeUserCredentialRefV1, parseNativeUserModelRegistrationV1 } from './native-user-models.js';
import { parseNativeToolMaterialRequestV2 } from './native-tool-connection-v2.js';
function members(value) {
    const result = array(value, 256).map(v => { const m = record(v, ['exactModelId', 'protocol', 'membershipRevision']); return { exactModelId: exact(m.exactModelId), protocol: protocol(m.protocol), membershipRevision: identifier(m.membershipRevision) }; });
    if (new Set(result.map(m => JSON.stringify([m.exactModelId, m.protocol]))).size !== result.length)
        invalid();
    return result;
}
export function parseNativeUserCredentialPrepareV2(value) {
    const r = record(value, ['schemaVersion', 'operationId', 'localRef', 'expectedCredentialRevision', 'expectedOperationId', 'sourceRevision', 'inventoryRevision', 'providerId', 'baseUrl', 'anthropicUrl', 'apiKey', 'catalogRevision', 'clientVerifiedAt', 'memberships']);
    version(r);
    if (r.providerId !== 'deepseek' && r.providerId !== 'kimi')
        invalid();
    const membership = members(r.memberships), baseUrl = endpoint(r.baseUrl), anthropicUrl = nullable(r.anthropicUrl, endpoint), origin = r.providerId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.moonshot.cn';
    if (![origin, `${origin}/v1`].includes(baseUrl) || anthropicUrl !== null && anthropicUrl !== `${origin}/anthropic` || membership.some(m => m.protocol === 'anthropic_messages') && anthropicUrl === null)
        invalid();
    const expectedCredentialRevision = nullable(r.expectedCredentialRevision, identifier), expectedOperationId = nullable(r.expectedOperationId, uuid);
    if ((expectedCredentialRevision === null) !== (expectedOperationId === null))
        invalid();
    return { schemaVersion: 2, operationId: uuid(r.operationId), localRef: identifier(r.localRef), expectedCredentialRevision, expectedOperationId, sourceRevision: digest(r.sourceRevision), inventoryRevision: digest(r.inventoryRevision), providerId: r.providerId, baseUrl, anthropicUrl, apiKey: text(r.apiKey, 8192), catalogRevision: identifier(r.catalogRevision), clientVerifiedAt: instant(r.clientVerifiedAt), memberships: membership };
}
export function parseNativeRegisteredSourceRefV2(value) {
    const r = record(value, ['operationId', 'credentialId', 'credentialRevision', 'localRef', 'sourceRevision']);
    return { operationId: uuid(r.operationId), credentialId: uuid(r.credentialId), credentialRevision: identifier(r.credentialRevision), localRef: identifier(r.localRef), sourceRevision: digest(r.sourceRevision) };
}
export function parseNativeUserCredentialRefV2(value) {
    const r = record(value, ['schemaVersion', 'operationId', 'credentialId', 'credentialRevision', 'localRef', 'sourceRevision']);
    version(r);
    const { schemaVersion: _, ...ref } = r;
    return { schemaVersion: 2, ...parseNativeRegisteredSourceRefV2(ref) };
}
export function parseNativeRegisteredSourceMaterialRequestV2(value) {
    const r = record(value, ['audience', 'toolId', 'selectedModelId', 'selectedProtocol', 'catalogRevision', 'materialNonce', 'receiptRevision', 'registration']);
    const { registration, ...request } = r;
    return { ...parseNativeToolMaterialRequestV2(request), registration: parseNativeRegisteredSourceRefV2(registration) };
}
function wireVersion(value) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const d = Object.getOwnPropertyDescriptor(value, 'schemaVersion');
    if (!d || !Object.hasOwn(d, 'value') || (d.value !== 1 && d.value !== 2))
        invalid();
    return d.value;
}
export function parseNativeUserCredentialPrepare(value) { return wireVersion(value) === 1 ? parseNativeUserCredentialPrepareV1(value) : parseNativeUserCredentialPrepareV2(value); }
export function parseNativeUserCredentialRef(value) { return wireVersion(value) === 1 ? parseNativeUserCredentialRefV1(value) : parseNativeUserCredentialRefV2(value); }
export function parseNativeUserCredentialRegistration(value) { return wireVersion(value) === 1 ? parseNativeUserModelRegistrationV1(value) : parseNativeUserSourceRegistrationV2(value); }
export function parseNativeUserSourceSaveRequestV2(value) {
    const r = record(value, ['schemaVersion', 'operationId', 'draft', 'verificationId']);
    version(r);
    return { schemaVersion: 2, operationId: uuid(r.operationId), draft: parseNativeUserSourceDraftV2(r.draft), verificationId: uuid(r.verificationId) };
}
function route(v) { if (v !== 'local_direct' && v !== 'domestic_registered')
    invalid(); return v; }
export function parseNativeUserSourceSaveResultV2(value) {
    const r = record(value, ['schemaVersion', 'state', 'route', 'localRef', 'sourceRevision', 'registration', 'pendingPhase']);
    version(r);
    if (r.state !== 'saved' && r.state !== 'pending')
        invalid();
    const result = { schemaVersion: 2, state: r.state, route: route(r.route), localRef: identifier(r.localRef), sourceRevision: digest(r.sourceRevision), registration: nullable(r.registration, parseNativeUserSourceRegistrationV2), pendingPhase: r.pendingPhase };
    if (r.pendingPhase !== null && !['local_publish', 'server_commit'].includes(r.pendingPhase) || (result.state === 'saved' ? (r.pendingPhase !== null) : (r.pendingPhase === null)))
        invalid();
    if (result.route === 'local_direct' && (result.registration !== null || result.pendingPhase === 'server_commit'))
        invalid();
    const reg = result.registration;
    if (reg !== null && (reg.localRef !== result.localRef || reg.sourceRevision !== result.sourceRevision || reg.state === 'expired'))
        invalid();
    if (result.route === 'domestic_registered' && (result.state === 'saved' && reg?.state !== 'active' || result.pendingPhase === 'server_commit' && reg === null))
        invalid();
    return result;
}
export function parseNativeUserSourceRegistrationV2(value) {
    const r = record(value, ['schemaVersion', 'operationId', 'credentialId', 'credentialRevision', 'localRef', 'sourceRevision', 'inventoryRevision', 'state', 'providerId', 'catalogRevision', 'memberships', 'verifiedAt']);
    version(r);
    if (!['prepared', 'active', 'expired'].includes(r.state) || !['deepseek', 'kimi'].includes(r.providerId))
        invalid();
    return { schemaVersion: 2, operationId: uuid(r.operationId), credentialId: uuid(r.credentialId), credentialRevision: identifier(r.credentialRevision), localRef: identifier(r.localRef), sourceRevision: digest(r.sourceRevision), inventoryRevision: digest(r.inventoryRevision), state: r.state, providerId: r.providerId, catalogRevision: identifier(r.catalogRevision), memberships: members(r.memberships), verifiedAt: instant(r.verifiedAt) };
}
export function parseNativeUserSourcesV2(value) {
    const rows = array(value, 128, true).map(v => {
        const r = record(v, ['localRef', 'localRevision', 'sourceRevision', 'name', 'route', 'inventory', 'testedModelId', 'testedProtocol', 'state', 'operationId', 'registration']);
        if (!['legacy', 'saved', 'pending', 'needs_detection'].includes(r.state))
            invalid();
        const row = { localRef: identifier(r.localRef), localRevision: digest(r.localRevision), sourceRevision: nullable(r.sourceRevision, digest), name: text(r.name, 256), route: route(r.route), inventory: nullable(r.inventory, parseDiscoveredModelCatalogV2), testedModelId: nullable(r.testedModelId, exact), testedProtocol: nullable(r.testedProtocol, protocol), state: r.state, operationId: nullable(r.operationId, uuid), registration: nullable(r.registration, parseNativeUserSourceRegistrationV2) };
        if (row.route === 'local_direct' && row.registration !== null || row.registration !== null && (row.registration.localRef !== row.localRef || row.registration.sourceRevision !== row.sourceRevision || row.registration.inventoryRevision !== row.inventory?.inventoryRevision))
            invalid();
        if ((row.testedModelId === null) !== (row.testedProtocol === null) || row.testedModelId !== null && !row.inventory?.models.some(m => m.exactModelId === row.testedModelId))
            invalid();
        if (row.state === 'saved' && (row.sourceRevision === null || row.inventory === null || row.testedModelId === null || row.operationId === null || row.route === 'domestic_registered' && row.registration?.state !== 'active'))
            invalid();
        if (row.state === 'legacy' && (row.sourceRevision !== null || row.inventory !== null || row.registration !== null || row.testedModelId !== null || row.route !== 'local_direct'))
            invalid();
        return row;
    });
    if (new Set(rows.map(r => r.localRef)).size !== rows.length)
        invalid();
    return rows;
}
const WIRES = ['openai_chat_completions', 'anthropic_messages', 'openai_responses'];
function invalid() { throw new TypeError('NATIVE_SOURCE_CONTRACT_INVALID'); }
function record(value, keys) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value')))
        invalid();
    return value;
}
function text(value, max = 128) {
    if (typeof value !== 'string' || !value.length || new TextEncoder().encode(value).length > max || value.trim() !== value || /\p{Cc}/u.test(value))
        invalid();
    return value;
}
function exact(value) {
    if (typeof value !== 'string' || !value.length || new TextEncoder().encode(value).length > 512 || /\p{Cc}/u.test(value))
        invalid();
    return value;
}
function nullable(value, parse) { return value === null ? null : parse(value); }
function identifier(value) { const s = text(value); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(s))
    invalid(); return s; }
function digest(value) { const s = text(value); if (!/^[0-9a-f]{64}$/.test(s))
    invalid(); return s; }
function uuid(value) { const s = text(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))
    invalid(); return s; }
function instant(value) { const s = text(value); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s)
    invalid(); return s; }
function date(value) { const s = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s)
    invalid(); return s; }
function protocol(value) { if (!WIRES.includes(value))
    invalid(); return value; }
function endpoint(value) {
    const s = text(value, 512);
    let parsed;
    try {
        parsed = new URL(s);
    }
    catch {
        return invalid();
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash)
        invalid();
    return s;
}
function array(value, max, allowEmpty = false) {
    if (!Array.isArray(value) || !allowEmpty && !value.length || value.length > max || Object.getPrototypeOf(value) !== Array.prototype)
        invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value'))))
        invalid();
    return value;
}
function version(row) { if (row.schemaVersion !== 2)
    invalid(); }
export function parseNativeUserSourceDraftV2(value) {
    const row = record(value, ['schemaVersion', 'internalId', 'expectedLocalRevision', 'name', 'apiKey', 'sourcePresetId', 'advanced']);
    version(row);
    const internalId = nullable(row.internalId, identifier), expectedLocalRevision = nullable(row.expectedLocalRevision, digest);
    if ((internalId === null) !== (expectedLocalRevision === null))
        invalid();
    const advanced = nullable(row.advanced, value => {
        const a = record(value, ['baseUrl', 'anthropicUrl', 'modelsUrl', 'protocol']);
        return { baseUrl: endpoint(a.baseUrl), anthropicUrl: nullable(a.anthropicUrl, endpoint), modelsUrl: nullable(a.modelsUrl, endpoint), protocol: nullable(a.protocol, protocol) };
    });
    return { schemaVersion: 2, internalId, expectedLocalRevision, name: text(row.name, 256), apiKey: text(row.apiKey, 8192), sourcePresetId: nullable(row.sourcePresetId, identifier), advanced };
}
export function parseDiscoveredModelCatalogV2(value) {
    const row = record(value, ['schemaVersion', 'inventoryRevision', 'fetchedAt', 'endpoint', 'responseSha256', 'models']);
    version(row);
    const models = array(row.models, 4096).map(value => {
        const m = record(value, ['exactModelId', 'ownedBy', 'lifecycle', 'shutdownDate']);
        if (m.lifecycle !== null && !['active', 'deprecated', 'retired'].includes(m.lifecycle))
            invalid();
        return { exactModelId: exact(m.exactModelId), ownedBy: nullable(m.ownedBy, v => text(v, 512)), lifecycle: m.lifecycle, shutdownDate: nullable(m.shutdownDate, date) };
    });
    if (new Set(models.map(m => m.exactModelId)).size !== models.length)
        invalid();
    return { schemaVersion: 2, inventoryRevision: digest(row.inventoryRevision), fetchedAt: instant(row.fetchedAt), endpoint: endpoint(row.endpoint), responseSha256: array(row.responseSha256, 64).map(digest), models };
}
function ping(value) {
    const row = record(value, ['success', 'latencyMs', 'url', 'errorCode']);
    if (typeof row.success !== 'boolean' || !Number.isSafeInteger(row.latencyMs) || Number(row.latencyMs) < 0)
        invalid();
    const errorCode = nullable(row.errorCode, identifier);
    if (row.success ? (errorCode !== null) : (errorCode === null))
        invalid();
    return { success: row.success, latencyMs: row.latencyMs, url: row.url === '' ? '' : endpoint(row.url), errorCode };
}
function probe(value) {
    const p = record(value, ['protocol', 'success', 'latencyMs', 'returnedModel', 'response', 'errorCode']);
    if (typeof p.success !== 'boolean' || !Number.isSafeInteger(p.latencyMs) || Number(p.latencyMs) < 0)
        invalid();
    const returnedModel = nullable(p.returnedModel, exact), errorCode = nullable(p.errorCode, identifier);
    const response = nullable(p.response, v => { if (typeof v !== 'string' || !v.trim() || v.length > 1024 * 1024)
        invalid(); return v; });
    if (p.success ? (returnedModel === null || response === null || errorCode !== null) : (returnedModel !== null || response !== null || errorCode === null))
        invalid();
    return { protocol: protocol(p.protocol), success: p.success, latencyMs: p.latencyMs, returnedModel, response, errorCode };
}
export function parseNativeUserSourceCheckV2(value) {
    const row = record(value, ['schemaVersion', 'route', 'sourceRevision', 'inventory', 'ping', 'probe', 'verificationId', 'verifiedAt', 'expiresAt', 'errorCode']);
    version(row);
    if (row.route !== 'local_direct' && row.route !== 'domestic_registered')
        invalid();
    const result = { schemaVersion: 2, route: row.route, sourceRevision: nullable(row.sourceRevision, digest), inventory: nullable(row.inventory, parseDiscoveredModelCatalogV2),
        ping: ping(row.ping), probe: nullable(row.probe, probe), verificationId: nullable(row.verificationId, uuid), verifiedAt: nullable(row.verifiedAt, instant), expiresAt: nullable(row.expiresAt, instant), errorCode: nullable(row.errorCode, identifier) };
    if (result.verificationId !== null) {
        if (result.errorCode !== null || result.sourceRevision === null || result.inventory === null || !result.probe?.success || result.verifiedAt === null || result.expiresAt === null)
            invalid();
        const duration = Date.parse(result.expiresAt) - Date.parse(result.verifiedAt);
        const tested = result.inventory.models.find(m => m.exactModelId === result.probe.returnedModel);
        if (duration <= 0 || duration > 600000 || !tested || tested.lifecycle === 'retired' || tested.shutdownDate !== null && tested.shutdownDate <= result.verifiedAt.slice(0, 10))
            invalid();
    }
    else if (result.verifiedAt !== null || result.expiresAt !== null || result.sourceRevision !== null || result.errorCode === null)
        invalid();
    return result;
}
//# sourceMappingURL=native-user-sources.js.map