/** Strict native temporary-session commands; model routes arrive only from Main's existing authority. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { NativeAigcTemporary } from './aigc-temporary.ts';
export declare function nativeTemporaryCommand(ctx: Context, engine: NativeAigcTemporary, parent: Agent, projectId: string, value: unknown, signal: AbortSignal): Promise<unknown>;
//# sourceMappingURL=aigc-temporary-control.d.ts.map