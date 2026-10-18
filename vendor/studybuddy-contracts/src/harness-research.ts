/** Private research IPC. A page may never choose provider credentials or invoke arbitrary Host methods. */
import type { OwnedScope } from './harness-account.js';
import { parseNativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';

export const HARNESS_RESEARCH_ACTION_KINDS = ['conversation', 'methods-draft', 'next-experiments', 'latex-assist', 'compaction'] as const;
export type HarnessResearchActionKindV1 = typeof HARNESS_RESEARCH_ACTION_KINDS[number];
export interface HarnessResearchContextV1 {
  scope: OwnedScope;
  hostGeneration: string;
  projectId: string;
  workspaceId: string;
  sessionId: string;
  lease: string;
}
export interface HarnessResearchPromptInputV1 { prompt: string; references: string[] }
export interface HarnessResearchActionV1 {
  operationId: string;
  kind: HarnessResearchActionKindV1;
  input: HarnessResearchPromptInputV1;
}
export interface HarnessResearchRunV1 {
  runId: string;
  state: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'unknown';
  result?: { kind: 'message' | 'artifact' | 'model' | 'job'; value: unknown };
}
export interface HarnessResearchEventV1 {
  eventId: string; projectId: string; sessionRef: string; runId: string;
  nativeTurnId?: string; nativeStepId?: string; toolCallId?: string;
  actor: string; kind: string; payload: unknown;
}
export type HarnessResearchInvocationV1 = { schemaVersion: 1; rpcId: string; context: HarnessResearchContextV1 } & (
  { operation: 'capabilities'; input: null } |
  { operation: 'submit'; input: HarnessResearchActionV1 } |
  { operation: 'inspect' | 'cancel'; input: { runId: string } } |
  { operation: 'answer'; input: { interactionId: string; answer: unknown } }
);
export type HarnessResearchToolOperationV1 = 'catalog' | 'notebook' | 'memory' | 'pdf-annotations' | 'guard' | 'services' | 'advanced' | 'budget';
export interface HarnessResearchToolInvocationV1 {
  schemaVersion: 1; rpcId: string; context: HarnessResearchContextV1; toolCallId: string;
  operation: HarnessResearchToolOperationV1; input: { record: unknown };
}

function invalid(): never { throw Error('HARNESS_RESEARCH_REQUEST_INVALID'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key))) return invalid();
  return record;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) return invalid();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) return invalid();
  return value;
}
function reference(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\u0000]/.test(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) return invalid();
  return value;
}
function answer(value: unknown, depth = 0): unknown {
  if (depth > 16) return invalid();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 65536) return invalid(); return value; }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) { if (value.length > 256) return invalid(); return value.map(item => answer(item, depth + 1)); }
  if (value && typeof value === 'object' && Object.keys(value).length <= 256) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, answer(item, depth + 1)]));
  }
  return invalid();
}
export function parseHarnessResearchContextV1(value: unknown): HarnessResearchContextV1 {
  const record = object(value, ['scope', 'hostGeneration', 'projectId', 'workspaceId', 'sessionId', 'lease']);
  let owner: ReturnType<typeof parseNativeBuiltinHostContextV1>;
  try { owner = parseNativeBuiltinHostContextV1({ scope: record.scope, hostGeneration: record.hostGeneration }); }
  catch { return invalid(); }
  return { ...owner, projectId: id(record.projectId), workspaceId: id(record.workspaceId), sessionId: id(record.sessionId), lease: uuid(record.lease) };
}
export function parseHarnessResearchActionV1(value: unknown): HarnessResearchActionV1 {
  const record = object(value, ['operationId', 'kind', 'input']);
  if (typeof record.kind !== 'string' || !HARNESS_RESEARCH_ACTION_KINDS.includes(record.kind as HarnessResearchActionKindV1)) return invalid();
  const input = object(record.input, ['prompt', 'references']);
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 131072 || input.prompt.includes('\u0000') || !Array.isArray(input.references) || input.references.length > 24) return invalid();
  return { operationId: uuid(record.operationId), kind: record.kind as HarnessResearchActionKindV1, input: { prompt: input.prompt, references: input.references.map(reference) } };
}
export function parseHarnessResearchInvocationV1(value: unknown): HarnessResearchInvocationV1 {
  const record = object(value, ['schemaVersion', 'rpcId', 'context', 'operation', 'input']);
  if (record.schemaVersion !== 1) return invalid();
  const base = { schemaVersion: 1 as const, rpcId: uuid(record.rpcId), context: parseHarnessResearchContextV1(record.context) };
  if (record.operation === 'capabilities') { if (record.input !== null) return invalid(); return { ...base, operation: record.operation, input: null }; }
  if (record.operation === 'submit') return { ...base, operation: record.operation, input: parseHarnessResearchActionV1(record.input) };
  if (record.operation === 'inspect' || record.operation === 'cancel') {
    const input = object(record.input, ['runId']);
    return { ...base, operation: record.operation, input: { runId: uuid(input.runId) } };
  }
  if (record.operation === 'answer') {
    const input = object(record.input, ['interactionId', 'answer']);
    const parsed = answer(input.answer);
    if (JSON.stringify(parsed).length > 131072) return invalid();
    return { ...base, operation: record.operation, input: { interactionId: id(input.interactionId), answer: parsed } };
  }
  return invalid();
}
/** Closed native tool carrier. Input data cannot override the captured account/model owner. */
export function parseHarnessResearchToolInvocationV1(value: unknown): HarnessResearchToolInvocationV1 {
  const record = object(value, ['schemaVersion', 'rpcId', 'context', 'toolCallId', 'operation', 'input']);
  if (record.schemaVersion !== 1 || typeof record.operation !== 'string' || !['catalog', 'notebook', 'memory', 'pdf-annotations', 'guard', 'services', 'advanced', 'budget'].includes(record.operation)) return invalid();
  const input = object(record.input, ['record']), bounded = answer(input.record);
  if (JSON.stringify(bounded).length > 131072) return invalid();
  return { schemaVersion: 1, rpcId: uuid(record.rpcId), context: parseHarnessResearchContextV1(record.context), toolCallId: id(record.toolCallId),
    operation: record.operation as HarnessResearchToolOperationV1, input: { record: bounded } };
}
