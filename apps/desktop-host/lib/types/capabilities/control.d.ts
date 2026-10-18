import type { Context } from '@deepseek-ai/cordis';
export declare function installCapabilityHostControl(ctx: Context, hostGeneration: string, send: (value: object) => Promise<void>): Promise<{
    result: (value: unknown) => void;
    command(action: string, data: unknown): Promise<unknown>;
}>;
//# sourceMappingURL=control.d.ts.map