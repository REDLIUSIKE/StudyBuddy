import { ContactConfigFields, CONTACT_CONFIG_GLOBAL } from "./contact-config.js";
import z from '@deepseek-ai/schemastery';
import { OnboardingSettingsFields } from "./onboarding-settings.js";
/** Configuration projected through the account plugin's shared form. */
export const Config = z.object({
    contactFormUrl: ContactConfigFields.contactFormUrl,
    contactSource: ContactConfigFields.contactSource,
    bonusAckRetryDelayMs: ContactConfigFields.bonusAckRetryDelayMs,
    bonusAckRetryMaxDelayMs: ContactConfigFields.bonusAckRetryMaxDelayMs,
    version: OnboardingSettingsFields.version.volatile(),
    step: OnboardingSettingsFields.step.volatile(),
    purpose: OnboardingSettingsFields.purpose.volatile(),
    process: OnboardingSettingsFields.process.volatile(),
    completion: OnboardingSettingsFields.completion.volatile(),
    usage: OnboardingSettingsFields.usage.volatile(),
    developerTools: OnboardingSettingsFields.developerTools.volatile(),
});
/**
 * Publish public questionnaire options before browser plugins activate.
 * @param ctx - Host context collecting page initialization data.
 * @param config - validated deployment options.
 */
export function apply(ctx, config) {
    ctx.inject(['settings'], (scope) => {
        scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
    });
    ctx.on('webserver/index-inject', (table) => {
        table.push({ kind: 'global', name: CONTACT_CONFIG_GLOBAL, value: {
                contactFormUrl: config.contactFormUrl, contactSource: config.contactSource,
                bonusAckRetryDelayMs: config.bonusAckRetryDelayMs, bonusAckRetryMaxDelayMs: config.bonusAckRetryMaxDelayMs,
            } });
    });
}
//# sourceMappingURL=index.js.map