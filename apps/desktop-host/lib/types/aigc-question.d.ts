/** Original AIGC form questions use the native question service and preserve typed answers. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export declare function askAigcQuestion(ctx: Context, agent: Agent, value: unknown, signal: AbortSignal): Promise<unknown>;
//# sourceMappingURL=aigc-question.d.ts.map