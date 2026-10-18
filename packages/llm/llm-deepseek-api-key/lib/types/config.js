import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { deepSeekConfigFields, plainOptions as protocolOptions, resolveAdapterOptions as resolveProtocolOptions } from '@deepseek-ai/dsh-llm-deepseek';
export const Config = z.object({
    ...deepSeekConfigFields,
    apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY').volatile(),
});
/** Read one validated provider configuration.
 * @param config - live plugin configuration.
 * @returns detached resolver inputs.
 */
export function plainOptions(config) {
    return { ...protocolOptions(config), apiKeyEnv: config.apiKeyEnv.get() };
}
/** Resolve API-key and protocol settings together.
 * @param config - raw deployment settings.
 * @param environment - application launch environment.
 * @returns validated endpoint facts and the matching credential reference.
 */
export function resolveAdapterOptions(config, environment) {
    return { ...resolveProtocolOptions(config, environment), apiKeyEnv: credentialRef(config.apiKeyEnv ?? 'DEEPSEEK_API_KEY') };
}
//# sourceMappingURL=config.js.map