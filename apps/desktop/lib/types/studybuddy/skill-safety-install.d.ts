/** New-only installation of the immutable scanned bytes; no replacement, hook execution or custom undo. */
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyInstallReceipt, SkillSafetyReport, SkillSafetyReportId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import { type SkillSafetyPrivateArtifact } from './skill-safety-artifacts.ts';
/** Fixed profile/private roots and actual native readback boundaries. */
export interface SkillSafetyInstallOptions {
    readonly userRoot: string;
    readonly privateRoot: string;
    isCurrent(actor: SkillSafetyActor): boolean;
    readReport(actor: SkillSafetyActor, id: SkillSafetyReportId): Promise<SkillSafetyReport>;
    readArtifact(actor: SkillSafetyActor, id: SkillSafetyArtifactId): Promise<SkillSafetyPrivateArtifact>;
    registryReadback(actor: SkillSafetyActor, name: string, directory: string, digest: string): Promise<boolean>;
}
/** Main owns the filesystem and minimal durable effect identity. */
export declare class SkillSafetyInstaller {
    private readonly options;
    private readonly userRoot;
    private readonly privateRoot;
    private tail;
    constructor(options: SkillSafetyInstallOptions);
    /**
     * Install a new eligible source with current scope and full byte/readback checks.
     * @param actor - Live native owner, never a model-provided account.
     * @param requestId - Stable effect identity used for a lost reply.
     * @param reportId - Private real report, not a caller-supplied verdict.
     * @param signal - Native question/turn lifetime.
     * @returns New writes/readback, conflict or uncertainty; never replacement.
     */
    installCheckedSkill(actor: SkillSafetyActor, requestId: SkillSafetyRequestId, reportId: SkillSafetyReportId, signal: AbortSignal): Promise<SkillSafetyInstallReceipt>;
    private install;
}
//# sourceMappingURL=skill-safety-install.d.ts.map