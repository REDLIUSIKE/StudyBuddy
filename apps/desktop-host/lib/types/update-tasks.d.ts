/** Desktop installation admission and task inspection for the shared Web Host. */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Whether stopping the Host now would interrupt work: a generating or tool-running
 * agent (including subagents and turns waiting for approval), queued inbox
 * messages, or a running or stopping background job.
 * @param liveAgents - Current agent roster.
 * @param jobs - Job registry queried for the global roster and each agent's own jobs.
 * @returns true when any of those conditions holds.
 */
export declare function hasDesktopActiveTasks(liveAgents: ReturnType<Context['agents']['list']>, jobs: Context['jobs']): boolean;
/**
 * Register update admission on the owning Host context.
 * @param ctx - Booted Desktop profile context; disposal removes the request listener.
 * @returns Task inspector whose lock refuses new API requests, drains admitted requests, and rechecks work.
 */
export declare function installDesktopUpdateTaskControl(ctx: Context): (action: 'inspect' | 'lock' | 'unlock') => Promise<boolean>;
//# sourceMappingURL=update-tasks.d.ts.map