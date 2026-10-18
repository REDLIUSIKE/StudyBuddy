/** Closed, bounded private Host–Main messages; no live Agent, path or credential. */
import { z } from 'zod';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyRequestId, SkillSafetyJobId, SkillSafetyCandidateId, SkillSafetyReportId, SkillSafetyArtifactId, SkillSafetyOperationId, SkillSafetyResult } from './types.ts';
import type { SkillSafetyPreparedOperation } from './provider.ts';
declare const context: z.ZodObject<{
    hostGeneration: z.ZodString;
    actor: z.ZodObject<{
        accountId: z.ZodString;
        generation: z.ZodNumber;
        sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
declare const operation: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"preflight">;
    command: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"find">;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        query: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"prepare-scanner">;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"scan">;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
        candidateId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyCandidateId, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"install">;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        reportId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyReportId, string>>;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"execute">;
    prepared: z.ZodObject<{
        intentId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyIntentId, string>>;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        argumentDigest: z.ZodString;
        question: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            header: z.ZodOptional<z.ZodString>;
            question: z.ZodString;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    answer: z.ZodOptional<z.ZodObject<{
        answers: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            selected: z.ZodArray<z.ZodString>;
            custom: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"release">;
    prepared: z.ZodObject<{
        intentId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyIntentId, string>>;
        requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        argumentDigest: z.ZodString;
        question: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            header: z.ZodOptional<z.ZodString>;
            question: z.ZodString;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>], "kind">;
declare const invocation: z.ZodObject<{
    rpcId: z.ZodString;
    context: z.ZodObject<{
        hostGeneration: z.ZodString;
        actor: z.ZodObject<{
            accountId: z.ZodString;
            generation: z.ZodNumber;
            sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    operation: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"preflight">;
        command: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"find">;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
            query: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"prepare-scanner">;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"scan">;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
            jobId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyJobId, string>>;
            candidateId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyCandidateId, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"install">;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
            reportId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyReportId, string>>;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"execute">;
        prepared: z.ZodObject<{
            intentId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyIntentId, string>>;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
            argumentDigest: z.ZodString;
            question: z.ZodOptional<z.ZodObject<{
                id: z.ZodString;
                header: z.ZodOptional<z.ZodString>;
                question: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        answer: z.ZodOptional<z.ZodObject<{
            answers: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                selected: z.ZodArray<z.ZodString>;
                custom: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"release">;
        prepared: z.ZodObject<{
            intentId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyIntentId, string>>;
            requestId: z.ZodPipe<z.ZodString, z.ZodTransform<SkillSafetyRequestId, string>>;
            argumentDigest: z.ZodString;
            question: z.ZodOptional<z.ZodObject<{
                id: z.ZodString;
                header: z.ZodOptional<z.ZodString>;
                question: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>;
/** One strict decoder for durable records and private process results. */
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
            matches: "matches";
            "no-match": "no-match";
            incomplete: "incomplete";
            failed: "failed";
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
                retry: "retry";
                "choose-source": "choose-source";
                "choose-model": "choose-model";
                cancel: "cancel";
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
                low: "low";
                medium: "medium";
                high: "high";
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
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        eligible: z.ZodBoolean;
        reviewRequired: z.ZodBoolean;
        failure: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            action: z.ZodEnum<{
                retry: "retry";
                "choose-source": "choose-source";
                "choose-model": "choose-model";
                cancel: "cancel";
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
            installed: "installed";
            conflict: "conflict";
            unknown: "unknown";
        }>;
        writesManifestDigest: z.ZodString;
        readbackDigest: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>], "kind">;
/** Exact private invocation projection. */
export type SkillSafetyWireInvocation = z.infer<typeof invocation>;
/** Private admitted actor and current native Host generation. */
export type SkillSafetyWireContext = z.infer<typeof context>;
/** Operations accepted only from the private live Host. */
export type SkillSafetyWireOperation = z.infer<typeof operation>;
/** Decode the private native actor, never model arguments. @param value - Bounded IPC value. */
export declare function parseSkillSafetyActor(value: unknown): SkillSafetyActor;
/** Decode one closed command. @param value - Tool/IPC data with no extra fields. */
export declare function parseSkillSafetyCommand(value: unknown): SkillSafetyCommand;
/** Decode the private prepared projection. @param value - Main reply. */
export declare function parseSkillSafetyPrepared(value: unknown): SkillSafetyPreparedOperation;
/** Decode one private Host message. @param value - Native child IPC data. */
export declare function parseSkillSafetyInvocation(value: unknown): SkillSafetyWireInvocation;
/** Decode a scope-bound cancellation context. @param value - Native child IPC data. */
export declare function parseSkillSafetyContext(value: unknown): SkillSafetyWireContext;
/** Decode actual effects without unknown extra fields. @param value - Main result. */
export declare function parseSkillSafetyResult(value: unknown): SkillSafetyResult;
export {};
//# sourceMappingURL=wire.d.ts.map