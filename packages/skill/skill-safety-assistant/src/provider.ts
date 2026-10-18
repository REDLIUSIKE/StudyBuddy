/** Native provider composition; only the actual question service supplies human answers. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyInvocation, SkillSafetyPresentation, SkillSafetyProvider, SkillSafetyRequestId, SkillSafetyResult } from './types.ts'
import { SkillSafetyError } from './errors.ts'
/** Private per-call binding, never tool arguments or a persisted question registry. */
export interface SkillSafetyPreparedOperation {
  readonly intentId: SkillSafetyIntentId
  readonly requestId: SkillSafetyRequestId
  readonly argumentDigest: string
  readonly question?: AskUserQuestionItem | undefined
}
/** Host-owned scope and private Main RPC; the live root never crosses process JSON. */
export interface SkillSafetyHostControl {
  bindRootAgent(agent: Agent): SkillSafetyActor
  preflight(invocation: SkillSafetyInvocation, command: SkillSafetyCommand): Promise<SkillSafetyPreparedOperation>
  execute(invocation: SkillSafetyInvocation, prepared: SkillSafetyPreparedOperation, answer?: AskUserQuestionAnswer): Promise<SkillSafetyResult>
  release(invocation: SkillSafetyInvocation, prepared: SkillSafetyPreparedOperation): Promise<void>
  presentation(sessionId: SessionId): Promise<SkillSafetyPresentation>
}
/**
 * Compose the native-question consumer with a private scope/admission owner.
 * @param ctx - Actual Host services, not a renderer or model-created registry.
 * @param control - Private Main RPC and account/session binding.
 * @returns One provider; no command body contains an approval field.
 */
export function createSkillSafetyProvider(ctx: Context, control: SkillSafetyHostControl): SkillSafetyProvider {
  const root = (agent: Agent): void => {
    if (ctx.agents.get(agent.id) !== agent || !ctx.agents.roots().includes(agent) || agent.session.id !== agent.id) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE')
  }
  const bind = (agent: Agent): SkillSafetyActor => {
    root(agent)
    const actor = control.bindRootAgent(agent)
    if (actor.sessionId !== agent.session.id) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE')
    return Object.freeze({ ...actor })
  }
  const current = (invocation: SkillSafetyInvocation): void => {
    if (invocation.signal.aborted) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED')
    const actor = bind(invocation.agent)
    if (actor.accountId !== invocation.actor.accountId || actor.generation !== invocation.actor.generation || actor.sessionId !== invocation.actor.sessionId) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE')
  }
  return {
    bindRootAgent: bind,
    presentation: sessionId => control.presentation(sessionId),
    execute: async (invocation, command) => {
      current(invocation)
      const snapshot = structuredClone(command)
      const prepared = await control.preflight(invocation, snapshot)
      try {
        current(invocation)
        if (prepared.requestId !== snapshot.requestId) throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT')
        const answer = prepared.question === undefined ? undefined : await ctx.userQuestions.ask({ agent: invocation.agent, questions: [prepared.question], signal: invocation.signal })
        current(invocation)
        const result = await control.execute(invocation, prepared, answer)
        current(invocation)
        return result
      } finally { await control.release(invocation, prepared) }
    },
  }
}
