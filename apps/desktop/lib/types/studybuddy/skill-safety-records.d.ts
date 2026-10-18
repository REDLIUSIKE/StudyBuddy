import type { SkillSafetyActor, SkillSafetyReport, SkillSafetyReportId } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { SkillSafetyCallStore, SkillSafetyCallRecord } from './skill-safety-text-consumer.ts';
import type { SkillScannerLlmResponse } from './skill-safety-transport.ts';
/** Atomic once-only records outside project/skill discovery; actor identity stays private. */
export declare class SkillSafetyRecords implements SkillSafetyCallStore {
    private readonly root;
    private readonly current;
    constructor(root: string, current: (actor: SkillSafetyActor) => boolean);
    private path;
    private check;
    private readValue;
    private writeOnce;
    /** Read a settled claim; an uncompleted claim remains an unknown charged outcome. */
    read(actor: SkillSafetyActor, id: string): Promise<SkillSafetyCallRecord | undefined>;
    /** Claim exactly once using an exclusive filesystem publication, including across Main restarts. */
    claim(actor: SkillSafetyActor, id: string, value: SkillSafetyCallRecord): Promise<SkillSafetyCallRecord>;
    /** Retain only a real terminal response; never recreate a lost model verdict. */
    settle(actor: SkillSafetyActor, id: string, result: SkillScannerLlmResponse): Promise<void>;
    /** Persist the scanner's inert checked report, not assistant prose or a permission grant. */
    saveReport(actor: SkillSafetyActor, value: SkillSafetyReport): Promise<void>;
    /** Read the exact private report for its original live actor. */
    readReport(actor: SkillSafetyActor, id: SkillSafetyReportId): Promise<SkillSafetyReport>;
    /** Keep keyless source/model/terminal evidence in the private feedback-log plane. */
    audit(actor: SkillSafetyActor, value: Readonly<Record<string, unknown>>): Promise<void>;
}
//# sourceMappingURL=skill-safety-records.d.ts.map