/** Login-shell environment for POSIX Desktop launches that inherit only the session manager's environment. */
/** Validated login-shell read settings. */
export interface DesktopLoginShellConfig {
    /** Deadline for each candidate shell, in milliseconds. */
    readonly timeoutMs: number;
}
/** One candidate shell that did not produce an environment. */
export interface DesktopLoginShellFailure {
    readonly shell: string;
    /**
     * `exit <code>`, terminating signal name, spawn error, `timeout`, `aborted`, or `unparsed`
     * for output without both delimiters.
     */
    readonly reason: string;
}
/** Environment for the Host and the candidate failures that preceded it. */
export interface DesktopLoginShellResult {
    /** `base` merged with the first successful shell's variables, or `base` itself when none succeeded. */
    readonly environment: NodeJS.ProcessEnv;
    readonly failures: readonly DesktopLoginShellFailure[];
}
/** Inputs of {@link readDesktopLoginShellEnvironment} that callers other than tests leave unset. */
export interface DesktopLoginShellReadOptions {
    /** Operating system running Desktop; defaults to `process.platform`. */
    readonly platform?: NodeJS.Platform;
    /** Candidates in trial order; defaults to {@link loginShellCandidates}. */
    readonly shells?: readonly string[];
    /** Aborting kills the running candidate's process group and skips the remaining candidates. */
    readonly signal?: AbortSignal;
}
/**
 * Resolve login-shell read settings.
 * @param env - Desktop process environment.
 * @returns Validated per-candidate deadline; `DSH_DESKTOP_LOGIN_SHELL_TIMEOUT_MS` defaults to 10000.
 */
export declare function resolveDesktopLoginShellConfig(env: NodeJS.ProcessEnv): DesktopLoginShellConfig;
/**
 * Candidate shells in order: the account record's login shell (not `$SHELL`), then fixed system shells.
 * @returns Distinct absolute candidates; only the fixed shells when the account record is unreadable or empty.
 */
export declare function loginShellCandidates(): readonly string[];
/**
 * Extract the variables printed between the two delimiters of the dump command.
 * @param stdout - Probe output, including anything rc files printed around the dump.
 * @returns Variables, or undefined when both delimiters are not present.
 */
export declare function parseLoginShellOutput(stdout: string): Record<string, string> | undefined;
/**
 * Overlay login-shell variables on the inherited environment; shell values win except for
 * probe-session variables and launcher-owned `DSH_*` / `ELECTRON_*` names.
 * @param base - Environment Desktop inherited.
 * @param shell - Variables printed by the login shell.
 * @returns A new environment; neither argument is modified.
 */
export declare function mergeLoginShellEnvironment(base: NodeJS.ProcessEnv, shell: Readonly<Record<string, string>>): NodeJS.ProcessEnv;
/**
 * Read the user's login-shell environment once; Windows GUI launches already inherit the registry
 * environment, so `win32` returns `base` unchanged. Never rejects: each failing candidate is
 * recorded and the next one tried, and `base` is returned when all fail or the read is aborted.
 * @param base - Environment Desktop inherited.
 * @param config - Validated read settings.
 * @param options - Platform, candidates, and cancellation.
 * @returns Host environment and the candidate failures that preceded it.
 */
export declare function readDesktopLoginShellEnvironment(base: NodeJS.ProcessEnv, config: DesktopLoginShellConfig, options?: DesktopLoginShellReadOptions): Promise<DesktopLoginShellResult>;
//# sourceMappingURL=login-shell-environment.d.ts.map