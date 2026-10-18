import { z } from 'zod';
export interface SkillScannerLlmRequest {
    messages: readonly {
        role: 'system' | 'user';
        content: string;
    }[];
    maxTokens: number;
}
export interface SkillScannerLlmResponse {
    content: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
}
export interface SkillScannerWorkerInput {
    executable: string;
    args: readonly string[];
    cwd: string;
    signal: AbortSignal;
    input: {
        directory: string;
        model: string;
    };
    judge(request: SkillScannerLlmRequest, id: string): Promise<SkillScannerLlmResponse>;
}
declare const resultSchema: z.ZodObject<{
    findings: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    analyzers_used: z.ZodArray<z.ZodString>;
    analyzers_failed: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Run one trusted worker with bounded, keyless private frames. Result publication waits for process exit.
 * @param input - Verified executable/resources, immutable source and per-call native judge.
 * @returns The original upstream JSON; high-severity exit 1 is a verdict, not a process crash.
 * @throws On cancellation, malformed frames, timeout or unknown exit; stops the actual process tree first.
 */
export declare function runSkillScannerWorker(input: SkillScannerWorkerInput): Promise<z.infer<typeof resultSchema>>;
export {};
//# sourceMappingURL=skill-safety-transport.d.ts.map