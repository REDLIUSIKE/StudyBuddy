/** Skill safety capability, composed with a Host-owned provider. */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SkillSafetyCommand, SkillSafetyProvider, SkillSafetyResult, SkillSafetyPresentation } from './types.ts'
import { SkillSafetyError } from './errors.ts'

export { SkillSafetyError } from './errors.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' { interface Context { skillSafety: SkillSafety } }

/** Dispatches native skill checks to the composed local provider. */
export class SkillSafety extends Service {
  private provider: { value: SkillSafetyProvider; abort: AbortController; pending: Set<Promise<void>> } | undefined

  constructor(ctx: Context) { super(ctx, 'skillSafety') }

  /**
   * Bind one provider to the caller's plugin lifetime; unloading aborts and settles its calls.
   * @param provider - Private Host implementation with live-root admission.
   * @returns Idempotent disposer removing this registration.
   * @throws {SkillSafetyError} when a second provider tries to replace the current one.
   */
  registerProvider(provider: SkillSafetyProvider): () => void {
    return this.ctx.effect(() => {
      if (this.provider !== undefined) throw new SkillSafetyError('SKILL_SAFETY_PROVIDER_EXISTS')
      const lease = { value: provider, abort: new AbortController(), pending: new Set<Promise<void>>() }
      this.provider = lease
      return async () => {
        if (this.provider === lease) this.provider = undefined
        lease.abort.abort()
        await Promise.all(lease.pending)
      }
    }, 'skill safety provider')
  }

  /**
   * Execute a request from the exact live native root admitted by the provider.
   * @param agent - Calling root Agent, not a model-supplied identity.
   * @param command - Closed feature operation.
   * @param signal - Caller cancellation; provider disposal also revokes the request.
   * @returns The real keyless provider outcome; cancellation never publishes success.
   */
  async execute(agent: Agent, command: SkillSafetyCommand, signal?: AbortSignal): Promise<SkillSafetyResult> {
    const lease = this.currentProvider()
    const lifetime = signal === undefined ? lease.abort.signal : AbortSignal.any([signal, lease.abort.signal])
    if (lifetime.aborted) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED')
    const actor = lease.value.bindRootAgent(agent)
    const operation = lease.value.execute({ agent, actor, signal: lifetime }, command)
    const settled = operation.then(() => {}, () => {})
    lease.pending.add(settled)
    try {
      const result = await operation
      if (lifetime.aborted || this.provider !== lease) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED')
      return result
    } finally {
      lease.pending.delete(settled)
    }
  }

  /**
   * Obtain a view without starting a model turn or authorizing an operation.
   * @param session - Native Session selected by the existing client protocol.
   * @returns The provider-filtered current-account presentation.
   */
  async presentation(session: Session): Promise<SkillSafetyPresentation> {
    const lease = this.currentProvider()
    const result = await lease.value.presentation(session.id)
    if (this.provider !== lease) throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE')
    return result
  }

  private currentProvider() {
    if (this.provider === undefined) throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE')
    return this.provider
  }
}

export default SkillSafety
