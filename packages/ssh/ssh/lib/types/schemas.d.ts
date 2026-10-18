/** Strict JSON validation for SSH helper requests and remote observations. */
import { z } from 'zod';
import type { Branded } from '@deepseek-ai/dsh-brand';
/** Identity of one prepared or running process in its owning SSH helper. */
export type SshProcessId = Branded<'SshProcessId'>;
/** Identity of one open text iterator in its owning SSH helper. */
export type SshTextStreamId = Branded<'SshTextStreamId'>;
/** Admit a process identity from the private helper protocol. */
export declare const processIdSchema: z.ZodPipe<z.ZodUUID, z.ZodTransform<SshProcessId, string>>;
/** Admit a text iterator identity from the private helper protocol. */
export declare const textStreamIdSchema: z.ZodPipe<z.ZodUUID, z.ZodTransform<SshTextStreamId, string>>;
/** A remote POSIX absolute path; spelling is preserved until remote canonicalization. */
export declare const remotePath: z.ZodString;
/** Filesystem identity returned by the remote filesystem provider. */
export declare const targetSchema: z.ZodObject<{
    targetKey: z.ZodString;
    displayPath: z.ZodString;
}, z.core.$strict>;
/** Remote metadata observation. */
export declare const infoSchema: z.ZodObject<{
    version: z.ZodString;
    type: z.ZodEnum<{
        file: "file";
        directory: "directory";
        other: "other";
    }>;
    size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
/** Metadata that preserves a final symlink. */
export declare const pathInfoSchema: z.ZodObject<{
    version: z.ZodString;
    size: z.ZodOptional<z.ZodNumber>;
    type: z.ZodEnum<{
        file: "file";
        directory: "directory";
        other: "other";
        symlink: "symlink";
    }>;
}, z.core.$strict>;
/** A resolved file-effect policy; the remote helper owns path canonicalization. */
export declare const policySchema: z.ZodObject<{
    mode: z.ZodEnum<{
        "read-only": "read-only";
        "workspace-write": "workspace-write";
        "danger-full-access": "danger-full-access";
    }>;
    workspaceRoot: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
/** Complete directory entries. */
export declare const entriesSchema: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<{
        file: "file";
        directory: "directory";
        other: "other";
    }>;
    target: z.ZodObject<{
        targetKey: z.ZodString;
        displayPath: z.ZodString;
    }, z.core.$strict>;
    version: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>>;
/** Guarded write intent. */
export declare const intentSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"createIfAbsent">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"replaceIfVersion">;
    version: z.ZodString;
}, z.core.$strict>], "kind">;
/** Literal text edit. */
export declare const editSchema: z.ZodObject<{
    oldString: z.ZodString;
    newString: z.ZodString;
    replaceAll: z.ZodBoolean;
}, z.core.$strict>;
/** Atomic write observation. */
export declare const writeResultSchema: z.ZodObject<{
    operation: z.ZodEnum<{
        create: "create";
        update: "update";
    }>;
    version: z.ZodString;
    before: z.ZodNullable<z.ZodString>;
    after: z.ZodString;
}, z.core.$strict>;
/** Atomic edit observation. */
export declare const editResultSchema: z.ZodObject<{
    version: z.ZodString;
    before: z.ZodString;
    after: z.ZodString;
}, z.core.$strict>;
/** Explicit child environment; null encodes an environment tombstone. */
export declare const environmentSchema: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>;
/** Ordinary or terminal process requested by a trusted SSH client. */
export declare const spawnSchema: z.ZodObject<{
    argv: z.ZodArray<z.ZodString>;
    cwd: z.ZodString;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>>;
    graceMs: z.ZodNumber;
    stdio: z.ZodOptional<z.ZodObject<{
        stdin: z.ZodUnion<readonly [z.ZodLiteral<"ignore">, z.ZodLiteral<"pipe">, z.ZodObject<{
            data: z.ZodString;
        }, z.core.$strict>]>;
        stdout: z.ZodUnion<readonly [z.ZodLiteral<"pipe">, z.ZodLiteral<"inherit">, z.ZodObject<{
            maxBytes: z.ZodNumber;
            spill: z.ZodOptional<z.ZodObject<{
                maxBytes: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>]>;
        stderr: z.ZodUnion<readonly [z.ZodLiteral<"pipe">, z.ZodLiteral<"inherit">, z.ZodObject<{
            maxBytes: z.ZodNumber;
            spill: z.ZodOptional<z.ZodObject<{
                maxBytes: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>]>;
        control: z.ZodOptional<z.ZodLiteral<"pipe">>;
    }, z.core.$strict>>;
    terminal: z.ZodOptional<z.ZodObject<{
        terminalType: z.ZodString;
        rows: z.ZodNumber;
        cols: z.ZodNumber;
        shellActivity: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Connection handshake binds sockets and workspace to one helper process. */
export declare const helloSchema: z.ZodObject<{
    protocol: z.ZodLiteral<2>;
    hash: z.ZodString;
    kind: z.ZodEnum<{
        executable: "executable";
        "node-script": "node-script";
    }>;
    platform: z.ZodEnum<{
        linux: "linux";
        darwin: "darwin";
    }>;
    nodeVersion: z.ZodString;
    executable: z.ZodString;
    root: z.ZodString;
    workspace: z.ZodString;
    bootstrapHash: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
/** A prepared process publishes its sockets before target code may execute. */
export declare const streamEndpointSchema: z.ZodObject<{
    path: z.ZodString;
    capability: z.ZodString;
}, z.core.$strict>;
/** A stream capability reaches only the authenticated SSH client and its helper. */
export type SshStreamEndpoint = z.infer<typeof streamEndpointSchema>;
/** Prepared process and its independently authenticated stream endpoints. */
export declare const preparedSchema: z.ZodObject<{
    id: z.ZodPipe<z.ZodUUID, z.ZodTransform<SshProcessId, string>>;
    streams: z.ZodRecord<z.ZodEnum<{
        stdin: "stdin";
        stdout: "stdout";
        stderr: "stderr";
        control: "control";
        terminal: "terminal";
    }> & z.core.$partial, z.ZodObject<{
        path: z.ZodString;
        capability: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Direct process exit facts. */
export declare const outcomeSchema: z.ZodObject<{
    exitCode: z.ZodNullable<z.ZodNumber>;
    signal: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
/** A bounded raw tail positioned in whole-stream byte coordinates. */
export declare const outputSnapshotSchema: z.ZodObject<{
    tail: z.ZodBase64;
    totalBytes: z.ZodNumber;
}, z.core.$strict>;
/**
 * Bound one encoded tail and its RPC envelope by the declared collection budget.
 * @param maxBytes - the collector's retained raw-byte limit.
 * @returns the private snapshot frame limit, capped by the helper protocol ceiling.
 */
export declare function outputSnapshotFrameLimit(maxBytes: number): number;
/** Direct exit, retained output snapshots, and optional complete spill locations. */
export declare const doneSchema: z.ZodObject<{
    outcome: z.ZodObject<{
        exitCode: z.ZodNullable<z.ZodNumber>;
        signal: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    spills: z.ZodObject<{
        stdout: z.ZodOptional<z.ZodString>;
        stderr: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    collected: z.ZodObject<{
        stdout: z.ZodOptional<z.ZodObject<{
            tail: z.ZodBase64;
            totalBytes: z.ZodNumber;
        }, z.core.$strict>>;
        stderr: z.ZodOptional<z.ZodObject<{
            tail: z.ZodBase64;
            totalBytes: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>;
/** Remote terminal foreground observation. */
export declare const foregroundSchema: z.ZodNullable<z.ZodObject<{
    processGroupId: z.ZodNumber;
    inputWaiting: z.ZodBoolean;
}, z.core.$strict>>;
/** Conservative shell lifecycle and process observation returned by the execution provider. */
export declare const terminalActivitySchema: z.ZodObject<{
    state: z.ZodEnum<{
        unknown: "unknown";
        idle: "idle";
        busy: "busy";
    }>;
    revision: z.ZodNumber;
}, z.core.$strict>;
//# sourceMappingURL=schemas.d.ts.map