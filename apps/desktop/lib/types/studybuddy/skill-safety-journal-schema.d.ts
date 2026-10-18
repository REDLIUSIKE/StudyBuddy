/** Strict private effect records, without conversational workflow state. */
import { z } from 'zod';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SkillSafetyArtifactId, SkillSafetyCandidateId, SkillSafetyJobId, SkillSafetyOperationId, SkillSafetyReportId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types';
/** Bounded keyless operation outcomes decoded at durable/process boundaries. */
export declare const skillSafetyResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"scanner-ready">;
    value: z.ZodObject<{
        status: z.ZodLiteral<"ready">;
        target: z.ZodLiteral<"win32-x64">;
        scannerVersion: z.ZodLiteral<"2.2.2">;
        manifestSha256: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"candidates">;
    value: z.ZodObject<{
        jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
        status: z.ZodEnum<{
            failed: "failed";
            incomplete: "incomplete";
            matches: "matches";
            "no-match": "no-match";
        }>;
        candidates: z.ZodArray<z.ZodObject<{
            candidateId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyCandidateId, string>>;
            kind: z.ZodEnum<{
                installed: "installed";
                github: "github";
            }>;
            displayName: z.ZodString;
            purpose: z.ZodString;
            sourceLabel: z.ZodString;
            sourceUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        failure: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            action: z.ZodEnum<{
                cancel: "cancel";
                retry: "retry";
                "choose-source": "choose-source";
                "choose-model": "choose-model";
                "contact-support": "contact-support";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"report">;
    value: z.ZodObject<{
        reportId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyReportId, string>>;
        artifactId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyArtifactId, string>>;
        artifactDigest: z.ZodString;
        configDigest: z.ZodString;
        scannerIdentity: z.ZodString;
        modelIdentity: z.ZodString;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            failed: "failed";
            complete: "complete";
            partial: "partial";
        }>;
        findings: z.ZodArray<z.ZodObject<{
            ruleId: z.ZodString;
            severity: z.ZodEnum<{
                none: "none";
                info: "info";
                high: "high";
                low: "low";
                medium: "medium";
                critical: "critical";
            }>;
            originalSeverity: z.ZodString;
            title: z.ZodString;
            evidence: z.ZodString;
            relativePath: z.ZodOptional<z.ZodString>;
            original: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strict>>;
        maxSeverity: z.ZodEnum<{
            none: "none";
            info: "info";
            high: "high";
            low: "low";
            medium: "medium";
            critical: "critical";
        }>;
        eligible: z.ZodBoolean;
        reviewRequired: z.ZodBoolean;
        failure: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            action: z.ZodEnum<{
                cancel: "cancel";
                retry: "retry";
                "choose-source": "choose-source";
                "choose-model": "choose-model";
                "contact-support": "contact-support";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"receipt">;
    value: z.ZodObject<{
        operationId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyOperationId, string>>;
        jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
        status: z.ZodEnum<{
            unknown: "unknown";
            conflict: "conflict";
            installed: "installed";
        }>;
        writesManifestDigest: z.ZodString;
        readbackDigest: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>], "kind">;
/** Version two is used only in the feature's private root, never Session data. */
export declare const skillSafetyJournalSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    accountId: z.ZodString;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    requests: z.ZodRecord<z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>, z.ZodObject<{
        generation: z.ZodNumber;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        operation: z.ZodEnum<{
            find: "find";
            install: "install";
            "prepare-scanner": "prepare-scanner";
            scan: "scan";
        }>;
        argumentDigest: z.ZodString;
        status: z.ZodEnum<{
            done: "done";
            pending: "pending";
            unknown: "unknown";
        }>;
        result: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"scanner-ready">;
            value: z.ZodObject<{
                status: z.ZodLiteral<"ready">;
                target: z.ZodLiteral<"win32-x64">;
                scannerVersion: z.ZodLiteral<"2.2.2">;
                manifestSha256: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"candidates">;
            value: z.ZodObject<{
                jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
                status: z.ZodEnum<{
                    failed: "failed";
                    incomplete: "incomplete";
                    matches: "matches";
                    "no-match": "no-match";
                }>;
                candidates: z.ZodArray<z.ZodObject<{
                    candidateId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyCandidateId, string>>;
                    kind: z.ZodEnum<{
                        installed: "installed";
                        github: "github";
                    }>;
                    displayName: z.ZodString;
                    purpose: z.ZodString;
                    sourceLabel: z.ZodString;
                    sourceUrl: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                failure: z.ZodOptional<z.ZodObject<{
                    code: z.ZodString;
                    action: z.ZodEnum<{
                        cancel: "cancel";
                        retry: "retry";
                        "choose-source": "choose-source";
                        "choose-model": "choose-model";
                        "contact-support": "contact-support";
                    }>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"report">;
            value: z.ZodObject<{
                reportId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyReportId, string>>;
                artifactId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyArtifactId, string>>;
                artifactDigest: z.ZodString;
                configDigest: z.ZodString;
                scannerIdentity: z.ZodString;
                modelIdentity: z.ZodString;
                status: z.ZodEnum<{
                    cancelled: "cancelled";
                    failed: "failed";
                    complete: "complete";
                    partial: "partial";
                }>;
                findings: z.ZodArray<z.ZodObject<{
                    ruleId: z.ZodString;
                    severity: z.ZodEnum<{
                        none: "none";
                        info: "info";
                        high: "high";
                        low: "low";
                        medium: "medium";
                        critical: "critical";
                    }>;
                    originalSeverity: z.ZodString;
                    title: z.ZodString;
                    evidence: z.ZodString;
                    relativePath: z.ZodOptional<z.ZodString>;
                    original: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                }, z.core.$strict>>;
                maxSeverity: z.ZodEnum<{
                    none: "none";
                    info: "info";
                    high: "high";
                    low: "low";
                    medium: "medium";
                    critical: "critical";
                }>;
                eligible: z.ZodBoolean;
                reviewRequired: z.ZodBoolean;
                failure: z.ZodOptional<z.ZodObject<{
                    code: z.ZodString;
                    action: z.ZodEnum<{
                        cancel: "cancel";
                        retry: "retry";
                        "choose-source": "choose-source";
                        "choose-model": "choose-model";
                        "contact-support": "contact-support";
                    }>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"receipt">;
            value: z.ZodObject<{
                operationId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyOperationId, string>>;
                jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
                status: z.ZodEnum<{
                    unknown: "unknown";
                    conflict: "conflict";
                    installed: "installed";
                }>;
                writesManifestDigest: z.ZodString;
                readbackDigest: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>], "kind">>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Fully validated private document. */
export type SkillSafetyJournalDocument = z.infer<typeof skillSafetyJournalSchema>;
//# sourceMappingURL=skill-safety-journal-schema.d.ts.map