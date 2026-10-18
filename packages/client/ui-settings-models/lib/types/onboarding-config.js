/** Public page-bootstrap options shared by the Host and Client halves. */
import z from '@deepseek-ai/schemastery';
/** Validate Host configuration and its public page-bootstrap payload. */
export const Config = z.object({
    credentialOnboarding: z.boolean().default(true),
});
/** Page-global key carrying only the public onboarding options. */
export const ONBOARDING_CONFIG_GLOBAL = '__DSH_MODELS_ONBOARDING__';
//# sourceMappingURL=onboarding-config.js.map