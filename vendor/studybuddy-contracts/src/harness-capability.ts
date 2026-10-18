/** Private native capability integration. Never expose this authority envelope to page RPC. */
import type { OwnedScope } from './harness-account.js';
import { parseNativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';

export type HarnessCapabilityJsonV1 = null | boolean | number | string | HarnessCapabilityJsonV1[] | { [key: string]: HarnessCapabilityJsonV1 };
export interface HarnessCapabilityCallerV1 {
  scope: OwnedScope;
  hostGeneration: string;
  callerSessionId: string;
  workspaceId: string | null;
  toolCallId: string;
}
export interface HarnessCapabilityTargetV1 { moduleId: string; projectRef: string }
export interface HarnessCapabilityArtifactV1 {
  artifactRef: string;
  moduleId: string;
  schemaRef: string;
  originSessionId: string;
  mime: string;
  bytes: number;
  sha256: string;
}
export type HarnessCapabilityOperationV1 = 'catalog' | 'projects' | 'bind' | 'execute' | 'import' | 'status' | 'cancel';
export interface HarnessCapabilityInvocationV1 {
  schemaVersion: 1;
  rpcId: string;
  caller: HarnessCapabilityCallerV1;
  operation: HarnessCapabilityOperationV1;
  target: HarnessCapabilityTargetV1 | null;
  input: HarnessCapabilityJsonV1;
}
export interface HarnessCapabilityResultV1 {
  data: HarnessCapabilityJsonV1;
  artifacts: HarnessCapabilityArtifactV1[];
  operationRef: string | null;
}

const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
const MAX_ITEMS = 10000;
const operations: readonly string[] = ['catalog', 'projects', 'bind', 'execute', 'import', 'status', 'cancel'];
function invalid(): never { throw Error('HARNESS_CAPABILITY_REQUEST_INVALID'); }
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!plain(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) return invalid();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) return invalid();
  return value;
}
function json(value: unknown, depth = 0): HarnessCapabilityJsonV1 {
  if (depth > 32) return invalid();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > MAX_PAYLOAD_BYTES) return invalid(); return value; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) return invalid(); return value; }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) return invalid();
    return Array.from(value, item => json(item, depth + 1));
  }
  if (plain(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_ITEMS) return invalid();
    return Object.fromEntries(entries.map(([key, item]) => [key, json(item, depth + 1)]));
  }
  return invalid();
}
/** Bound the complete UTF-8 envelope, including all wrapper fields. */
function bounded<T>(value: T): T {
  let bytes = 0;
  for (const character of JSON.stringify(value)) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > MAX_PAYLOAD_BYTES) return invalid();
  }
  return value;
}
function caller(value: unknown): HarnessCapabilityCallerV1 {
  const row = record(value, ['scope', 'hostGeneration', 'callerSessionId', 'workspaceId', 'toolCallId']);
  const owner = parseNativeBuiltinHostContextV1({ scope: row.scope, hostGeneration: row.hostGeneration });
  return { ...owner, callerSessionId: id(row.callerSessionId), workspaceId: row.workspaceId === null ? null : id(row.workspaceId), toolCallId: id(row.toolCallId) };
}
function target(value: unknown): HarnessCapabilityTargetV1 {
  const row = record(value, ['moduleId', 'projectRef']);
  return { moduleId: id(row.moduleId), projectRef: id(row.projectRef) };
}
function artifact(value: unknown): HarnessCapabilityArtifactV1 {
  const row = record(value, ['artifactRef', 'moduleId', 'schemaRef', 'originSessionId', 'mime', 'bytes', 'sha256']);
  if (typeof row.mime !== 'string' || row.mime.length > 128 || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(row.mime)
    || typeof row.bytes !== 'number' || !Number.isSafeInteger(row.bytes) || row.bytes < 0
    || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) return invalid();
  return { artifactRef: id(row.artifactRef), moduleId: id(row.moduleId), schemaRef: id(row.schemaRef),
    originSessionId: id(row.originSessionId), mime: row.mime, bytes: row.bytes, sha256: row.sha256 };
}

export function parseHarnessCapabilityInvocationV1(value: unknown): HarnessCapabilityInvocationV1 {
  try {
    const row = record(value, ['schemaVersion', 'rpcId', 'caller', 'operation', 'target', 'input']);
    if (row.schemaVersion !== 1 || typeof row.operation !== 'string' || !operations.includes(row.operation)
      || row.target === null && ['execute', 'import', 'status', 'cancel'].includes(row.operation)) return invalid();
    return bounded({ schemaVersion: 1, rpcId: uuid(row.rpcId), caller: caller(row.caller), operation: row.operation as HarnessCapabilityOperationV1,
      target: row.target === null ? null : target(row.target), input: json(row.input) });
  } catch { return invalid(); }
}
export function parseHarnessCapabilityResultV1(value: unknown): HarnessCapabilityResultV1 {
  try {
    const row = record(value, ['data', 'artifacts', 'operationRef']);
    if (!Array.isArray(row.artifacts) || row.artifacts.length > MAX_ITEMS) return invalid();
    return bounded({ data: json(row.data), artifacts: Array.from(row.artifacts, artifact), operationRef: row.operationRef === null ? null : id(row.operationRef) });
  } catch { throw Error('HARNESS_CAPABILITY_RESULT_INVALID'); }
}
