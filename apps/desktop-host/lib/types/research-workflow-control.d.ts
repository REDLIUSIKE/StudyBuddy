/** Private workflow definitions and script sources are checked against the real native caller. */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
import type { NativeResearchAdvanced } from './research-advanced.ts';
import type { FrozenResearchScheduleTarget } from './research-schedules.ts';
import type { NativeResearchWorkflowHost } from './research-workflow-host.ts';
/** Read exactly one workflow fence in the actual native reply which issued this tool call. */
export declare function replyWorkflowFromEvents(events: readonly SessionEvent[], callId: string): string;
/** No renderer or model JSON chooses the native caller, model route or permission ceiling. */
export declare class NativeResearchWorkflowControl {
    private readonly ctx;
    private readonly advanced;
    private readonly host?;
    constructor(ctx: Context, advanced: NativeResearchAdvanced, host?: Pick<NativeResearchWorkflowHost, "command"> | undefined);
    proveCaller(context: HarnessResearchContextV1, caller: string): Promise<import("@deepseek-ai/dsh-agent").Agent>;
    command(context: HarnessResearchContextV1, value: unknown, caller?: string): Promise<unknown>;
    /** Recheck a prepared target before persisting a timer, retaining the exact definition bytes. */
    freeze(context: HarnessResearchContextV1, value: unknown): Promise<FrozenResearchScheduleTarget>;
}
//# sourceMappingURL=research-workflow-control.d.ts.map