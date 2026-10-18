/** Closed private composition of the existing native Workspace, Session, tools and questions. */
import type { Context } from '@deepseek-ai/cordis';
export interface AigcHostControl {
    command(action: string, data: unknown): Promise<unknown>;
    toolResult(value: unknown): void;
}
export declare function installAigcHostControl(ctx: Context, hostGeneration: string, send: (value: object) => Promise<void>): AigcHostControl;
//# sourceMappingURL=aigc-control.d.ts.map