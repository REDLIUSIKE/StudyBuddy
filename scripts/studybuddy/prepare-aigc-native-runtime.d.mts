interface FileRow { path: string; size: number; sha256: string }
/** Select the closed native domain, original UI and dynamic native dependencies. */
export function selectAigcNativeFiles(rows: readonly FileRow[], packages: readonly string[]): FileRow[];
/** Verify source/build/shared bytes, then assemble a new immutable candidate without activating it. */
export function prepareAigcNativeRuntime(input: {
  sourceDirectory: string; outputDirectory: string; bunExecutable: string; primaryRuntimeDirectory: string;
  dshDirectory: string; baselineDirectory: string; workspaceDirectory?: string;
}): Promise<{ manifestSha256: string; sourceCommit: string; sourceDigest: string; lockDigest: string; files: number; bytes: number }>;
