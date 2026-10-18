/** Private AIGC identity and closed domain operations. Filesystem roots remain Main-owned. */
import type { NativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';
import { parseNativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';

export interface HarnessAigcContextV1 extends NativeBuiltinHostContextV1 {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  lease: string;
}
export type HarnessAigcToolOperationV1 = 'state' | 'catalog' | 'execute' | 'resources';
export interface HarnessAigcToolInvocationV1 {
  schemaVersion: 1;
  rpcId: string;
  context: HarnessAigcContextV1;
  callerSessionId: string;
  toolCallId: string;
  operation: HarnessAigcToolOperationV1;
  input: unknown;
}
function invalid(): never { throw Error('HARNESS_AIGC_REQUEST_INVALID'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) return invalid();
  return value;
}
function session(value: unknown): string { if (typeof value !== 'string' || !value.startsWith('session-')) return invalid(); uuid(value.slice(8)); return value; }
function id(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) return invalid(); return value; }
function json(value: unknown, depth = 0): unknown {
  if (depth > 32) return invalid();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 32 * 1024 * 1024) return invalid(); return value; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) return invalid(); return value; }
  if (Array.isArray(value)) { if (value.length > 10000) return invalid(); return value.map(item => json(item, depth + 1)); }
  if (value && typeof value === 'object') {
    if (Object.keys(value).length > 10000 || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, json(item, depth + 1)]));
  }
  return invalid();
}
export function parseHarnessAigcContextV1(value: unknown): HarnessAigcContextV1 {
  const row = object(value, ['scope', 'hostGeneration', 'projectId', 'workspaceId', 'sessionId', 'lease']);
  const owner = parseNativeBuiltinHostContextV1({ scope: row.scope, hostGeneration: row.hostGeneration });
  if (typeof row.projectId !== 'string' || !/^aigc-[a-f0-9]{48}$/.test(row.projectId)) return invalid();
  return { ...owner, projectId: row.projectId, workspaceId: id(row.workspaceId), sessionId: session(row.sessionId), lease: uuid(row.lease) };
}
export function parseHarnessAigcToolInvocationV1(value: unknown): HarnessAigcToolInvocationV1 {
  const row = object(value, ['schemaVersion', 'rpcId', 'context', 'callerSessionId', 'toolCallId', 'operation', 'input']);
  if (row.schemaVersion !== 1 || row.operation !== 'state' && row.operation !== 'catalog' && row.operation !== 'execute' && row.operation !== 'resources') return invalid();
  const input = json(row.input);
  let bytes = 0;
  for (const character of JSON.stringify(input)) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > 32 * 1024 * 1024) return invalid();
  }
  if (typeof row.callerSessionId !== 'string') return invalid();
  if (row.callerSessionId.startsWith('session-')) session(row.callerSessionId); else uuid(row.callerSessionId);
  return { schemaVersion: 1, rpcId: uuid(row.rpcId), context: parseHarnessAigcContextV1(row.context), callerSessionId: row.callerSessionId,
    toolCallId: id(row.toolCallId), operation: row.operation, input };
}
