/** Quit-time inspection of interruptible work and armed scheduled reminders for the Electron shell. */
import { hasDesktopActiveTasks } from "./update-tasks.js";
/**
 * Register the quit inspector on the owning Host context.
 * @param ctx - Booted Desktop profile context; disposal makes the inspector reject.
 * @returns Inspector reporting active tasks together with armed reminders of the loaded sessions
 *   (the `schedule` family of `workspace/session-activity`); reminders in sessions that were never
 *   loaded during this run cannot fire and are not counted.
 */
export function installDesktopQuitInspection(ctx) {
    let stopped = false;
    ctx.effect(() => () => { stopped = true; });
    return async () => {
        if (stopped)
            throw new Error('desktop quit: Host is stopping');
        const agents = ctx.get('agents');
        const jobs = ctx.get('jobs');
        if (agents === undefined || jobs === undefined)
            throw new Error('desktop quit: task services are unavailable');
        const liveAgents = agents.list();
        const activeTasks = hasDesktopActiveTasks(liveAgents, jobs);
        let scheduledTasks = false;
        for (const agent of liveAgents) {
            const activity = await ctx.waterfall('workspace/session-activity', { sessionId: agent.id }, () => Promise.resolve([]));
            if (activity.some(entry => entry.kind === 'schedule')) {
                scheduledTasks = true;
                break;
            }
        }
        return { activeTasks, scheduledTasks };
    };
}
//# sourceMappingURL=quit-inspection.js.map