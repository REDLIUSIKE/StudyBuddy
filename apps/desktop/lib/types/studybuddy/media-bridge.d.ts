import type { OwnedScope, HarnessMediaContentV1, HarnessMediaKind, HarnessCapabilityCallerV1 } from '@studybuddy/contracts';
export interface MediaRequestRecord {
    schemaVersion: 1;
    accountId: string;
    sessionId: string;
    requestId: string;
    kind: HarnessMediaKind;
    modelId: string;
    inputHash: string;
}
export interface MediaRequestJournal {
    claim(row: MediaRequestRecord): Promise<{
        row: MediaRequestRecord;
        created: boolean;
    }>;
    get(accountId: string, requestId: string): Promise<MediaRequestRecord | null>;
}
interface Dependencies {
    scope(): OwnedScope | undefined;
    api: {
        request(scope: OwnedScope, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
        content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
    };
    journal: MediaRequestJournal;
}
/** All methods capture the actual Main account and the private Host generation. */
export declare class HarnessMediaBridge {
    private readonly deps;
    constructor(deps: Dependencies);
    private assert;
    private model;
    private project;
    private lookup;
    private status;
    /** Private IPC operation; no credential, URL or funding override is accepted. */
    handle(value: unknown, hostGeneration: string, signal?: AbortSignal): Promise<unknown>;
    /** Main-only authorized handoff. The actual caller stays intact; journal provenance is checked separately. */
    readCompletedContent(caller: HarnessCapabilityCallerV1, requestId: string, kind: HarnessMediaKind, hostGeneration: string, authorize: (source: MediaRequestRecord, caller: HarnessCapabilityCallerV1) => Promise<void>, signal?: AbortSignal): Promise<HarnessMediaContentV1>;
    private completedContent;
}
export {};
//# sourceMappingURL=media-bridge.d.ts.map