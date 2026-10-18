/** Skill safety capability, composed with a Host-owned provider. */
import { Service } from '@deepseek-ai/cordis';
import { SkillSafetyError } from "./errors.js";
export { SkillSafetyError } from "./errors.js";
/** Dispatches native skill checks to the composed local provider. */
export class SkillSafety extends Service {
    provider;
    constructor(ctx) { super(ctx, 'skillSafety'); }
    /**
     * Bind one provider to the caller's plugin lifetime; unloading aborts and settles its calls.
     * @param provider - Private Host implementation with live-root admission.
     * @returns Idempotent disposer removing this registration.
     * @throws {SkillSafetyError} when a second provider tries to replace the current one.
     */
    registerProvider(provider) {
        return this.ctx.effect(() => {
            if (this.provider !== undefined)
                throw new SkillSafetyError('SKILL_SAFETY_PROVIDER_EXISTS');
            const lease = { value: provider, abort: new AbortController(), pending: new Set() };
            this.provider = lease;
            return async () => {
                if (this.provider === lease)
                    this.provider = undefined;
                lease.abort.abort();
                await Promise.all(lease.pending);
            };
        }, 'skill safety provider');
    }
    /**
     * Execute a request from the exact live native root admitted by the provider.
     * @param agent - Calling root Agent, not a model-supplied identity.
     * @param command - Closed feature operation.
     * @param signal - Caller cancellation; provider disposal also revokes the request.
     * @returns The real keyless provider outcome; cancellation never publishes success.
     */
    async execute(agent, command, signal) {
        const lease = this.currentProvider();
        const lifetime = signal === undefined ? lease.abort.signal : AbortSignal.any([signal, lease.abort.signal]);
        if (lifetime.aborted)
            throw new SkillSafetyError('SKILL_SAFETY_CANCELLED');
        const actor = lease.value.bindRootAgent(agent);
        const operation = lease.value.execute({ agent, actor, signal: lifetime }, command);
        const settled = operation.then(() => { }, () => { });
        lease.pending.add(settled);
        try {
            const result = await operation;
            if (lifetime.aborted || this.provider !== lease)
                throw new SkillSafetyError('SKILL_SAFETY_CANCELLED');
            return result;
        }
        finally {
            lease.pending.delete(settled);
        }
    }
    /**
     * Obtain a view without starting a model turn or authorizing an operation.
     * @param session - Native Session selected by the existing client protocol.
     * @returns The provider-filtered current-account presentation.
     */
    async presentation(session) {
        const lease = this.currentProvider();
        const result = await lease.value.presentation(session.id);
        if (this.provider !== lease)
            throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE');
        return result;
    }
    currentProvider() {
        if (this.provider === undefined)
            throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE');
        return this.provider;
    }
}
export default SkillSafety;
//# sourceMappingURL=index.js.map