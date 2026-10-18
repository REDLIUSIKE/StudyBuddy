/** Stage-wide ownership is independent of the retained hardware-attempt interlock. */
export interface WindowsSigningStageOptions {
  stage: string
  record: (event: object) => void
  signal?: AbortSignal
  /** Test-only storage isolates independent processes from the real account's signing state. */
  stateDirectory?: string
}

/**
 * Pass current stage ownership to supervised children without mutating the caller's environment.
 * @param environment Explicit subprocess environment.
 * @returns Child environment carrying active parent ownership, or the unchanged environment outside a stage.
 */
export function windowsSigningStageEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv

/**
 * Queue one complete signing or cache-maintenance stage under the account's exclusive file handle.
 * @param options Audit sink, optional wait cancellation and isolated test storage.
 * @param operation Stage that awaits all owned children before settling.
 * @returns The stage result after releasing the handle; acquisition errors and inherited or same-chain reentry reject before the stage runs.
 */
export function withWindowsSigningStage<T>(options: WindowsSigningStageOptions, operation: () => Promise<T>): Promise<T>
