/** Private packaged scanner invocation and immutable report adaptation. */
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyReport } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { SkillSafetyPrivateArtifact } from './skill-safety-artifacts.ts';
import type { SkillScannerLlmRequest, SkillScannerLlmResponse, SkillScannerWorkerInput } from './skill-safety-transport.ts';
export interface SkillSafetyScannerOptions {
    readArtifact(actor: SkillSafetyActor, id: SkillSafetyArtifactId): Promise<SkillSafetyPrivateArtifact>;
    verifyResources(signal: AbortSignal): Promise<{
        identity: string;
        configDigest: string;
        executable: string;
        args: string[];
        cwd: string;
    }>;
    isCurrent(actor: SkillSafetyActor): boolean;
    modelIdentity(actor: SkillSafetyActor): Promise<string>;
    judge(actor: SkillSafetyActor, id: string, request: SkillScannerLlmRequest, signal: AbortSignal): Promise<SkillScannerLlmResponse>;
    worker(input: SkillScannerWorkerInput): Promise<unknown>;
}
export declare class SkillSafetyScanner {
    private readonly options;
    constructor(options: SkillSafetyScannerOptions);
    /**
     * Scan checked bytes with the packaged upstream and current selected model, never rules-only fallback.
     * @param actor - Current account/session; checked before and after every awaited side effect.
     * @param id - Private snapshot identity, not a caller path.
     * @param signal - Turn/disposal cancellation; transport owns actual process settlement.
     * @returns Original inert findings with coverage/risk eligibility kept separate.
     */
    runSkillScan(actor: SkillSafetyActor, id: SkillSafetyArtifactId, signal: AbortSignal, expectedModelIdentity?: string): Promise<SkillSafetyReport>;
}
//# sourceMappingURL=skill-safety-scanner.d.ts.map