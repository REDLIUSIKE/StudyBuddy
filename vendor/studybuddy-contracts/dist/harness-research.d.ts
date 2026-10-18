/** Private research IPC. A page may never choose provider credentials or invoke arbitrary Host methods. */
import type { OwnedScope } from './harness-account.js';
export declare const HARNESS_RESEARCH_ACTION_KINDS: readonly ['conversation', 'methods-draft', 'next-experiments', 'latex-assist', 'compaction'];
export type HarnessResearchActionKindV1 = typeof HARNESS_RESEARCH_ACTION_KINDS[number];
export interface HarnessResearchContextV1 {
    scope: OwnedScope;
    hostGeneration: string;
    projectId: string;
    workspaceId: string;
    sessionId: string;
    lease: string;
}
export interface HarnessResearchPromptInputV1 {
    prompt: string;
    references: string[];
}
export interface HarnessResearchActionV1 {
    operationId: string;
    kind: HarnessResearchActionKindV1;
    input: HarnessResearchPromptInputV1;
}
export interface HarnessResearchRunV1 {
    runId: string;
    state: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'unknown';
    result?: {
        kind: 'message' | 'artifact' | 'model' | 'job';
        value: unknown;
    };
}
export interface HarnessResearchEventV1 {
    eventId: string;
    projectId: string;
    sessionRef: string;
    runId: string;
    nativeTurnId?: string;
    nativeStepId?: string;
    toolCallId?: string;
    actor: string;
    kind: string;
    payload: unknown;
}
export type HarnessResearchInvocationV1 = {
    schemaVersion: 1;
    rpcId: string;
    context: HarnessResearchContextV1;
} & ({
    operation: 'capabilities';
    input: null;
} | {
    operation: 'submit';
    input: HarnessResearchActionV1;
} | {
    operation: 'inspect' | 'cancel';
    input: {
        runId: string;
    };
} | {
    operation: 'answer';
    input: {
        interactionId: string;
        answer: unknown;
    };
});
export type HarnessResearchToolOperationV1 = 'catalog' | 'notebook' | 'memory' | 'pdf-annotations' | 'guard' | 'services' | 'advanced' | 'budget';
export interface HarnessResearchToolInvocationV1 {
    schemaVersion: 1;
    rpcId: string;
    context: HarnessResearchContextV1;
    toolCallId: string;
    operation: HarnessResearchToolOperationV1;
    input: {
        record: unknown;
    };
}
export declare function parseHarnessResearchContextV1(value: unknown): HarnessResearchContextV1;
export declare function parseHarnessResearchActionV1(value: unknown): HarnessResearchActionV1;
export declare function parseHarnessResearchInvocationV1(value: unknown): HarnessResearchInvocationV1;
/** Closed native tool carrier. Input data cannot override the captured account/model owner. */
export declare function parseHarnessResearchToolInvocationV1(value: unknown): HarnessResearchToolInvocationV1;
