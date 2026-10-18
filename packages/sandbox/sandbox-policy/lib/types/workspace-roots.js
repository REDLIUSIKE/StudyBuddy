/** Immutable per-Session project sources shared by all file-effect consumers. */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
/** Source snapshots reject relative paths and duplicate authorities when restored. */
export const workspaceRootsSchema = z.array(z.string().refine(isAbsolute)).min(1)
    .refine(roots => new Set(roots).size === roots.length)
    .nullable();
/** Folded frozen project source list, or null for a legacy/ordinary Session. */
export const workspaceRootsStateSchema = z.object({ roots: workspaceRootsSchema, submitted: z.boolean() });
/**
 * Fold an immutable source snapshot, retaining the original on identical retries.
 * @param state - committed snapshot or null.
 * @param roots - the new event's source list.
 * @returns validated frozen sources; conflicting records reject.
 */
export function foldWorkspaceRoots(state, roots) {
    const next = workspaceRootsSchema.parse(roots);
    if (state !== null && JSON.stringify(state) !== JSON.stringify(next))
        throw new Error('Project source roots are immutable');
    return state ?? next;
}
//# sourceMappingURL=workspace-roots.js.map