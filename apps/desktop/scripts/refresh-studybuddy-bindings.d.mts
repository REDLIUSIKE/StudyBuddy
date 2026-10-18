/**
 * Replace every verified resource identity without overwriting unrelated source text.
 * @param text Current TypeScript pin module.
 * @param previous Identity of the existing resource manifest.
 * @param next Identity returned by the current canonical assembler.
 * @returns Updated source; stale, duplicate, missing or invalid pin fields reject.
 */
export function replaceRuntimePin(text: string, previous: Record<string, string>, next: Record<string, string>): string

/** Bind only the verified production video pin, preserving the separate development identity. */
export function replaceVideoRuntimePin(text: string, previous: Record<string, string> | null, next: Record<string, string>): string

/** Prepare canonical mode-specific resources, retaining replaced directories and rejecting conflicting pins. */
export function refreshStudyBuddyBindings(options?: {
  development?: boolean
  root?: string
  runtimeRoots?: { primaryRuntimeDirectory: string; dshDirectory: string; workspaceDirectory?: string }
}): Promise<Array<{ kind: string; manifestSha256: string; sharedRuntimeVersion: string; reused: boolean; backup?: string }>>
