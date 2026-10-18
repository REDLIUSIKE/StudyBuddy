/** Preloads required by the embedded Main consumers. */
export const STUDYBUDDY_PACKAGE_PRELOADS: readonly string[]

/** Independent source stamp carried by the prepared AIGC and research resources. */
export interface PreparedSourceIdentity { readonly sourceCommit: string; readonly sourceDigest: string; readonly lockDigest: string }
/**
 * Reject stale independent resource source identities.
 * @param prepared Prepared producer identity.
 * @param current Current producer source identity.
 * @param name Producer named in the failure.
 * @returns Nothing; invalid or changed identity throws.
 */
export function assertPreparedSourceIdentity(prepared: PreparedSourceIdentity, current: PreparedSourceIdentity, name: string): void

/**
 * Read the current Git working-tree and lock identities used by a resource producer.
 * @param directory Independent producer repository.
 * @param locks Repository-relative lockfiles whose bytes define the dependency identity.
 * @returns Current commit, source digest, and combined lock digest.
 */
export function producerSourceIdentity(directory: string, locks: readonly string[], options?: { fileRows?: boolean }): Promise<PreparedSourceIdentity>
/**
 * Bind prepared resources to canonical independent source inputs.
 * @param repositoryRoot Shared Harness source checkout with its parent source inventory.
 * @returns Resolves after source/lock identities and native producer bytes match.
 */
export function verifyStudyBuddyPackageSources(repositoryRoot: string): Promise<void>

/**
 * Reject files or directories outside the verified business manifest.
 * @param directory Verified business resource directory.
 * @param files Verified manifest inventory.
 * @returns Resolves only for the exact inventory; links, extras and omissions reject.
 */
export function assertBusinessPackageInventory(directory: string, files: Readonly<Record<string, string>>): Promise<void>

/**
 * Validate all independent embedded resource producers, including the formal video and shared runtime.
 * @param directory Source `.dsh-build` or assembled Electron resources directory.
 * @returns Resolves after complete inventory and hash verification.
 */
export function verifyStudyBuddyPackageResources(directory: string, sharedRuntime?: { primaryRuntimeDirectory: string; dshDirectory: string }): Promise<void>

/**
 * Verify real ASAR preload entries against compiled source bytes.
 * @param appDirectory Desktop build source directory.
 * @param resourcesDirectory Assembled Electron resources directory.
 * @param names Required compiled preload names; defaults to the embedded consumer set.
 * @returns Resolves only for unchanged, non-linked preload entries.
 */
export function verifyPackagedStudyBuddyPreloads(appDirectory: string, resourcesDirectory: string, names?: readonly string[]): Promise<void>
