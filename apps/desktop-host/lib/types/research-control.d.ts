/** Closed Main-to-Host operations for the retained local research runtime. */
import type { Context } from '@deepseek-ai/cordis';
export interface ResearchHostControl {
    command(action: string, data: unknown): Promise<unknown>;
    toolResult(value: unknown): void;
}
/** Install the actual native provider without creating an agent at startup.
 * @param ctx - Original running native Host.
 * @param hostGeneration - Existing private Host generation.
 * @returns Closed private control operations. */
export declare function installResearchHostControl(ctx: Context, hostGeneration: string, send: (value: object) => Promise<void>): ResearchHostControl;
//# sourceMappingURL=research-control.d.ts.map