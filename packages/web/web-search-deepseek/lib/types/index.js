import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, } from "./provider.js";
export { DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_PROVIDER_ID, } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-deepseek';
/** The web seam this provider registers into. */
export const inject = ['web'];
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY';
export const Config = z.object({
    apiKey: z.string().role('secret').volatile(),
    apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
    // Declared here rather than only at the use site: a configuration surface
    // renders the resolved section, so a default the schema does not carry reads
    // there as no value at all.
    baseURL: z.string().volatile(),
    model: z.string().default(DEEPSEEK_DEFAULT_MODEL).volatile(),
    apiVersion: z.string().default(DEEPSEEK_DEFAULT_API_VERSION).volatile(),
    maxTokens: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_TOKENS).volatile(),
    maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES).volatile(),
});
/**
 * Auxiliary-search endpoint, independent of the conversation adapter's
 * `$DEEPSEEK_BASE_URL` and selected protocol.
 */
const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL';
/** Provider route id `dsh-llm-deepseek-account` registers; `request/context` events record it per Session. */
const ACCOUNT_PROVIDER = 'deepseek-account';
/** Settings namespace carrying this provider's endpoint, model, and key reference. */
export const WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = 'web-search-deepseek';
/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx, config) {
    const apiKeyEnv = credentialRef(config.apiKeyEnv);
    const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
        ? config.apiKey
        : undefined;
    return {
        ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
        resolveAccountToken: async (endpoint) => {
            // The latest request context names the route that served the model
            // request which called this search, as account sign-out reads it.
            const provider = ctx.get('agents')?.currentInitiator()?.session.requestContext()?.provider;
            if (provider !== ACCOUNT_PROVIDER)
                return undefined;
            return await ctx.get('deepseekAccount')?.resolveToken(endpoint);
        },
        resolveApiKey: async () => {
            const credentials = ctx.get('credentials');
            if (credentials !== undefined)
                return (await credentials.resolve(apiKeyEnv))?.value;
            // Without the seam the environment is the whole credential plane.
            const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
            return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
        },
        apiKeyEnv,
        baseURL: config.baseURL
            ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value
            ?? DEEPSEEK_DEFAULT_BASE_URL,
        model: config.model,
        apiVersion: config.apiVersion,
        maxTokens: config.maxTokens,
        maxUses: config.maxUses,
        recordRequest: (request) => {
            ctx.get('agents')?.currentInitiator()?.session.append('web/deepseek-search-llm-request', request);
        },
    };
}
/** Register the DeepSeek search provider with `ctx.web`. */
export function apply(ctx, config) {
    ctx.web.registerSearchProvider(new DeepSeekSearchProvider(() => resolveOptions(ctx, {
        apiKey: config.apiKey.get(), apiKeyEnv: config.apiKeyEnv.get(), baseURL: config.baseURL.get(), model: config.model.get(),
        apiVersion: config.apiVersion.get(), maxTokens: config.maxTokens.get(), maxUses: config.maxUses.get(),
    })));
}
//# sourceMappingURL=index.js.map