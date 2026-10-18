/** Main's closed source/model/question binding, without conversational workflow state. */
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions';
import type { SkillSafetyPreparedOperation } from '@deepseek-ai/dsh-skill-safety-assistant/provider';
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyReport, SkillSafetyReportId, SkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { SkillSafetySources } from './skill-safety-sources.ts';
import type { SkillSafetyScanner } from './skill-safety-scanner.ts';
import type { SkillSafetyInstaller } from './skill-safety-install.ts';
import type { SkillScannerDownload } from './skill-safety-download.ts';
import type { SkillScannerRelease } from './skill-safety-release.ts';
/** Real Main owners; only external boundaries are injected by unit tests. */
export interface SkillSafetyControllerOptions {
    readonly sources: Pick<SkillSafetySources, 'findSkillSources' | 'snapshotSkillSource' | 'readSkillArtifact'>;
    readonly scanner: Pick<SkillSafetyScanner, 'runSkillScan'>;
    readonly installer: Pick<SkillSafetyInstaller, 'installCheckedSkill'>;
    readonly resources: SkillScannerDownload;
    readonly release: SkillScannerRelease;
    isCurrent(actor: SkillSafetyActor): boolean;
    model(actor: SkillSafetyActor): Promise<{
        identity: string;
        label: string;
        funding: string;
    }>;
    readReport(actor: SkillSafetyActor, reportId: SkillSafetyReportId): Promise<SkillSafetyReport>;
    saveReport(actor: SkillSafetyActor, report: SkillSafetyReport): Promise<void>;
    journalRoot: string;
    maxIntents?: number;
}
/** One private controller; Native answers and current authority, not model JSON, grant effects. */
export declare class SkillSafetyController {
    private readonly options;
    private readonly intents;
    private readonly journal;
    constructor(options: SkillSafetyControllerOptions);
    /** Bind a validated request and actual source/authority before showing its native question.
     * @param actor - Private live Host account/session.
     * @param command - Strictly decoded closed operation.
     * @param signal - The calling native turn.
     * @returns A keyless per-call intent; no target body or credential. */
    preflight(actor: SkillSafetyActor, command: SkillSafetyCommand, signal: AbortSignal): Promise<SkillSafetyPreparedOperation>;
    /** Execute the still-bound command with the actual native answer.
     * @param actor - Same live owner as preflight.
     * @param prepared - Private immutable intent projection.
     * @param answer - Result of native UserQuestions, never a tool field.
     * @param signal - Turn lifetime.
     * @returns Only the actual operation result. */
    execute(actor: SkillSafetyActor, prepared: SkillSafetyPreparedOperation, answer: AskUserQuestionAnswer | undefined, signal: AbortSignal): Promise<SkillSafetyResult>;
    /** Release one actor-bound native-question intent. @param actor - Private owner. @param prepared - Its projection. */
    release(actor: SkillSafetyActor, prepared: SkillSafetyPreparedOperation): void;
    private current;
}
//# sourceMappingURL=skill-safety-controller.d.ts.map