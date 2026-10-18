/**
 * Start the packaged Windows application with the existing StudyBuddy profile and quit normally.
 * @param executable Packaged StudyBuddy executable.
 * @param resources Packaged Electron resources directory.
 * @param options Bounded cold-start deadline; does not relax profile, window, or normal-exit checks.
 * @returns Resolves after the real Main process opens a ready window and exits with code zero.
 */
export function smokePackagedMain(executable: string, resources: string, options?: { startupTimeoutMs?: number }): Promise<void>
