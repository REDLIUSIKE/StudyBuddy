import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { CapabilityAuthorizer, CapabilityContext, CapabilityEffect, CapabilityJson, CapabilityTarget } from './types.ts'

/** Domain operations honor the live native policy without widening filesystem roots. */
export class CapabilityPolicy {
  constructor(private readonly ctx: Context, private readonly guard: CapabilityAuthorizer) {}
  async authorize(context: CapabilityContext, effect: CapabilityEffect, target: CapabilityTarget | null, input: CapabilityJson = null): Promise<void> {
    context.signal.throwIfAborted()
    if (this.ctx.agents.get(context.agent.id) !== context.agent || context.agent.id !== context.caller.callerSessionId) throw Error('CAPABILITY_SESSION_REQUIRED')
    const policy = this.ctx.get('sandboxPolicy')
    if (!policy) throw Error('CAPABILITY_POLICY_UNAVAILABLE')
    const resolved = policy.resolve({ session: context.agent.session })
    if (effect !== 'read' && resolved.mode === 'read-only') throw Error('CAPABILITY_READ_ONLY')
    await this.guard(context, effect, target, input)
    context.signal.throwIfAborted()
  }
}
