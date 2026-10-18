/** Quit-time inspection of interruptible work and armed scheduled reminders for the Electron shell. */
import type { Context } from '@deepseek-ai/cordis';
/** What quitting the Host now would affect. */
export interface DesktopQuitInspection {
    /** Work the shared update-restart check also counts: running agents, queued messages, live jobs. */
    readonly activeTasks: boolean;
    /** A loaded session holds a scheduled reminder whose timer is armed in this process. */
    readonly scheduledTasks: boolean;
}
/**
 * Register the quit inspector on the owning Host context.
 * @param ctx - Booted Desktop profile context; disposal makes the inspector reject.
 * @returns Inspector reporting active tasks together with armed reminders of the loaded sessions
 *   (the `schedule` family of `workspace/session-activity`); reminders in sessions that were never
 *   loaded during this run cannot fire and are not counted.
 */
export declare function installDesktopQuitInspection(ctx: Context): () => Promise<DesktopQuitInspection>;
//# sourceMappingURL=quit-inspection.d.ts.map