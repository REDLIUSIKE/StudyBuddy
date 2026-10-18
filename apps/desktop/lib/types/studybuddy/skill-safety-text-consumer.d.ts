import type { SkillSafetyActor } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { AigcTextChoice, AigcTextConsumer, AigcPlatformConsumer } from './aigc-types.ts';
import type { StudyBuddyFetch } from './services.ts';
import type { SkillScannerLlmRequest, SkillScannerLlmResponse } from './skill-safety-transport.ts';
export interface SkillSafetyCallRecord {
    requestId: string;
    fingerprint: string;
    modelIdentity: string;
    result?: SkillScannerLlmResponse;
}
export interface SkillSafetyCallStore {
    read(actor: SkillSafetyActor, id: string): Promise<SkillSafetyCallRecord | undefined>;
    claim(actor: SkillSafetyActor, id: string, record: SkillSafetyCallRecord): Promise<SkillSafetyCallRecord>;
    settle(actor: SkillSafetyActor, id: string, result: SkillScannerLlmResponse): Promise<void>;
}
export interface SkillSafetyTextOptions {
    consumer: AigcTextConsumer;
    platform?: AigcPlatformConsumer;
    selection(actor: SkillSafetyActor): Promise<AigcTextChoice | undefined>;
    isCurrent(actor: SkillSafetyActor): boolean;
    records: SkillSafetyCallStore;
    fetch: StudyBuddyFetch;
    audit(actor: SkillSafetyActor, record: Readonly<Record<string, unknown>>): Promise<void>;
}
export declare class SkillSafetyTextConsumer {
    private readonly options;
    constructor(options: SkillSafetyTextOptions);
    /**
     * Prepare exactly one original current-model request for one actual judge invocation.
     * @param actor - Main-owned live account/session, never model JSON.
     * @param analysisId - Private scanner invocation and call identity.
     * @param request - Original upstream inert messages; cannot select a model, Key or funding.
     * @param signal - Current turn lifetime.
     * @returns Content and provider-terminal counts after trusted request reconciliation.
     * @throws Unknown outcomes cannot dispatch again, including after a Main restart.
     */
    call(actor: SkillSafetyActor, analysisId: string, request: SkillScannerLlmRequest, signal: AbortSignal): Promise<SkillScannerLlmResponse>;
}
//# sourceMappingURL=skill-safety-text-consumer.d.ts.map