/** Device-local onboarding progress stored in the Host settings document. */
import z from '@deepseek-ai/schemastery';
/** Account feature's durable onboarding namespace. */
export const DESKTOP_ONBOARDING_NAMESPACE = 'ui-settings-account';
/** Validated defaults for a fresh installation. */
export const OnboardingSettingsFields = {
    version: z.const(1).default(1),
    step: z.union(['welcome', 'credit', 'purpose', 'process', 'done']).default('welcome'),
    purpose: z.union(['office', 'development', 'both', z.const(null)]),
    process: z.union(['compact', 'standard', 'detailed', z.const(null)]),
    completion: z.union(['completed', 'skipped', 'api-key', z.const(null)]),
    usage: z.union(['compact', 'detailed']).default('compact'),
    developerTools: z.boolean().default(false),
};
/** Validated defaults for a fresh installation. */
export const OnboardingSettingsSchema = z.object(OnboardingSettingsFields);
//# sourceMappingURL=onboarding-settings.js.map