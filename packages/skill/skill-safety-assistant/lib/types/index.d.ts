/** Skill safety capability, composed with a Host-owned provider. */
import { Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { SkillSafetyCommand, SkillSafetyProvider, SkillSafetyResult, SkillSafetyPresentation } from './types.ts';
export { SkillSafetyError } from './errors.ts';
export type * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        skillSafety: SkillSafety;
    }
}
/** Dispatches native skill checks to the composed local provider. */
export declare class SkillSafety extends Service {
    private provider;
    constructor(ctx: Context);
    /**
     * Bind one provider to the caller's plugin lifetime; unloading aborts and settles its calls.
     * @param provider - Private Host implementation with live-root admission.
     * @returns Idempotent disposer removing this registration.
     * @throws {SkillSafetyError} when a second provider tries to replace the current one.
     */
    registerProvider(provider: SkillSafetyProvider): () => void;
    /**
     * Execute a request from the exact live native root admitted by the provider.
     * @param agent - Calling root Agent, not a model-supplied identity.
     * @param command - Closed feature operation.
     * @param signal - Caller cancellation; provider disposal also revokes the request.
     * @returns The real keyless provider outcome; cancellation never publishes success.
     */
    execute(agent: Agent, command: SkillSafetyCommand, signal?: AbortSignal): Promise<SkillSafetyResult>;
    /**
     * Obtain a view without starting a model turn or authorizing an operation.
     * @param session - Native Session selected by the existing client protocol.
     * @returns The provider-filtered current-account presentation.
     */
    presentation(session: Session): Promise<SkillSafetyPresentation>;
    private currentProvider;
}
export default SkillSafety;
//# sourceMappingURL=index.d.ts.map