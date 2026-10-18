import { parseNativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';
export const HARNESS_RESEARCH_ACTION_KINDS = ['conversation', 'methods-draft', 'next-experiments', 'latex-assist', 'compaction'];
function invalid() { throw Error('HARNESS_RESEARCH_REQUEST_INVALID'); }
function object(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalid();
    const record = value;
    if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key)))
        return invalid();
    return record;
}
function id(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value))
        return invalid();
    return value;
}
function uuid(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))
        return invalid();
    return value;
}
function reference(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\u0000]/.test(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..'))
        return invalid();
    return value;
}
function answer(value, depth = 0) {
    if (depth > 16)
        return invalid();
    if (value === null || typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        if (value.length > 65536)
            return invalid();
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (Array.isArray(value)) {
        if (value.length > 256)
            return invalid();
        return value.map(item => answer(item, depth + 1));
    }
    if (value && typeof value === 'object' && Object.keys(value).length <= 256) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, answer(item, depth + 1)]));
    }
    return invalid();
}
export function parseHarnessResearchContextV1(value) {
    const record = object(value, ['scope', 'hostGeneration', 'projectId', 'workspaceId', 'sessionId', 'lease']);
    let owner;
    try {
        owner = parseNativeBuiltinHostContextV1({ scope: record.scope, hostGeneration: record.hostGeneration });
    }
    catch {
        return invalid();
    }
    return { ...owner, projectId: id(record.projectId), workspaceId: id(record.workspaceId), sessionId: id(record.sessionId), lease: uuid(record.lease) };
}
export function parseHarnessResearchActionV1(value) {
    const record = object(value, ['operationId', 'kind', 'input']);
    if (typeof record.kind !== 'string' || !HARNESS_RESEARCH_ACTION_KINDS.includes(record.kind))
        return invalid();
    const input = object(record.input, ['prompt', 'references']);
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 131072 || input.prompt.includes('\u0000') || !Array.isArray(input.references) || input.references.length > 24)
        return invalid();
    return { operationId: uuid(record.operationId), kind: record.kind, input: { prompt: input.prompt, references: input.references.map(reference) } };
}
export function parseHarnessResearchInvocationV1(value) {
    const record = object(value, ['schemaVersion', 'rpcId', 'context', 'operation', 'input']);
    if (record.schemaVersion !== 1)
        return invalid();
    const base = { schemaVersion: 1, rpcId: uuid(record.rpcId), context: parseHarnessResearchContextV1(record.context) };
    if (record.operation === 'capabilities') {
        if (record.input !== null)
            return invalid();
        return { ...base, operation: record.operation, input: null };
    }
    if (record.operation === 'submit')
        return { ...base, operation: record.operation, input: parseHarnessResearchActionV1(record.input) };
    if (record.operation === 'inspect' || record.operation === 'cancel') {
        const input = object(record.input, ['runId']);
        return { ...base, operation: record.operation, input: { runId: uuid(input.runId) } };
    }
    if (record.operation === 'answer') {
        const input = object(record.input, ['interactionId', 'answer']);
        const parsed = answer(input.answer);
        if (JSON.stringify(parsed).length > 131072)
            return invalid();
        return { ...base, operation: record.operation, input: { interactionId: id(input.interactionId), answer: parsed } };
    }
    return invalid();
}
/** Closed native tool carrier. Input data cannot override the captured account/model owner. */
export function parseHarnessResearchToolInvocationV1(value) {
    const record = object(value, ['schemaVersion', 'rpcId', 'context', 'toolCallId', 'operation', 'input']);
    if (record.schemaVersion !== 1 || typeof record.operation !== 'string' || !['catalog', 'notebook', 'memory', 'pdf-annotations', 'guard', 'services', 'advanced', 'budget'].includes(record.operation))
        return invalid();
    const input = object(record.input, ['record']), bounded = answer(input.record);
    if (JSON.stringify(bounded).length > 131072)
        return invalid();
    return { schemaVersion: 1, rpcId: uuid(record.rpcId), context: parseHarnessResearchContextV1(record.context), toolCallId: id(record.toolCallId),
        operation: record.operation, input: { record: bounded } };
}
//# sourceMappingURL=harness-research.js.map