import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import type { HarnessCapabilityCallerV1 } from '@studybuddy/contracts';
import type { CapabilityArtifact, CapabilityTarget } from './types.ts';
declare const association: z.ZodObject<{
    accountId: z.ZodString;
    owner: z.ZodString;
    originSessionId: z.ZodString;
    target: z.ZodObject<{
        moduleId: z.ZodString;
        projectRef: z.ZodString;
    }, z.core.$strict>;
    operationRef: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
/** Durable references only. Scope generations are re-authorized by Main, never restored as grants. */
export declare class CapabilityAssociationStore {
    private readonly ctx;
    private opened;
    private closing;
    constructor(ctx: Context);
    private open;
    close(): Promise<void>;
    find(caller: HarnessCapabilityCallerV1, moduleId: string): Promise<CapabilityTarget[]>;
    link(caller: HarnessCapabilityCallerV1, target: CapabilityTarget, operationRef: string | null): Promise<void>;
    recordArtifact(caller: HarnessCapabilityCallerV1, artifact: CapabilityArtifact): Promise<void>;
    operation(caller: HarnessCapabilityCallerV1, operationRef: string): Promise<z.infer<typeof association> | undefined>;
    recordMediaLink(caller: HarnessCapabilityCallerV1, input: {
        requestId: string;
        modelId: string;
        fundingSource: 'platform' | 'user_api';
    }): Promise<void>;
}
export {};
//# sourceMappingURL=associations.d.ts.map