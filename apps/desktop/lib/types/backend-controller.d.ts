/** Owns one backend startup and its quiescent teardown independently of windows. */
/** Backend availability presented by the desktop window. */
export type DesktopBackendState = {
    readonly phase: 'starting';
} | {
    readonly phase: 'ready';
}
/** `message` is the rendered text; `failure` is the original error so a crash report keeps its stack, properties, and cause. */
 | {
    readonly phase: 'error';
    readonly message: string;
    readonly failure: unknown;
};
/** Child lifecycle owned by the desktop backend controller. */
export interface DesktopBackendHost {
    /** @returns Readiness after the child accepts application requests. */
    start(): Promise<unknown>;
    /** @returns Completion of child exit. */
    stop(): Promise<void>;
}
/** Serializes retries and prevents children from outliving a closed window. */
export declare class DesktopBackendController<Host extends DesktopBackendHost> {
    private readonly createHost;
    private readonly publish;
    private current;
    private attempt;
    private pending;
    private stopping;
    private closed;
    /**
     * @param createHost - Allocate a child and route its fatal failures to the supplied callback.
     * @param publish - Receive availability changes until the controller closes.
     */
    constructor(createHost: (onFailure: (error: Error) => void) => Host, publish: (state: DesktopBackendState) => void);
    /** Current availability, including the last startup or child failure. */
    get state(): DesktopBackendState;
    /** Child available to application requests; absent during startup and teardown. */
    get host(): Host | undefined;
    /**
     * Prepare the profile and start one child; concurrent callers share the attempt.
     * @param prepare - Profile preparation that must finish before spawning.
     * @returns Completion of startup, rejecting on preparation, startup, or cleanup failure.
     */
    start(prepare: () => Promise<void>): Promise<void>;
    /**
     * Stop pending preparation and the child before allowing another start.
     * @returns Completion of pending work and child exit; rejects if cleanup fails.
     */
    stop(): Promise<void>;
    /**
     * Permanently prevent startup and suppress further availability notifications.
     * @returns Completion of pending work and child exit; rejects if cleanup fails.
     */
    close(): Promise<void>;
    private cleanup;
    private failed;
    private update;
}
//# sourceMappingURL=backend-controller.d.ts.map