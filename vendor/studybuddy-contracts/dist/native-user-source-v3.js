import { parseDiscoveredModelCatalogV2 } from './native-user-sources.js';
import { parseNativeBuiltinModelAuthorityV1 } from './native-builtin-consumer-v1.js';
export const NATIVE_USER_SOURCE_PRESETS_V3 = ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo', 'openai', 'anthropic'];
function invalid() { throw new TypeError('NATIVE_SOURCE_V3_CONTRACT_INVALID'); }
function record(v, keys) { if (v === null || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype)
    invalid(); const ds = Object.getOwnPropertyDescriptors(v), own = Reflect.ownKeys(v); if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k) || !Object.hasOwn(ds[k] ?? {}, 'value')))
    invalid(); return v; }
function text(v, max = 128) { if (typeof v !== 'string' || !v.length || new TextEncoder().encode(v).length > max || v.trim() !== v || /\p{Cc}/u.test(v))
    invalid(); return v; }
function id(v) { const s = text(v); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(s))
    invalid(); return s; }
function exact(v) { return text(v, 512); }
function hash(v) { const s = text(v); if (!/^[0-9a-f]{64}$/.test(s))
    invalid(); return s; }
function uuid(v) { const s = text(v); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))
    invalid(); return s; }
function instant(v) { const s = text(v); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s)
    invalid(); return s; }
function nullable(v, p) { return v === null ? null : p(v); }
function provider(v) { if (!NATIVE_USER_SOURCE_PRESETS_V3.includes(v))
    invalid(); return v; }
function protocol(v) { if (!['openai_chat_completions', 'openai_responses', 'anthropic_messages'].includes(v))
    invalid(); return v; }
function route(v) { if (v !== 'local_direct' && v !== 'domestic_private')
    invalid(); return v; }
function endpoint(v, official = false) { const s = text(v, 512); let u; try {
    u = new URL(s);
}
catch {
    return invalid();
} ; if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password || u.search || u.hash || official && (u.protocol !== 'https:' || /^(localhost|127\.|0\.|\[|.*\.localhost$)/i.test(u.hostname)))
    invalid(); return s; }
function array(v, max) { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max)
    invalid(); const own = Reflect.ownKeys(v), ds = Object.getOwnPropertyDescriptors(v); if (own.length !== v.length + 1 || own.some(k => k !== 'length' && (typeof k !== 'string' || !/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= v.length || !Object.hasOwn(ds[k] ?? {}, 'value'))))
    invalid(); return v; }
function selection(v) { const r = record(v, ['exactModelId', 'protocol']); return { exactModelId: exact(r.exactModelId), protocol: protocol(r.protocol) }; }
function models(v) { const rows = array(v, 4096).map(parseNativeBuiltinModelAuthorityV1); if (new Set(rows.map(m => JSON.stringify([m.providerId, m.exactModelId, m.protocol]))).size !== rows.length)
    invalid(); return rows; }
function ping(v) { const r = record(v, ['success', 'latencyMs', 'url', 'errorCode']); if (typeof r.success !== 'boolean' || !Number.isSafeInteger(r.latencyMs) || Number(r.latencyMs) < 0)
    invalid(); const errorCode = nullable(r.errorCode, id); if (r.success ? errorCode !== null : errorCode === null)
    invalid(); return { success: r.success, latencyMs: r.latencyMs, url: r.url === '' ? '' : endpoint(r.url), errorCode }; }
export function parseNativeUserSourceDraftV3(v) { const r = record(v, ['schemaVersion', 'internalId', 'expectedLocalRevision', 'name', 'apiKey', 'sourcePresetId', 'advanced', 'probeSelection']); if (r.schemaVersion !== 3)
    invalid(); const internalId = nullable(r.internalId, id), expectedLocalRevision = nullable(r.expectedLocalRevision, hash); if ((internalId === null) !== (expectedLocalRevision === null))
    invalid(); const advanced = nullable(r.advanced, v => { const a = record(v, ['baseUrl', 'anthropicUrl', 'modelsUrl', 'protocol']); return { baseUrl: endpoint(a.baseUrl), anthropicUrl: nullable(a.anthropicUrl, endpoint), modelsUrl: nullable(a.modelsUrl, endpoint), protocol: nullable(a.protocol, protocol) }; }), probeSelection = nullable(r.probeSelection, selection), apiKey = text(r.apiKey, 8192); if (apiKey.startsWith('enc:') || advanced?.protocol !== null && advanced?.protocol !== undefined && probeSelection !== null && advanced.protocol !== probeSelection.protocol)
    invalid(); return { schemaVersion: 3, internalId, expectedLocalRevision, name: text(r.name, 256), apiKey, sourcePresetId: nullable(r.sourcePresetId, provider), advanced, probeSelection }; }
export function parseNativeUserSourceCheckV3(v) { const r = record(v, ['schemaVersion', 'route', 'state', 'sourceRevision', 'inventory', 'ping', 'probe', 'probeSelection', 'admittedModels', 'verificationId', 'verifiedAt', 'expiresAt', 'errorCode']); if (r.schemaVersion !== 3 || r.probe !== null || !['discovered', 'source_checked', 'unsupported', 'failed'].includes(r.state))
    invalid(); const inventory = nullable(r.inventory, parseDiscoveredModelCatalogV2), probeSelection = nullable(r.probeSelection, selection), admittedModels = models(r.admittedModels), verificationId = nullable(r.verificationId, uuid), verifiedAt = nullable(r.verifiedAt, instant), expiresAt = nullable(r.expiresAt, instant), sourceRevision = nullable(r.sourceRevision, hash), errorCode = nullable(r.errorCode, id); if (r.state === 'source_checked') {
    if (!verificationId || !verifiedAt || !expiresAt || Date.parse(expiresAt) <= Date.parse(verifiedAt) || Date.parse(expiresAt) - Date.parse(verifiedAt) > 600000 || sourceRevision === null || probeSelection === null || errorCode !== null || !inventory?.models.some(m => m.exactModelId === probeSelection.exactModelId && m.lifecycle !== 'retired') || !admittedModels.some(m => m.exactModelId === probeSelection.exactModelId && m.protocol === probeSelection.protocol))
        invalid();
}
else {
    if ([verificationId, verifiedAt, expiresAt, sourceRevision].some(v => v !== null))
        invalid();
    if (r.state === 'discovered' ? (!inventory || errorCode !== null) : errorCode === null)
        invalid();
} ; return { schemaVersion: 3, route: route(r.route), state: r.state, sourceRevision, inventory, ping: ping(r.ping), probe: null, probeSelection, admittedModels, verificationId, verifiedAt, expiresAt, errorCode }; }
export function parseNativeUserSourceSaveRequestV3(v) { const r = record(v, ['schemaVersion', 'operationId', 'draft', 'verificationId']); if (r.schemaVersion !== 3)
    invalid(); const draft = parseNativeUserSourceDraftV3(r.draft); if (draft.probeSelection === null)
    invalid(); return { schemaVersion: 3, operationId: uuid(r.operationId), draft, verificationId: uuid(r.verificationId) }; }
export function parseNativeUserSourceSaveResultV3(v) { const r = record(v, ['schemaVersion', 'operationId', 'state', 'route', 'localRef', 'localRevision', 'sourceRevision', 'inventoryRevision', 'pendingPhase']); if (r.schemaVersion !== 3 || (r.state !== 'saved' && r.state !== 'pending'))
    invalid(); if (r.state === 'saved' ? r.pendingPhase !== null : r.pendingPhase !== 'local_publish')
    invalid(); return { schemaVersion: 3, operationId: uuid(r.operationId), state: r.state, route: route(r.route), localRef: id(r.localRef), localRevision: hash(r.localRevision), sourceRevision: hash(r.sourceRevision), inventoryRevision: hash(r.inventoryRevision), pendingPhase: r.pendingPhase }; }
export function parseNativeUserSourcesV3(v) { const rows = array(v, 128).map(v => { const r = record(v, ['schemaVersion', 'localRef', 'localRevision', 'sourceRevision', 'name', 'route', 'inventory', 'probeSelection', 'state', 'operationId', 'configuration']); if (r.schemaVersion !== 3 || !['legacy', 'saved', 'pending', 'needs_detection'].includes(r.state))
    invalid(); const c = record(r.configuration, ['providerId', 'sourcePresetId', 'baseUrl', 'anthropicUrl']), configuration = { providerId: nullable(c.providerId, provider), sourcePresetId: nullable(c.sourcePresetId, provider), baseUrl: endpoint(c.baseUrl), anthropicUrl: nullable(c.anthropicUrl, endpoint) }, inventory = nullable(r.inventory, parseDiscoveredModelCatalogV2), probeSelection = nullable(r.probeSelection, selection), sourceRevision = nullable(r.sourceRevision, hash), operationId = nullable(r.operationId, uuid), sourceRoute = route(r.route); if (probeSelection !== null && !inventory?.models.some(m => m.exactModelId === probeSelection.exactModelId) || ['saved', 'pending'].includes(r.state) && (!operationId || !sourceRevision || !probeSelection || !inventory || !configuration.providerId) || sourceRoute === 'domestic_private' && (configuration.providerId === null || ['openai', 'anthropic'].includes(configuration.providerId)) || r.state === 'legacy' && (operationId !== null || sourceRevision !== null || inventory !== null || probeSelection !== null))
    invalid(); return { schemaVersion: 3, localRef: id(r.localRef), localRevision: hash(r.localRevision), sourceRevision, name: text(r.name, 256), route: sourceRoute, inventory, probeSelection, state: r.state, operationId, configuration }; }); if (new Set(rows.map(r => r.localRef)).size !== rows.length)
    invalid(); return rows; }
export function parseNativeBuiltinPublicCatalogV1(v) { const r = record(v, ['schemaVersion', 'catalogRevision', 'checkedAt', 'expiresAt', 'models', 'transports']); if (r.schemaVersion !== 1)
    invalid(); const checkedAt = instant(r.checkedAt), expiresAt = instant(r.expiresAt); if (Date.parse(expiresAt) <= Date.parse(checkedAt))
    invalid(); const transports = array(r.transports, 256).map(v => { const r = record(v, ['providerId', 'protocol', 'baseUrl', 'adapterRevision', 'evidenceSha256']); return { providerId: provider(r.providerId), protocol: protocol(r.protocol), baseUrl: endpoint(r.baseUrl, true), adapterRevision: id(r.adapterRevision), evidenceSha256: hash(r.evidenceSha256) }; }); if (new Set(transports.map(t => JSON.stringify([t.providerId, t.protocol, t.baseUrl]))).size !== transports.length)
    invalid(); return { schemaVersion: 1, catalogRevision: id(r.catalogRevision), checkedAt, expiresAt, models: models(r.models), transports }; }
//# sourceMappingURL=native-user-source-v3.js.map