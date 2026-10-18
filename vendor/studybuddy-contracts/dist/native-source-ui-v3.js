import { getNativeToolDefinition } from './native-tools.js';
function invalid() { throw new TypeError('NATIVE_SOURCE_UI_CONTRACT_INVALID'); }
function object(value, keys) { if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    invalid(); const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value); if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k) || !Object.hasOwn(descriptors[k] ?? {}, 'value')))
    invalid(); return value; }
function text(v, max = 128) { if (typeof v !== 'string' || !v.length || v.length > max || v.trim() !== v || /\p{Cc}/u.test(v))
    invalid(); return v; }
function exact(v) { const s = text(v); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(s))
    invalid(); return s; }
function hash(v) { const s = text(v); if (!/^[0-9a-f]{64}$/.test(s))
    invalid(); return s; }
function nullable(v, f) { return v === null ? null : f(v); }
function protocol(v) { if (!['openai_responses', 'openai_chat_completions', 'anthropic_messages'].includes(v))
    invalid(); return v; }
function tool(v) { return getNativeToolDefinition(exact(v)).id; }
function array(v, max) { if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max)
    invalid(); const keys = Reflect.ownKeys(v); if (keys.length !== v.length + 1 || keys.some(k => typeof k !== 'string' || k !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= v.length)))
    invalid(); for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(v, String(i)) ?? {}, 'value'))
        invalid(); return v; }
export function parseNativeRememberedChoiceV1(v) {
    const r = object(v, ['schemaVersion', 'toolId', 'kind', 'sourceRef', 'sourceRevision', 'exactModelId', 'protocol', 'logicalModelId']);
    if (r.schemaVersion !== 1 || r.kind !== 'platform' && r.kind !== 'user_source')
        invalid();
    const result = { schemaVersion: 1, toolId: tool(r.toolId), kind: r.kind, sourceRef: nullable(r.sourceRef, exact), sourceRevision: nullable(r.sourceRevision, hash), exactModelId: exact(r.exactModelId), protocol: protocol(r.protocol), logicalModelId: nullable(r.logicalModelId, exact) };
    if (result.kind === 'platform' ? (result.sourceRef !== null || result.sourceRevision !== null || result.logicalModelId === null) : (result.sourceRef === null || result.sourceRevision === null || result.logicalModelId !== null))
        invalid();
    return result;
}
export function parseNativeUserSourceConnectV3(v) {
    const r = object(v, ['schemaVersion', 'toolId', 'sourceRef', 'sourceRevision', 'inventoryRevision', 'exactModelId', 'protocol', 'options']);
    if (r.schemaVersion !== 3)
        invalid();
    if (!r.options || typeof r.options !== 'object' || Object.getPrototypeOf(r.options) !== Object.prototype)
        invalid();
    const options = {};
    for (const k of Reflect.ownKeys(r.options)) {
        if (typeof k !== 'string' || !['relayMode', 'webSearch', 'oneMContext'].includes(k))
            invalid();
        const d = Object.getOwnPropertyDescriptor(r.options, k);
        if (!d || !Object.hasOwn(d, 'value') || d.value !== null && typeof d.value !== 'boolean')
            invalid();
        options[k] = d.value;
    }
    return { schemaVersion: 3, toolId: tool(r.toolId), sourceRef: exact(r.sourceRef), sourceRevision: hash(r.sourceRevision), inventoryRevision: hash(r.inventoryRevision), exactModelId: exact(r.exactModelId), protocol: protocol(r.protocol), options };
}
export function parseNativeUserSourceConnectionViewV3(v) {
    const r = object(v, ['schemaVersion', 'toolId', 'state', 'protocol', 'sourceRef', 'sourceRevision', 'inventoryRevision', 'grantRevision', 'allowedModelIds', 'defaultModelId', 'appliedModelId', 'errorCode']);
    if (r.schemaVersion !== 3 || !['available', 'pending', 'connected', 'conflict', 'unavailable', 'revocation_pending'].includes(r.state))
        invalid();
    const allowedModelIds = array(r.allowedModelIds, 64).map(exact);
    if (new Set(allowedModelIds).size !== allowedModelIds.length)
        invalid();
    const result = { schemaVersion: 3, toolId: tool(r.toolId), state: r.state, protocol: protocol(r.protocol), sourceRef: exact(r.sourceRef), sourceRevision: hash(r.sourceRevision), inventoryRevision: hash(r.inventoryRevision), grantRevision: nullable(r.grantRevision, hash), allowedModelIds, defaultModelId: nullable(r.defaultModelId, exact), appliedModelId: nullable(r.appliedModelId, exact), errorCode: nullable(r.errorCode, exact) };
    if (result.state === 'connected' && (result.defaultModelId === null || result.appliedModelId !== result.defaultModelId || result.errorCode !== null || !allowedModelIds.includes(result.defaultModelId)))
        invalid();
    return result;
}
export function parseNativeSourceModelCandidatesV3(v) {
    const result = array(v, 128 * 4096 * 8 * 3).map(v => { const r = object(v, ['choiceId', 'displayName', 'sourceName', 'route', 'available', 'blockReason', 'tested', 'adapted', 'selection', 'request']); if (typeof r.available !== 'boolean' || typeof r.tested !== 'boolean' || typeof r.adapted !== 'boolean' || r.route !== 'local_direct' && r.route !== 'domestic_registered')
        invalid(); const selection = parseNativeRememberedChoiceV1(r.selection), request = parseNativeUserSourceConnectV3(r.request), blockReason = nullable(r.blockReason, v => text(v, 512)); if (selection.kind !== 'user_source' || selection.toolId !== request.toolId || selection.sourceRef !== request.sourceRef || selection.sourceRevision !== request.sourceRevision || selection.exactModelId !== request.exactModelId || selection.protocol !== request.protocol || r.available && (blockReason !== null || !r.adapted) || !r.available && blockReason === null)
        invalid(); return { choiceId: text(r.choiceId, 512), displayName: text(r.displayName, 256), sourceName: text(r.sourceName, 256), route: r.route, available: r.available, blockReason, tested: r.tested, adapted: r.adapted, selection, request }; });
    if (new Set(result.map(r => r.choiceId)).size !== result.length)
        invalid();
    return result;
}
//# sourceMappingURL=native-source-ui-v3.js.map