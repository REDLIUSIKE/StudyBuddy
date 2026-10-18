/** Profile-owned source and allocation metadata; no Session transcripts are stored here. */
import { z } from 'zod';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ProjectRequestId, WorkspaceId, WorkspaceSourceId } from '@deepseek-ai/dsh-workspace/types';
declare const allocation: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"project">;
    fingerprint: z.ZodString;
    workspaceId: z.ZodPipe<z.ZodString, z.ZodTransform<WorkspaceId, string>>;
    title: z.ZodString;
    sourceFolders: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodPipe<z.ZodString, z.ZodTransform<WorkspaceSourceId, string>>;
        path: z.ZodString;
    }, z.core.$strip>>;
    primarySourceId: z.ZodPipe<z.ZodString, z.ZodTransform<WorkspaceSourceId, string>>;
    managed: z.ZodOptional<z.ZodObject<{
        path: z.ZodString;
        ready: z.ZodBoolean;
    }, z.core.$strip>>;
    committed: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"chat">;
    fingerprint: z.ZodLiteral<"chat">;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    managed: z.ZodObject<{
        path: z.ZodString;
        ready: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>], "kind">;
/** Exact allocation intent retained across lost replies or partial preparation. */
export type ProjectAllocation = z.infer<typeof allocation>;
/** Data lives in the existing profile's StorageDomain route, not browser storage. */
export declare const projectDirectorySpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            namespace: z.ZodNullable<z.ZodUUID>;
        }, z.core.$strip>;
        initial: {
            namespace: null;
        };
    };
    tables: {
        sources: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<WorkspaceSourceId, {
            sourceId: WorkspaceSourceId;
            path: string;
        }>;
        allocations: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ProjectRequestId, {
            kind: "project";
            fingerprint: string;
            workspaceId: WorkspaceId;
            title: string;
            sourceFolders: {
                sourceId: WorkspaceSourceId;
                path: string;
            }[];
            primarySourceId: WorkspaceSourceId;
            committed: boolean;
            managed?: {
                path: string;
                ready: boolean;
            } | undefined;
        } | {
            kind: "chat";
            fingerprint: "chat";
            sessionId: SessionId;
            managed: {
                path: string;
                ready: boolean;
            };
        }>;
    };
};
export {};
//# sourceMappingURL=project-directory-spec.d.ts.map