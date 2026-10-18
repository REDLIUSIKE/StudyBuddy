/** Immutable per-Session project sources shared by all file-effect consumers. */
import { isAbsolute } from 'node:path'
import { z } from 'zod'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Exact project source roots captured before the first submission; primary cwd first.
     * @param data - immutable canonical directories, including the primary.
     */
    'sandbox/workspace-roots': { roots: string[] }
  }
}

/** Source snapshots reject relative paths and duplicate authorities when restored. */
export const workspaceRootsSchema = z.array(z.string().refine(isAbsolute)).min(1)
  .refine(roots => new Set(roots).size === roots.length)
  .nullable()

/** Folded frozen project source list, or null for a legacy/ordinary Session. */
export const workspaceRootsStateSchema = z.object({ roots: workspaceRootsSchema, submitted: z.boolean() })

/** Immutable roots plus the first-submission guard, folded from the same Session. */
export type WorkspaceRootsState = z.infer<typeof workspaceRootsStateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** First committed project-source snapshot; subsequent replacements are invalid. */
    workspaceRoots: WorkspaceRootsState
  }
}

/**
 * Fold an immutable source snapshot, retaining the original on identical retries.
 * @param state - committed snapshot or null.
 * @param roots - the new event's source list.
 * @returns validated frozen sources; conflicting records reject.
 */
export function foldWorkspaceRoots(state: string[] | null, roots: readonly string[]): string[] | null {
  const next = workspaceRootsSchema.parse(roots)
  if (state !== null && JSON.stringify(state) !== JSON.stringify(next)) throw new Error('Project source roots are immutable')
  return state ?? next
}
