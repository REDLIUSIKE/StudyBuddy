/** Materialize reviewed compiled research outputs against Desktop's shared runtime.
 * @param options - Canonical source, new candidate and Main-selected runtime roots.
 * @returns Exact candidate/source/lock pins without changing the active resource pin. */
export function prepareResearchRuntime(options: {
  sourceDirectory: string;
  outputDirectory: string;
  primaryRuntimeDirectory: string;
  dshDirectory: string;
  /** Canonical workspace only when Main explicitly selects development package junctions. */
  workspaceDirectory?: string;
  /** New external directory for reviewed source maps, proofs and their production-manifest binding. */
  debugDirectory?: string;
}): Promise<{
  manifestSha256: string;
  sourceCommit: string;
  sourceDigest: string;
  lockDigest: string;
}>;

/** Discover the sealed profile's compiled import graph and conservative runtime package scopes.
 * @param dshDirectory - Main-selected shared installation.
 * @returns Portable scopes and reviewed nonliteral import sites, without copying packages. */
export function discoverResearchDshScopes(dshDirectory: string, profile?: 'research' | 'aigc'): Promise<{
  scopes: Array<{ packageName: string; path: string; entries: string[] }>;
  inputs: Array<{ path: string; size: number; sha256: string }>;
  resolutions: Array<{ from: string; packageName: string; to: string }>;
  dynamicImports: Array<{ packageName: string; path: string; sha256: string; mode: string; expression: string; offset: number }>;
  excludedCommands: Array<{ path: string; sha256: string; specifier: string; mode: string; command: string }>;
}>;
