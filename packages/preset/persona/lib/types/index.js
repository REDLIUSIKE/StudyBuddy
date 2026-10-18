/**
 * A per-agent persona as a composable row.
 *
 * `dsh-system-prompt` owns the global persona as its own config, and registers
 * that section unconditionally — so this row is **scope-only**. Mounted inside
 * an agent preset it shadows the deployment persona for that one session,
 * exactly like the per-child persona `dsh-subagent` installs; mounted globally
 * it collides with the registry's own registration and fails loud.
 *
 * That constraint is the reason the row exists. An agent preset cannot mount
 * the prompt registry itself, so without a row of its own a preset could
 * change an agent's tools but never its identity.
 * @module @deepseek-ai/dsh-persona
 */
import z from '@deepseek-ai/schemastery';
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt';
export { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION };
/** Cordis plugin name. */
export const name = 'persona';
/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt'];
/** Runtime schema for the persona row. */
export const Config = z.object({
    prefix: z.string().required(),
    suffix: z.string().default(''),
    complete: z.boolean().default(false),
    includeRuntimeContext: z.boolean().default(true),
});
/**
 * Register the persona prefix and suffix sections for the mounting context's scope.
 * @param ctx - an agent scope context; an unscoped context collides with the
 * prompt registry's own persona registration and rejects.
 * @param config - the prefix, suffix, and complete-prompt policy.
 */
export function apply(ctx, config) {
    ctx.effect(() => ctx.systemPrompt.section({
        name: PERSONA_PREFIX_SECTION,
        order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
        text: config.prefix,
        ...(config.complete ? { complete: true } : {}),
    }), 'persona.section()');
    ctx.effect(() => ctx.systemPrompt.section({
        name: PERSONA_SUFFIX_SECTION,
        order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
        text: config.suffix ?? '',
    }), 'persona.suffix()');
    if (!(config.includeRuntimeContext ?? true))
        ctx.systemPrompt.suppressRuntimeContext();
}
//# sourceMappingURL=index.js.map