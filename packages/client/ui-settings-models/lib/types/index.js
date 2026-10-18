/** Host configuration and page bootstrap for Models credential onboarding. */
import { ONBOARDING_CONFIG_GLOBAL } from "./onboarding-config.js";
export { Config } from "./onboarding-config.js";
/**
 * Publish the credential-onboarding choice before browser plugins activate.
 * @param ctx - Host context collecting the page's initialization data.
 * @param config - plugin options with schema defaults applied by the Loader.
 */
export function apply(ctx, config) {
    ctx.on('webserver/index-inject', (table) => {
        table.push({
            kind: 'global',
            name: ONBOARDING_CONFIG_GLOBAL,
            value: { credentialOnboarding: config.credentialOnboarding },
        });
    });
}
//# sourceMappingURL=index.js.map