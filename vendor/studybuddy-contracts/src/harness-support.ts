/** Closed support operations. Trusted paths and diagnostic import are main/native only. */
import { parseClientLogEvent, type ClientLogEvent, type SupportIssueStatus, type SupportLogRange } from './support.js';
import type { SupportUploadView } from './harness-tool-dto.js';

declare const requestBrand: unique symbol;
declare const selectionBrand: unique symbol;
export type SupportRequestId = string & { readonly [requestBrand]: true };
export type SupportScreenshotId = string & { readonly [selectionBrand]: true };
export type HarnessSupportPreview = Readonly<{ range: SupportLogRange; fileCount: number; eventCount: number;
  compressedBytes: string; firstOccurredAt: string; lastOccurredAt: string }>;
export type HarnessSupportScreenshot = Readonly<{ selectionId: SupportScreenshotId; name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: string }>;
export type HarnessSupportIssueInput = Readonly<{ title: string; description: string; range: SupportLogRange;
  screenshotSelectionIds: readonly SupportScreenshotId[] }>;
export type HarnessSupportIssue = Readonly<{ issueId: string; publicCode: string; logUploadId: string;
  logPublicCode: string; status: SupportIssueStatus }>;
export type HarnessSupportFailure = Readonly<{ code: string; operationId?: string }>;
export type HarnessSupportPhase = 'preparing' | 'uploading' | 'submitting' | 'completed' | 'failed';
export type HarnessSupportRunningPhase = Exclude<HarnessSupportPhase, 'completed' | 'failed'>;
export type HarnessSupportFlow = 'logs' | 'issue';
type OperationIdentity = Readonly<{ requestId: SupportRequestId; flow: HarnessSupportFlow }>;
export type HarnessSupportOperationView =
  | Readonly<{ state: 'idle' }>
  | OperationIdentity & Readonly<{ state: 'running'; phase: HarnessSupportRunningPhase; log?: SupportUploadView }>
  | Readonly<{ state: 'available'; requestId: SupportRequestId; flow: 'logs'; log: SupportUploadView }>
  | Readonly<{ state: 'available'; requestId: SupportRequestId; flow: 'issue'; log: SupportUploadView; issue: HarnessSupportIssue }>
  | Readonly<{ state: 'submission_unconfirmed'; requestId: SupportRequestId; flow: 'issue'; log: SupportUploadView; error: HarnessSupportFailure }>
  | OperationIdentity & Readonly<{ state: 'failed'; phase: HarnessSupportRunningPhase; error: HarnessSupportFailure; log?: SupportUploadView }>;
export type HarnessSupportEvent = Readonly<{ requestId: SupportRequestId; sequence: number;
  phase: HarnessSupportPhase; operation: Exclude<HarnessSupportOperationView, { state: 'idle' }> }>;
export const HARNESS_DIAGNOSTIC_SOURCES = ['desktop_main', 'host', 'renderer', 'tool_center', 'community',
  'skills', 'personal_ai', 'labs', 'aigc'] as const;
export type HarnessDiagnosticSource = typeof HARNESS_DIAGNOSTIC_SOURCES[number];
export type HarnessDiagnosticsBatch = Readonly<{ source: HarnessDiagnosticSource; events: readonly ClientLogEvent[] }>;
export type HarnessDiagnosticsImport = Readonly<{ recorded: number; duplicates: number }>;
export type HarnessSupportCoverage = Readonly<{ source: HarnessDiagnosticSource; state: 'present' | 'unavailable' | 'failed' }>;
export type HarnessSupportPreviewReceipt = HarnessSupportPreview & Readonly<{ sources: readonly HarnessSupportCoverage[] }>;
export type HarnessSupportOperationMap = {
  previewSupportLogs: { args: [range: SupportLogRange]; result: HarnessSupportPreview };
  uploadSupportLogs: { args: [requestId: SupportRequestId, range: SupportLogRange]; result: HarnessSupportOperationView };
  stageSupportScreenshots: { args: [requestId: SupportRequestId, trustedPaths: readonly string[]]; result: readonly HarnessSupportScreenshot[] };
  submitSupportIssue: { args: [requestId: SupportRequestId, input: HarnessSupportIssueInput]; result: HarnessSupportOperationView };
  getSupportOperation: { args: [requestId: SupportRequestId]; result: HarnessSupportOperationView };
  readSupportPreviousExit: { args: []; result: Readonly<{ detected: boolean }> };
  recordHarnessDiagnostics: { args: [batch: HarnessDiagnosticsBatch]; result: HarnessDiagnosticsImport };
};
export const HARNESS_SUPPORT_METHODS = ['previewSupportLogs', 'uploadSupportLogs', 'stageSupportScreenshots',
  'submitSupportIssue', 'getSupportOperation', 'readSupportPreviousExit', 'recordHarnessDiagnostics'] as const;
export type HarnessSupportMethod = typeof HARNESS_SUPPORT_METHODS[number];
/** Renderer methods carry no filesystem path, account selector or login credential. */
export interface HarnessSupportApi {
  preview(range: SupportLogRange): Promise<HarnessSupportPreviewReceipt>;
  uploadLogs(requestId: SupportRequestId, range: SupportLogRange): Promise<HarnessSupportOperationView>;
  selectScreenshots(): Promise<readonly HarnessSupportScreenshot[]>;
  submitIssue(requestId: SupportRequestId, input: HarnessSupportIssueInput): Promise<HarnessSupportOperationView>;
  getOperation(requestId: SupportRequestId): Promise<HarnessSupportOperationView>;
  readPreviousExit(): Promise<Readonly<{ detected: boolean }>>;
  subscribe(requestId: SupportRequestId, listener: (event: HarnessSupportEvent) => void): () => void;
}

const ranges = ['last_24_hours', 'last_3_days', 'all_30_days'] as const;
const phases = ['preparing', 'uploading', 'submitting'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const invalid = (): never => { throw new TypeError('HARNESS_SUPPORT_INVALID'); };
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const row = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return row;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) return invalid();
  return value;
}
function integer(value: unknown, maximum: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) return invalid();
  return value;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) return invalid();
  return value as T;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) return invalid();
  return value;
}
/** Validate an opaque workflow identifier before it enters IPC. */
export function parseSupportRequestId(value: unknown): SupportRequestId { return uuid(value) as SupportRequestId; }
/** Validate main's preview with collection availability; native preview fields remain unchanged. */
export function parseHarnessSupportPreviewReceipt(value: unknown): HarnessSupportPreviewReceipt {
  const row = record(value, ['range', 'fileCount', 'eventCount', 'compressedBytes', 'firstOccurredAt', 'lastOccurredAt', 'sources']);
  const { sources, ...native } = row;
  if (!Array.isArray(sources) || sources.length !== HARNESS_DIAGNOSTIC_SOURCES.length) return invalid();
  const parsed = sources.map(value => { const source = record(value, ['source', 'state']);
    return { source: oneOf(source.source, HARNESS_DIAGNOSTIC_SOURCES), state: oneOf(source.state, ['present', 'unavailable', 'failed'] as const) }; });
  if (new Set(parsed.map(value => value.source)).size !== HARNESS_DIAGNOSTIC_SOURCES.length) return invalid();
  return { ...parseHarnessSupportResult('previewSupportLogs', native), sources: parsed };
}
function selectionId(value: unknown): SupportScreenshotId { return uuid(value) as SupportScreenshotId; }
function bytes(value: unknown, maximum: number, allowZero = false): string {
  if (typeof value !== 'string' || !(allowZero ? /^(?:0|[1-9]\d*)$/u : /^[1-9]\d*$/u).test(value) || value.length > 16 || BigInt(value) > BigInt(maximum)) return invalid();
  return value;
}
function time(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
function failure(value: unknown): HarnessSupportFailure {
  const row = record(value, ['code'], ['operationId']);
  const code = text(row.code, 128);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(code)) return invalid();
  return Object.hasOwn(row, 'operationId') ? { code, operationId: uuid(row.operationId) } : { code };
}
function confirmedLog(value: unknown): SupportUploadView {
  const row = record(value, ['uploadId', 'publicCode', 'status']);
  const publicCode = text(row.publicCode, 12);
  if (!/^LOG-[A-Z0-9]{8}$/u.test(publicCode) || row.status !== 'AVAILABLE') return invalid();
  return { uploadId: uuid(row.uploadId), publicCode, status: 'AVAILABLE' };
}
function issue(value: unknown, log: SupportUploadView): HarnessSupportIssue {
  const row = record(value, ['issueId', 'publicCode', 'logUploadId', 'logPublicCode', 'status']);
  const publicCode = text(row.publicCode, 14);
  if (!/^ISSUE-[A-Z0-9]{8}$/u.test(publicCode) || row.logUploadId !== log.uploadId || row.logPublicCode !== log.publicCode) return invalid();
  return { issueId: uuid(row.issueId), publicCode, logUploadId: log.uploadId, logPublicCode: log.publicCode,
    status: oneOf(row.status, ['OPEN', 'IN_PROGRESS', 'RESOLVED']) };
}
function operation(value: unknown): HarnessSupportOperationView {
  const base = record(value, ['state'], ['requestId', 'flow', 'phase', 'log', 'issue', 'error']);
  if (base.state === 'idle') { record(value, ['state']); return { state: 'idle' }; }
  const requestId = parseSupportRequestId(base.requestId), flow = oneOf(base.flow, ['logs', 'issue']);
  if (base.state === 'running') {
    record(value, ['state', 'requestId', 'flow', 'phase'], ['log']);
    const phase = oneOf(base.phase, phases);
    if (flow === 'logs' && phase === 'submitting') return invalid();
    if (Object.hasOwn(base, 'log') && (flow !== 'issue' || phase === 'preparing')) return invalid();
    return { state: 'running', requestId, flow, phase,
      ...(Object.hasOwn(base, 'log') ? { log: confirmedLog(base.log) } : {}) };
  }
  if (base.state === 'available') {
    record(value, ['state', 'requestId', 'flow', 'log'], flow === 'issue' ? ['issue'] : []);
    const log = confirmedLog(base.log);
    return flow === 'logs' ? { state: 'available', requestId, flow, log }
      : { state: 'available', requestId, flow, log, issue: issue(base.issue, log) };
  }
  if (base.state === 'submission_unconfirmed') {
    record(value, ['state', 'requestId', 'flow', 'log', 'error']);
    if (flow !== 'issue') return invalid();
    return { state: 'submission_unconfirmed', requestId, flow, log: confirmedLog(base.log), error: failure(base.error) };
  }
  if (base.state === 'failed') {
    record(value, ['state', 'requestId', 'flow', 'phase', 'error'], ['log']);
    const phase = oneOf(base.phase, phases);
    if (flow === 'logs' && phase === 'submitting') return invalid();
    return { state: 'failed', requestId, flow, phase, error: failure(base.error),
      ...(Object.hasOwn(base, 'log') ? { log: confirmedLog(base.log) } : {}) };
  }
  return invalid();
}
function preview(value: unknown): HarnessSupportPreview {
  const row = record(value, ['range', 'fileCount', 'eventCount', 'compressedBytes', 'firstOccurredAt', 'lastOccurredAt']);
  const firstOccurredAt = time(row.firstOccurredAt), lastOccurredAt = time(row.lastOccurredAt);
  if (firstOccurredAt > lastOccurredAt) return invalid();
  return { range: oneOf(row.range, ranges), fileCount: integer(row.fileCount, 64), eventCount: integer(row.eventCount, 250_000),
    compressedBytes: bytes(row.compressedBytes, 50 * 1024 * 1024, true), firstOccurredAt, lastOccurredAt };
}
function screenshots(value: unknown): readonly HarnessSupportScreenshot[] {
  if (!Array.isArray(value) || value.length > 3) return invalid();
  return value.map((entry: unknown) => {
    const row = record(entry, ['selectionId', 'name', 'mediaType', 'bytes']), name = text(row.name, 255);
    if (/[\\/\u0000-\u001f]/u.test(name)) return invalid();
    return { selectionId: selectionId(row.selectionId), name,
      mediaType: oneOf(row.mediaType, ['image/png', 'image/jpeg', 'image/webp']), bytes: bytes(row.bytes, 5 * 1024 * 1024) };
  });
}
function report(value: unknown): HarnessSupportIssueInput {
  const row = record(value, ['title', 'description', 'range', 'screenshotSelectionIds']);
  if (!Array.isArray(row.screenshotSelectionIds) || row.screenshotSelectionIds.length > 3) return invalid();
  const ids = row.screenshotSelectionIds.map((value: unknown) => selectionId(value));
  if (new Set(ids).size !== ids.length) return invalid();
  return { title: text(row.title, 80), description: text(row.description, 2000), range: oneOf(row.range, ranges), screenshotSelectionIds: ids };
}
function diagnosticBatch(value: unknown): HarnessDiagnosticsBatch {
  const row = record(value, ['source', 'events']);
  if (!Array.isArray(row.events) || row.events.length > 256) return invalid();
  return { source: oneOf(row.source, HARNESS_DIAGNOSTIC_SOURCES), events: row.events.map((event: unknown) => parseClientLogEvent(event)) };
}
/** Validate closed private support arguments; this does not authorize a renderer caller. */
export function parseHarnessSupportRequest<K extends HarnessSupportMethod>(method: K, value: unknown): HarnessSupportOperationMap[K]['args'] {
  if (!Array.isArray(value)) return invalid();
  let parsed: HarnessSupportOperationMap[HarnessSupportMethod]['args'];
  switch (method) {
    case 'previewSupportLogs': if (value.length !== 1) return invalid(); parsed = [oneOf(value[0], ranges)]; break;
    case 'uploadSupportLogs': if (value.length !== 2) return invalid(); parsed = [parseSupportRequestId(value[0]), oneOf(value[1], ranges)]; break;
    case 'submitSupportIssue': if (value.length !== 2) return invalid(); parsed = [parseSupportRequestId(value[0]), report(value[1])]; break;
    case 'getSupportOperation': if (value.length !== 1) return invalid(); parsed = [parseSupportRequestId(value[0])]; break;
    case 'readSupportPreviousExit': if (value.length !== 0) return invalid(); parsed = []; break;
    case 'recordHarnessDiagnostics': if (value.length !== 1) return invalid(); parsed = [diagnosticBatch(value[0])]; break;
    case 'stageSupportScreenshots': {
      if (value.length !== 2 || !Array.isArray(value[1]) || value[1].length > 3) return invalid();
      parsed = [parseSupportRequestId(value[0]), value[1].map((path: unknown) => text(path, 4096))]; break;
    }
    default: return invalid();
  }
  return parsed as HarnessSupportOperationMap[K]['args'];
}
/** Validate native support results without exposing archive paths or raw failures. */
export function parseHarnessSupportResult<K extends HarnessSupportMethod>(method: K, value: unknown): HarnessSupportOperationMap[K]['result'] {
  let parsed: HarnessSupportOperationMap[HarnessSupportMethod]['result'];
  switch (method) {
    case 'previewSupportLogs': parsed = preview(value); break;
    case 'uploadSupportLogs': case 'submitSupportIssue': case 'getSupportOperation': {
      parsed = operation(value);
      if (parsed.state === 'idle' && method !== 'getSupportOperation') return invalid();
      if (parsed.state !== 'idle' && (method === 'uploadSupportLogs' && parsed.flow !== 'logs' || method === 'submitSupportIssue' && parsed.flow !== 'issue')) return invalid();
      break;
    }
    case 'stageSupportScreenshots': parsed = screenshots(value); break;
    case 'readSupportPreviousExit': { const row = record(value, ['detected']); if (typeof row.detected !== 'boolean') return invalid(); parsed = { detected: row.detected }; break; }
    case 'recordHarnessDiagnostics': { const row = record(value, ['recorded', 'duplicates']);
      const recorded = integer(row.recorded, 256), duplicates = integer(row.duplicates, 256);
      if (recorded + duplicates > 256) return invalid();
      parsed = { recorded, duplicates }; break; }
    default: return invalid();
  }
  return parsed as HarnessSupportOperationMap[K]['result'];
}
/** Parse request-correlated phase events; native owner/stream fencing is validated by main. */
export function parseHarnessSupportEvent(value: unknown): HarnessSupportEvent {
  const row = record(value, ['requestId', 'sequence', 'phase', 'operation']);
  const requestId = parseSupportRequestId(row.requestId), parsed = operation(row.operation);
  const phase = oneOf(row.phase, ['preparing', 'uploading', 'submitting', 'completed', 'failed']);
  if (parsed.state === 'idle' || parsed.requestId !== requestId ||
    phase === 'completed' && parsed.state !== 'available' ||
    phase === 'failed' && parsed.state !== 'failed' && parsed.state !== 'submission_unconfirmed' ||
    phases.includes(phase as HarnessSupportRunningPhase) && (parsed.state !== 'running' || parsed.phase !== phase)) return invalid();
  return { requestId, sequence: integer(row.sequence, Number.MAX_SAFE_INTEGER, 1), phase, operation: parsed };
}
