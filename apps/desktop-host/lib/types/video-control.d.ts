import type { Context } from '@deepseek-ai/cordis';
export interface VideoHostControl {
    command(action: string, data: unknown): Promise<unknown>;
    toolResult(value: unknown): void;
}
/** Add video capabilities to admitted native Agents; the normal Host owns all chat. */
export declare function installVideoHostControl(ctx: Context, hostGeneration: string, send: (value: object) => Promise<void>): VideoHostControl;
//# sourceMappingURL=video-control.d.ts.map