/** Private AIGC identity and closed domain operations. Filesystem roots remain Main-owned. */
import type { NativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';
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
export declare function parseHarnessAigcContextV1(value: unknown): HarnessAigcContextV1;
export declare function parseHarnessAigcToolInvocationV1(value: unknown): HarnessAigcToolInvocationV1;
