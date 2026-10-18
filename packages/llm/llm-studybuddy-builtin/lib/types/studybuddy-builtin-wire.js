/** Exact native authority projected onto the existing pi-ai wire adapter. */
import { PiAiAdapter, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai';
import { LlmError } from '@deepseek-ai/dsh-llm';
import { observeBuiltinTerminal } from "./studybuddy-builtin-terminal.js";
const protocols = {
    openai_chat_completions: 'openai-completions', openai_responses: 'openai-responses', anthropic_messages: 'anthropic-messages',
};
/** Construct an adapter containing only one private exact route, without ambient auth or discovery.
 * @param route - Private native material, retained only by the prepared request.
 * @param headers - Protected per-request admission ticket headers.
 * @param observation - Optional raw terminal observation and explicit transport or attachment resolvers.
 * @returns The shipped pi-ai adapter with fully explicit model capabilities. */
export function createBuiltinWireAdapter(route, headers, observation) {
    const grant = route.mode === 'gateway' ? route.binding.grant : route.grant;
    const protocol = route.mode === 'gateway' ? route.binding.grant.scope.protocol : route.grant.protocol;
    const baseURL = route.mode === 'gateway'
        ? route.gatewayOrigin + (protocol === 'anthropic_messages' ? '' : '/v1')
        : route.baseUrl;
    const models = grant.allowedModels.map((model) => {
        if (model.maxOutputTokens === null)
            throw new LlmError('The exact model output capability is unavailable', 'BUILTIN_CAPABILITY_INCOMPLETE');
        const explicitChat = protocol === 'openai_chat_completions' && (model.providerId === 'deepseek' || model.providerId === 'kimi');
        return {
            id: model.exactModelId, name: model.displayName, contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens,
            input: model.capabilityFlags.includes('image_in') ? ['text', 'image'] : ['text'], reasoningEfforts: false,
            ...explicitChat ? {
                compat: {
                    maxTokensField: model.providerId === 'deepseek' ? 'max_tokens' : 'max_completion_tokens',
                    supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false,
                    requiresReasoningContentOnAssistantMessages: true,
                },
            } : {},
        };
    });
    const profiles = resolveProfiles({
        [route.routeId]: {
            displayName: route.displayName, api: protocols[protocol],
            baseURL, models, apiKeyEnv: 'PRIVATE_BUILTIN_MATERIAL', headers: { ...headers },
        },
    });
    const transport = observation?.fetch ?? fetch;
    const privateFetch = (input, init) => {
        // The official Chat endpoint defaults to thinking. A bounded validation
        // needs a visible completion; normal conversation payloads stay unchanged.
        if (observation?.purpose === 'validation' && protocol === 'openai_chat_completions' &&
            grant.allowedModels.some(model => model.providerId === 'deepseek')) {
            if (typeof init?.body !== 'string')
                throw new LlmError('The validation request body is unavailable', 'BUILTIN_VALIDATION_BODY_INVALID');
            const body = JSON.parse(init.body);
            if (!grant.allowedModels.some(model => model.providerId === 'deepseek' && model.exactModelId === body.model) ||
                !Number.isSafeInteger(body.max_tokens) || Number(body.max_tokens) < 1 || Number(body.max_tokens) > 32) {
                throw new LlmError('The exact validation model or output budget is invalid', 'BUILTIN_VALIDATION_BODY_INVALID');
            }
            return transport(input, { ...init, body: JSON.stringify({ ...body, thinking: { type: 'disabled' } }), redirect: 'error' });
        }
        return transport(input, { ...init, redirect: 'error' });
    };
    return new PiAiAdapter({
        profiles: () => profiles, resolveApiKey: async () => route.apiKey,
        providerFetch: observation?.facts === undefined ? privateFetch : observeBuiltinTerminal(privateFetch, protocol, observation.facts),
        ...observation?.resolveAttachments === undefined ? {} : { resolveAttachments: observation.resolveAttachments },
        ...observation?.resolveImageAccess === undefined ? {} : { resolveImageAccess: observation.resolveImageAccess },
        auth: {
            credentials: {
                read: async () => undefined, list: async () => [],
                modify: async () => { throw new LlmError('Built-in credentials cannot be changed by the adapter', 'BUILTIN_AUTH_DENIED'); },
                delete: async () => { throw new LlmError('Built-in credentials cannot be changed by the adapter', 'BUILTIN_AUTH_DENIED'); },
            },
            authContext: { env: async () => undefined, fileExists: async () => false },
        },
    });
}
//# sourceMappingURL=studybuddy-builtin-wire.js.map