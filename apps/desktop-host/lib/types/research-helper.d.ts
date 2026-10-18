/** One deliberately admitted native helper; model execution and usage remain in the real Agent loop. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
export interface NativeResearchHelperInput {
    readonly parent: Agent;
    readonly sessionId: SessionId;
    readonly selection: Readonly<ModelSelection>;
    readonly systemPrompt: string;
    readonly userPrompt: string;
    readonly maxTokens: number;
    readonly signal: AbortSignal;
}
/**
 * Execute a source-approved one-shot helper without importing another model SDK.
 * @param ctx - native registry/factory owner.
 * @param input - captured live selection, reviewed context and operation identity.
 * @returns text from a completed observed native turn and its durable Session reference.
 */
export declare function runNativeResearchHelper(ctx: Context, input: NativeResearchHelperInput): Promise<{
    text: string;
    sessionId: SessionId;
}>;
//# sourceMappingURL=research-helper.d.ts.map