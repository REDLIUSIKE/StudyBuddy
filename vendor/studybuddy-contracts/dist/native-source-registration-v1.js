import { getNativeToolDefinition } from './native-tools.js';
import { parseExactNativeToolVersion } from './native-tool-version.js';
import { parseNativeToolAuthorityV2 } from './native-tool-connection-v2.js';
import { parseNativeUserSourceConnectionViewV3 } from './native-source-ui-v3.js';
export const SIX_TOOL_IDS = ['claude_code', 'dsh', 'hermes', 'kimicode', 'openclaw', 'workbuddy'];
function invalid() { throw new TypeError('NATIVE_SOURCE_CONFIGURATION_CONTRACT_INVALID'); }
function object(value, keys) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value')))
        invalid();
    return value;
}
function text(value, max = 128) {
    if (typeof value !== 'string' || !value.length || value.length > max || value.trim() !== value || /\p{Cc}/u.test(value))
        invalid();
    return value;
}
function id(value) {
    const result = text(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(result))
        invalid();
    return result;
}
function hash(value) { const result = text(value); if (!/^[0-9a-f]{64}$/.test(result))
    invalid(); return result; }
function nullable(value, parse) { return value === null ? null : parse(value); }
function array(value, max) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max)
        invalid();
    const own = Reflect.ownKeys(value);
    if (own.length !== value.length + 1 || own.some(key => typeof key !== 'string' || key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))
        invalid();
    for (let i = 0; i < value.length; i++)
        if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value'))
            invalid();
    return value;
}
function tool(value) {
    if (!SIX_TOOL_IDS.includes(value))
        invalid();
    return value;
}
function protocol(value) {
    if (!['openai_responses', 'openai_chat_completions', 'anthropic_messages'].includes(value))
        invalid();
    return value;
}
function version(value) { const result = text(value); parseExactNativeToolVersion(result); return result; }
function models(value) {
    const result = array(value, 64).map(id);
    if (new Set(result).size !== result.length)
        invalid();
    return result;
}
function options(value) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const result = {};
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || !['relayMode', 'webSearch', 'oneMContext'].includes(key))
            invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== null && typeof descriptor.value !== 'boolean')
            invalid();
        result[key] = descriptor.value;
    }
    return result;
}
export function parseNativeSourceChoiceV1(value) {
    if (!value || typeof value !== 'object')
        invalid();
    // Read only an own data descriptor before choosing the closed shape.
    const kind = Object.getOwnPropertyDescriptor(value, 'kind');
    if (!kind || !Object.hasOwn(kind, 'value'))
        invalid();
    if (kind.value === 'platform') {
        object(value, ['kind']);
        return { kind: 'platform' };
    }
    const row = object(value, ['kind', 'sourceRef', 'sourceRevision', 'inventoryRevision']);
    if (row.kind !== 'user_source')
        invalid();
    return { kind: 'user_source', sourceRef: id(row.sourceRef), sourceRevision: hash(row.sourceRevision), inventoryRevision: hash(row.inventoryRevision) };
}
function sourceKey(source) {
    return source.kind === 'platform' ? 'platform' : JSON.stringify([source.sourceRef, source.sourceRevision, source.inventoryRevision]);
}
function parseOption(value) {
    const row = object(value, ['toolId', 'source', 'label', 'protocol', 'catalogRevision', 'policyRevision', 'installedToolVersion',
        'bootstrapLogicalModelId', 'bootstrapExactModelId', 'authorizedModelIds', 'available', 'blockReason']);
    if (typeof row.available !== 'boolean')
        invalid();
    const result = {
        toolId: tool(row.toolId), source: parseNativeSourceChoiceV1(row.source), label: text(row.label, 256), protocol: protocol(row.protocol),
        catalogRevision: nullable(row.catalogRevision, text), policyRevision: nullable(row.policyRevision, text),
        installedToolVersion: nullable(row.installedToolVersion, version), bootstrapLogicalModelId: nullable(row.bootstrapLogicalModelId, id),
        bootstrapExactModelId: nullable(row.bootstrapExactModelId, id), authorizedModelIds: models(row.authorizedModelIds),
        available: row.available, blockReason: nullable(row.blockReason, value => text(value, 512)),
    };
    if (result.available) {
        const definition = getNativeToolDefinition(result.toolId);
        if (result.blockReason !== null || result.catalogRevision === null || result.policyRevision === null || result.installedToolVersion === null ||
            result.bootstrapLogicalModelId === null || result.bootstrapExactModelId === null || !result.authorizedModelIds.includes(result.bootstrapExactModelId) ||
            definition.configurationEvidence !== 'verified' || !definition.protocols.includes(result.protocol))
            invalid();
    }
    else if (result.blockReason === null)
        invalid();
    return result;
}
export function parseNativeSourceConfigurationContextV1(value) {
    const row = object(value, ['schemaVersion', 'capabilities', 'toolId', 'options']);
    if (row.schemaVersion !== 1)
        invalid();
    const toolId = tool(row.toolId);
    const capabilities = array(row.capabilities, 2).map(value => {
        if (value !== 'source_configuration_v1' && value !== 'source_registration_v1')
            invalid();
        return value;
    });
    if (new Set(capabilities).size !== capabilities.length || !capabilities.includes('source_configuration_v1') ||
        toolId !== 'claude_code' && !capabilities.includes('source_registration_v1'))
        invalid();
    const entries = array(row.options, 256).map(parseOption);
    const identities = entries.map(entry => JSON.stringify([sourceKey(entry.source), entry.protocol]));
    if (entries.some(entry => entry.toolId !== toolId) || new Set(identities).size !== identities.length)
        invalid();
    return { schemaVersion: 1, toolId, capabilities, options: entries };
}
export function parseNativeSourceConfigurationRequestV1(value) {
    const row = object(value, ['schemaVersion', 'toolId', 'source', 'protocol', 'catalogRevision', 'policyRevision', 'installedToolVersion', 'options']);
    if (row.schemaVersion !== 1)
        invalid();
    const toolId = tool(row.toolId), selectedProtocol = protocol(row.protocol);
    if (!getNativeToolDefinition(toolId).protocols.includes(selectedProtocol))
        invalid();
    return { schemaVersion: 1, toolId, source: parseNativeSourceChoiceV1(row.source), protocol: selectedProtocol,
        catalogRevision: text(row.catalogRevision), policyRevision: text(row.policyRevision), installedToolVersion: version(row.installedToolVersion), options: options(row.options) };
}
export function parseNativeSourceRegistrationViewV1(value) {
    const row = object(value, ['schemaVersion', 'kind', 'toolId', 'state', 'source', 'protocol', 'catalogRevision', 'grantRevision',
        'credentialRevision', 'authorizedModelIds', 'nativeSelection', 'errorCode']);
    if (row.schemaVersion !== 1 || row.kind !== 'source_registration')
        invalid();
    const toolId = tool(row.toolId);
    if (toolId === 'claude_code' || !['unconfigured', 'pending', 'registered', 'conflict', 'unavailable', 'revocation_pending'].includes(row.state))
        invalid();
    const selection = object(row.nativeSelection, ['kind', 'modelId']);
    if (!['owned', 'external', 'unknown'].includes(selection.kind))
        invalid();
    const nativeSelection = { kind: selection.kind, modelId: nullable(selection.modelId, id) };
    if (nativeSelection.kind === 'unknown' ? nativeSelection.modelId !== null : nativeSelection.modelId === null)
        invalid();
    const result = {
        schemaVersion: 1, kind: 'source_registration', toolId, state: row.state,
        source: nullable(row.source, parseNativeSourceChoiceV1), protocol: nullable(row.protocol, protocol),
        catalogRevision: nullable(row.catalogRevision, text), grantRevision: nullable(row.grantRevision, text),
        credentialRevision: nullable(row.credentialRevision, text), authorizedModelIds: models(row.authorizedModelIds),
        nativeSelection, errorCode: nullable(row.errorCode, id),
    };
    if (result.nativeSelection.kind === 'owned' && !result.authorizedModelIds.includes(result.nativeSelection.modelId))
        invalid();
    if (result.state === 'registered' && (result.source === null || result.protocol === null || result.catalogRevision === null ||
        result.credentialRevision === null || result.authorizedModelIds.length === 0 || result.errorCode !== null))
        invalid();
    if (result.state === 'unconfigured' && (result.source !== null || result.protocol !== null || result.catalogRevision !== null ||
        result.grantRevision !== null || result.credentialRevision !== null || result.authorizedModelIds.length !== 0 ||
        nativeSelection.kind !== 'unknown' || result.errorCode !== null))
        invalid();
    return result;
}
function parseClaudeV2(value) {
    const row = object(value, ['schemaVersion', 'toolId', 'state', 'protocol', 'fundingSource', 'appliedLogicalModelId', 'appliedExactModelId', 'errorCode', 'authority']);
    if (row.schemaVersion !== 2 || row.toolId !== 'claude_code' ||
        !['available', 'pending', 'connected', 'conflict', 'unavailable', 'revocation_pending'].includes(row.state) ||
        row.fundingSource !== null && row.fundingSource !== 'platform' && row.fundingSource !== 'user_api')
        invalid();
    const result = { schemaVersion: 2, toolId: 'claude_code', state: row.state,
        protocol: nullable(row.protocol, protocol), fundingSource: row.fundingSource, appliedLogicalModelId: nullable(row.appliedLogicalModelId, id),
        appliedExactModelId: nullable(row.appliedExactModelId, id), errorCode: nullable(row.errorCode, id),
        authority: nullable(row.authority, parseNativeToolAuthorityV2) };
    if (result.state === 'connected') {
        const authority = result.authority;
        if (!authority || authority.state !== 'connected' || authority.toolId !== result.toolId || authority.protocol !== result.protocol ||
            authority.fundingSource !== result.fundingSource || result.appliedLogicalModelId === null || result.appliedExactModelId === null ||
            result.errorCode !== null || !authority.authorizedModels?.some(model => model.logicalModelId === result.appliedLogicalModelId &&
            model.exactModelId === result.appliedExactModelId && model.availability === 'available'))
            invalid();
    }
    return result;
}
export function parseNativeToolConfigurationViewV1(value) {
    if (!value || typeof value !== 'object')
        invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, 'schemaVersion');
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
        invalid();
    if (descriptor.value === 1)
        return parseNativeSourceRegistrationViewV1(value);
    if (descriptor.value === 2)
        return parseClaudeV2(value);
    if (descriptor.value !== 3)
        invalid();
    const result = parseNativeUserSourceConnectionViewV3(value);
    if (result.toolId !== 'claude_code')
        invalid();
    return result;
}
//# sourceMappingURL=native-source-registration-v1.js.map