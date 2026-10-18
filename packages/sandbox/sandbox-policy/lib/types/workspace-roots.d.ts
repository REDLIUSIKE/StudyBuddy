import { z } from 'zod';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * Exact project source roots captured before the first submission; primary cwd first.
         * @param data - immutable canonical directories, including the primary.
         */
        'sandbox/workspace-roots': {
            roots: string[];
        };
    }
}
/** Source snapshots reject relative paths and duplicate authorities when restored. */
export declare const workspaceRootsSchema: z.ZodNullable<z.ZodArray<z.ZodString>>;
/** Folded frozen project source list, or null for a legacy/ordinary Session. */
export declare const workspaceRootsStateSchema: z.ZodObject<{
    roots: z.ZodNullable<z.ZodArray<z.ZodString>>;
    submitted: z.ZodBoolean;
}, z.core.$strip>;
/** Immutable roots plus the first-submission guard, folded from the same Session. */
export type WorkspaceRootsState = z.infer<typeof workspaceRootsStateSchema>;
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /** First committed project-source snapshot; subsequent replacements are invalid. */
        workspaceRoots: WorkspaceRootsState;
    }
}
/**
 * Fold an immutable source snapshot, retaining the original on identical retries.
 * @param state - committed snapshot or null.
 * @param roots - the new event's source list.
 * @returns validated frozen sources; conflicting records reject.
 */
export declare function foldWorkspaceRoots(state: string[] | null, roots: readonly string[]): string[] | null;
//# sourceMappingURL=workspace-roots.d.ts.map