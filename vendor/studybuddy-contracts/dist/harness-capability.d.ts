/** Private native capability integration. Never expose this authority envelope to page RPC. */
import type { OwnedScope } from './harness-account.js';
export type HarnessCapabilityJsonV1 = null | boolean | number | string | HarnessCapabilityJsonV1[] | {
    [key: string]: HarnessCapabilityJsonV1;
};
export interface HarnessCapabilityCallerV1 {
    scope: OwnedScope;
    hostGeneration: string;
    callerSessionId: string;
    workspaceId: string | null;
    toolCallId: string;
}
export interface HarnessCapabilityTargetV1 {
    moduleId: string;
    projectRef: string;
}
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
export declare function parseHarnessCapabilityInvocationV1(value: unknown): HarnessCapabilityInvocationV1;
export declare function parseHarnessCapabilityResultV1(value: unknown): HarnessCapabilityResultV1;
