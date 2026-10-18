/** Closed support operations. Trusted paths and diagnostic import are main/native only. */
import { type ClientLogEvent, type SupportIssueStatus, type SupportLogRange } from './support.js';
import type { SupportUploadView } from './harness-tool-dto.js';
declare const requestBrand: unique symbol;
declare const selectionBrand: unique symbol;
export type SupportRequestId = string & {
    readonly [requestBrand]: true;
};
export type SupportScreenshotId = string & {
    readonly [selectionBrand]: true;
};
export type HarnessSupportPreview = Readonly<{
    range: SupportLogRange;
    fileCount: number;
    eventCount: number;
    compressedBytes: string;
    firstOccurredAt: string;
    lastOccurredAt: string;
}>;
export type HarnessSupportScreenshot = Readonly<{
    selectionId: SupportScreenshotId;
    name: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
    bytes: string;
}>;
export type HarnessSupportIssueInput = Readonly<{
    title: string;
    description: string;
    range: SupportLogRange;
    screenshotSelectionIds: readonly SupportScreenshotId[];
}>;
export type HarnessSupportIssue = Readonly<{
    issueId: string;
    publicCode: string;
    logUploadId: string;
    logPublicCode: string;
    status: SupportIssueStatus;
}>;
export type HarnessSupportFailure = Readonly<{
    code: string;
    operationId?: string;
}>;
export type HarnessSupportPhase = 'preparing' | 'uploading' | 'submitting' | 'completed' | 'failed';
export type HarnessSupportRunningPhase = Exclude<HarnessSupportPhase, 'completed' | 'failed'>;
export type HarnessSupportFlow = 'logs' | 'issue';
type OperationIdentity = Readonly<{
    requestId: SupportRequestId;
    flow: HarnessSupportFlow;
}>;
export type HarnessSupportOperationView = Readonly<{
    state: 'idle';
}> | (OperationIdentity & Readonly<{
    state: 'running';
    phase: HarnessSupportRunningPhase;
    log?: SupportUploadView;
}>) | Readonly<{
    state: 'available';
    requestId: SupportRequestId;
    flow: 'logs';
    log: SupportUploadView;
}> | Readonly<{
    state: 'available';
    requestId: SupportRequestId;
    flow: 'issue';
    log: SupportUploadView;
    issue: HarnessSupportIssue;
}> | Readonly<{
    state: 'submission_unconfirmed';
    requestId: SupportRequestId;
    flow: 'issue';
    log: SupportUploadView;
    error: HarnessSupportFailure;
}> | (OperationIdentity & Readonly<{
    state: 'failed';
    phase: HarnessSupportRunningPhase;
    error: HarnessSupportFailure;
    log?: SupportUploadView;
}>);
export type HarnessSupportEvent = Readonly<{
    requestId: SupportRequestId;
    sequence: number;
    phase: HarnessSupportPhase;
    operation: Exclude<HarnessSupportOperationView, {
        state: 'idle';
    }>;
}>;
export declare const HARNESS_DIAGNOSTIC_SOURCES: readonly ['desktop_main', 'host', 'renderer', 'tool_center', 'community', 'skills', 'personal_ai', 'labs', 'aigc'];
export type HarnessDiagnosticSource = typeof HARNESS_DIAGNOSTIC_SOURCES[number];
export type HarnessDiagnosticsBatch = Readonly<{
    source: HarnessDiagnosticSource;
    events: readonly ClientLogEvent[];
}>;
export type HarnessDiagnosticsImport = Readonly<{
    recorded: number;
    duplicates: number;
}>;
export type HarnessSupportCoverage = Readonly<{
    source: HarnessDiagnosticSource;
    state: 'present' | 'unavailable' | 'failed';
}>;
export type HarnessSupportPreviewReceipt = HarnessSupportPreview & Readonly<{
    sources: readonly HarnessSupportCoverage[];
}>;
export type HarnessSupportOperationMap = {
    previewSupportLogs: {
        args: [range: SupportLogRange];
        result: HarnessSupportPreview;
    };
    uploadSupportLogs: {
        args: [requestId: SupportRequestId, range: SupportLogRange];
        result: HarnessSupportOperationView;
    };
    stageSupportScreenshots: {
        args: [requestId: SupportRequestId, trustedPaths: readonly string[]];
        result: readonly HarnessSupportScreenshot[];
    };
    submitSupportIssue: {
        args: [requestId: SupportRequestId, input: HarnessSupportIssueInput];
        result: HarnessSupportOperationView;
    };
    getSupportOperation: {
        args: [requestId: SupportRequestId];
        result: HarnessSupportOperationView;
    };
    readSupportPreviousExit: {
        args: [];
        result: Readonly<{
            detected: boolean;
        }>;
    };
    recordHarnessDiagnostics: {
        args: [batch: HarnessDiagnosticsBatch];
        result: HarnessDiagnosticsImport;
    };
};
export declare const HARNESS_SUPPORT_METHODS: readonly ['previewSupportLogs', 'uploadSupportLogs', 'stageSupportScreenshots', 'submitSupportIssue', 'getSupportOperation', 'readSupportPreviousExit', 'recordHarnessDiagnostics'];
export type HarnessSupportMethod = typeof HARNESS_SUPPORT_METHODS[number];
/** Renderer methods carry no filesystem path, account selector or login credential. */
export interface HarnessSupportApi {
    preview(range: SupportLogRange): Promise<HarnessSupportPreviewReceipt>;
    uploadLogs(requestId: SupportRequestId, range: SupportLogRange): Promise<HarnessSupportOperationView>;
    selectScreenshots(): Promise<readonly HarnessSupportScreenshot[]>;
    submitIssue(requestId: SupportRequestId, input: HarnessSupportIssueInput): Promise<HarnessSupportOperationView>;
    getOperation(requestId: SupportRequestId): Promise<HarnessSupportOperationView>;
    readPreviousExit(): Promise<Readonly<{
        detected: boolean;
    }>>;
    subscribe(requestId: SupportRequestId, listener: (event: HarnessSupportEvent) => void): () => void;
}
/** Validate an opaque workflow identifier before it enters IPC. */
export declare function parseSupportRequestId(value: unknown): SupportRequestId;
/** Validate main's preview with collection availability; native preview fields remain unchanged. */
export declare function parseHarnessSupportPreviewReceipt(value: unknown): HarnessSupportPreviewReceipt;
/** Validate closed private support arguments; this does not authorize a renderer caller. */
export declare function parseHarnessSupportRequest<K extends HarnessSupportMethod>(method: K, value: unknown): HarnessSupportOperationMap[K]['args'];
/** Validate native support results without exposing archive paths or raw failures. */
export declare function parseHarnessSupportResult<K extends HarnessSupportMethod>(method: K, value: unknown): HarnessSupportOperationMap[K]['result'];
/** Parse request-correlated phase events; native owner/stream fencing is validated by main. */
export declare function parseHarnessSupportEvent(value: unknown): HarnessSupportEvent;
export {};
