/** Native provider composition; only the actual question service supplies human answers. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyInvocation, SkillSafetyPresentation, SkillSafetyProvider, SkillSafetyRequestId, SkillSafetyResult } from './types.ts';
/** Private per-call binding, never tool arguments or a persisted question registry. */
export interface SkillSafetyPreparedOperation {
    readonly intentId: SkillSafetyIntentId;
    readonly requestId: SkillSafetyRequestId;
    readonly argumentDigest: string;
    readonly question?: AskUserQuestionItem | undefined;
}
/** Host-owned scope and private Main RPC; the live root never crosses process JSON. */
export interface SkillSafetyHostControl {
    bindRootAgent(agent: Agent): SkillSafetyActor;
    preflight(invocation: SkillSafetyInvocation, command: SkillSafetyCommand): Promise<SkillSafetyPreparedOperation>;
    execute(invocation: SkillSafetyInvocation, prepared: SkillSafetyPreparedOperation, answer?: AskUserQuestionAnswer): Promise<SkillSafetyResult>;
    release(invocation: SkillSafetyInvocation, prepared: SkillSafetyPreparedOperation): Promise<void>;
    presentation(sessionId: SessionId): Promise<SkillSafetyPresentation>;
}
/**
 * Compose the native-question consumer with a private scope/admission owner.
 * @param ctx - Actual Host services, not a renderer or model-created registry.
 * @param control - Private Main RPC and account/session binding.
 * @returns One provider; no command body contains an approval field.
 */
export declare function createSkillSafetyProvider(ctx: Context, control: SkillSafetyHostControl): SkillSafetyProvider;
//# sourceMappingURL=provider.d.ts.map