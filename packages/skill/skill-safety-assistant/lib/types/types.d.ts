/** Keyless skill safety values shared by native tools and presentation. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
/** Identity of one accepted feature request. */
export type SkillSafetyRequestId = Branded<'SkillSafetyRequestId'>;
/** Identity of one source lookup and its candidates. */
export type SkillSafetyJobId = Branded<'SkillSafetyJobId'>;
/** Identity of one exact source candidate. */
export type SkillSafetyCandidateId = Branded<'SkillSafetyCandidateId'>;
/** Identity of the snapshotted bytes. */
export type SkillSafetyArtifactId = Branded<'SkillSafetyArtifactId'>;
/** Identity of one native scan or installation confirmation. */
export type SkillSafetyIntentId = Branded<'SkillSafetyIntentId'>;
/** Identity of a scanner result. */
export type SkillSafetyReportId = Branded<'SkillSafetyReportId'>;
/** Identity of one new-skill installation. */
export type SkillSafetyOperationId = Branded<'SkillSafetyOperationId'>;
/** Scope derived from a live native root, never from tool JSON. */
export interface SkillSafetyActor {
    readonly accountId: string;
    readonly generation: number;
    readonly sessionId: SessionId;
}
/** Live caller and cancellation retained for native questions. */
export interface SkillSafetyInvocation {
    readonly agent: Agent;
    readonly actor: SkillSafetyActor;
    readonly signal: AbortSignal;
}
/** Project and native session opened by the Labs entry. */
export interface SkillSafetySessionRef {
    readonly workspaceId: WorkspaceId;
    readonly sessionId: SessionId;
}
/** Display metadata; only the private native owner can resolve the locator. */
export interface SkillSafetyCandidate {
    readonly candidateId: SkillSafetyCandidateId;
    readonly kind: 'installed' | 'github';
    readonly displayName: string;
    readonly purpose: string;
    readonly sourceLabel: string;
    readonly sourceUrl?: string | undefined;
}
/** Actionable failure without paths, credentials, or private exception causes. */
export interface SkillSafetyFailure {
    readonly code: string;
    readonly action: 'retry' | 'choose-source' | 'choose-model' | 'cancel' | 'contact-support';
}
/** Incomplete inventory is distinct from a complete no-match. */
export interface SkillSafetyCandidateSet {
    readonly jobId: SkillSafetyJobId;
    readonly status: 'matches' | 'no-match' | 'incomplete' | 'failed';
    readonly candidates: readonly SkillSafetyCandidate[];
    readonly failure?: SkillSafetyFailure | undefined;
}
/** Snapshot identity without its private staging path. */
export interface SkillSafetyArtifactView {
    readonly artifactId: SkillSafetyArtifactId;
    readonly jobId: SkillSafetyJobId;
    readonly sourceKind: 'installed' | 'github';
    readonly revision: string;
    readonly digest: string;
    readonly fileCount: number;
    readonly byteLength: number;
}
/** Severity normalized without discarding the scanner's label. */
export type SkillSafetySeverity = 'none' | 'info' | 'low' | 'medium' | 'high' | 'critical';
/** Inert, redacted finding from the pinned upstream scanner. */
export interface SkillSafetyFinding {
    readonly ruleId: string;
    readonly severity: SkillSafetySeverity;
    readonly originalSeverity: string;
    readonly title: string;
    readonly evidence: string;
    readonly relativePath?: string | undefined;
    /** Original upstream fields, with private paths and secrets redacted; inert evidence only. */
    readonly original?: Readonly<Record<string, unknown>> | undefined;
}
/** Execution and coverage remain separate from severity. */
export interface SkillSafetyReport {
    readonly reportId: SkillSafetyReportId;
    readonly artifactId: SkillSafetyArtifactId;
    readonly artifactDigest: string;
    readonly configDigest: string;
    readonly scannerIdentity: string;
    readonly modelIdentity: string;
    readonly status: 'complete' | 'partial' | 'failed' | 'cancelled';
    readonly findings: readonly SkillSafetyFinding[];
    readonly maxSeverity: SkillSafetySeverity;
    readonly eligible: boolean;
    readonly reviewRequired: boolean;
    readonly failure?: SkillSafetyFailure | undefined;
}
/** Readback receipt for this operation's new writes; no replacement or undo. */
export interface SkillSafetyInstallReceipt {
    readonly operationId: SkillSafetyOperationId;
    readonly jobId: SkillSafetyJobId;
    readonly status: 'installed' | 'conflict' | 'unknown';
    readonly writesManifestDigest: string;
    readonly readbackDigest?: string | undefined;
}
/** Local opening guidance, never a separate conversation/workflow store. */
export interface SkillSafetyPresentation {
    readonly sessionId: SessionId;
    readonly guide: boolean;
}
/** Closed model operations; identity, approval and paths are never arguments. */
export type SkillSafetyCommand = {
    readonly kind: 'find';
    readonly requestId: SkillSafetyRequestId;
    readonly query: string;
} | {
    readonly kind: 'prepare-scanner';
    readonly requestId: SkillSafetyRequestId;
} | {
    readonly kind: 'scan';
    readonly requestId: SkillSafetyRequestId;
    readonly jobId: SkillSafetyJobId;
    readonly candidateId: SkillSafetyCandidateId;
} | {
    readonly kind: 'install';
    readonly requestId: SkillSafetyRequestId;
    readonly reportId: SkillSafetyReportId;
};
/** Real outcome of one corresponding operation. */
export interface SkillSafetyScannerReady {
    readonly status: 'ready';
    readonly target: 'win32-x64';
    readonly scannerVersion: '2.2.2';
    readonly manifestSha256: string;
}
/** Real outcome of one corresponding operation. */
export type SkillSafetyResult = {
    readonly kind: 'candidates';
    readonly value: SkillSafetyCandidateSet;
} | {
    readonly kind: 'scanner-ready';
    readonly value: SkillSafetyScannerReady;
} | {
    readonly kind: 'report';
    readonly value: SkillSafetyReport;
} | {
    readonly kind: 'receipt';
    readonly value: SkillSafetyInstallReceipt;
};
/** Minimal durable effect identity; pending/unknown never authorize retries. */
export interface SkillSafetyOperationRecord {
    readonly requestId: SkillSafetyRequestId;
    readonly operation: SkillSafetyCommand['kind'];
    readonly argumentDigest: string;
    readonly status: 'pending' | 'done' | 'unknown';
    readonly result?: SkillSafetyResult | undefined;
}
/** Private provider; only read-only guidance may be exposed remotely. */
export interface SkillSafetyProvider {
    /** Validate the actual live root and capture its current account scope. */
    bindRootAgent(agent: Agent): SkillSafetyActor;
    /** Execute with the actual root and owned cancellation lifetime. */
    execute(invocation: SkillSafetyInvocation, command: SkillSafetyCommand): Promise<SkillSafetyResult>;
    /** Return only the current account's guidance for the native session. */
    presentation(sessionId: SessionId): Promise<SkillSafetyPresentation>;
}
//# sourceMappingURL=types.d.ts.map