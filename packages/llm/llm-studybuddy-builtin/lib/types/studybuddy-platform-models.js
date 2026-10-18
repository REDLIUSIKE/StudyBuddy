/** Platform adapter consumes existing native-tool authority, separately from personal sources. */
import { randomUUID } from 'node:crypto';
import { LlmAdapter, LlmError, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai';
import { deepEqualJson, deepFreeze } from '@deepseek-ai/dsh-util-values';
import { PLATFORM_PROVIDER, parsePlatformSnapshot, platformChoices, parsePlatformPrepared, } from "./studybuddy-platform-contracts.js";
import { observeBuiltinTerminal, projectBuiltinTerminalUsage } from "./studybuddy-builtin-terminal.js";
function fail(code) {
    throw new LlmError('平台模型暂时不可用，请重新选择。', code);
}
/** One platform directory mounted with the private Desktop Host lifetime. */
export class PlatformModelDirectory extends LlmAdapter {
    ctx;
    options;
    snapshot;
    registration;
    epoch = 0;
    constructor(ctx, options) {
        super();
        this.ctx = ctx;
        this.options = options;
        ctx.effect(() => () => {
            this.snapshot = undefined;
            this.epoch++;
            this.registration?.();
            this.registration = undefined;
        });
    }
    /** Apply only Main-owned keyless authorities for this exact Host. */
    apply(input, hostGeneration) {
        const next = deepFreeze(parsePlatformSnapshot(input));
        if (next.hostGeneration !== hostGeneration)
            fail('BUILTIN_HOST_GENERATION_MISMATCH');
        if (this.snapshot?.scope.accountId !== next.scope.accountId || this.snapshot.scope.generation !== next.scope.generation ||
            this.snapshot.hostGeneration !== next.hostGeneration)
            this.epoch++;
        this.snapshot = next;
        if (this.registration === undefined)
            this.registration = this.ctx.llm.registerAdapter([PLATFORM_PROVIDER], this);
        else
            this.registration.replace([PLATFORM_PROVIDER]);
    }
    /** Withdraw the exact old account before logout or account replacement. */
    revoke(scope) {
        if (this.snapshot?.scope.accountId !== scope.accountId || this.snapshot.scope.generation !== scope.generation)
            return;
        this.snapshot = undefined;
        this.epoch++;
        this.registration?.replace([]);
    }
    catalogVisible(provider) {
        return provider === PLATFORM_PROVIDER && this.snapshot !== undefined && platformChoices(this.snapshot).length > 0;
    }
    selectionAllowed(provider, model) {
        return (this.catalogVisible(provider) &&
            this.snapshot !== undefined &&
            platformChoices(this.snapshot).some(choice => choice.model.exactModelId === model));
    }
    /** Expose current exact vision routes to image tools without returning credentials or granting dispatch.
     * @returns Available platform routes whose reviewed catalog declares native image input. */
    imageToolModels() {
        return this.snapshot === undefined ? [] : platformChoices(this.snapshot)
            .filter(choice => choice.model.capabilityFlags.includes('image_in'))
            .map(choice => ({ provider: PLATFORM_PROVIDER, model: choice.model.exactModelId }));
    }
    providerInfo(provider) {
        return { id: provider, name: 'StudyBuddy 平台模型' };
    }
    listModels(provider) {
        const models = !this.catalogVisible(provider) || this.snapshot === undefined
            ? []
            : platformChoices(this.snapshot).map(choice => this.info(choice));
        return Promise.resolve(models);
    }
    info(choice) {
        return {
            provider: PLATFORM_PROVIDER,
            id: choice.model.exactModelId,
            name: choice.model.displayName,
            inputModalities: this.inputModalities(choice),
            context: { contextWindow: choice.model.contextWindow },
            ...(choice.model.maxOutputTokens === null ? {} : { defaultMaxTokens: choice.model.maxOutputTokens }),
        };
    }
    inputModalities(choice) {
        return choice.model.capabilityFlags.includes('image_in') ? ['text', 'image'] : ['text'];
    }
    resolveModel(provider, model) {
        return Promise.resolve().then(() => this.info(this.exact(provider, model).choice));
    }
    prepareCall(provider, model) {
        return Promise.resolve().then(() => {
            const captured = this.exact(provider, model);
            return { model: this.info(captured.choice), stream: options => this.dispatch(options, captured) };
        });
    }
    async *stream(options) {
        yield* this.dispatch(options, this.exact(options.provider, options.model));
    }
    exact(provider, model) {
        const snapshot = this.snapshot, choice = snapshot && platformChoices(snapshot).find(row => row.model.exactModelId === model);
        if (provider !== PLATFORM_PROVIDER || snapshot === undefined || choice === undefined)
            fail('BUILTIN_PLATFORM_MODEL_NOT_ALLOWED');
        return { snapshot, choice, epoch: this.epoch };
    }
    current(capture, admitted = false) {
        if (this.epoch !== capture.epoch || this.snapshot === undefined ||
            (!admitted && (this.snapshot !== capture.snapshot || !this.selectionAllowed(PLATFORM_PROVIDER, capture.choice.model.exactModelId))))
            fail('BUILTIN_PLATFORM_SCOPE_REVOKED');
    }
    async *dispatch(options, capture) {
        this.current(capture);
        if (options.provider !== PLATFORM_PROVIDER || options.model !== capture.choice.model.exactModelId)
            fail('BUILTIN_PLATFORM_MODEL_NOT_ALLOWED');
        const sessionId = this.options.trustedSession(options);
        if (!isAgentLoopRequest(options) || sessionId === undefined || String(options.sessionId) !== sessionId)
            fail('BUILTIN_TRUST_REQUIRED');
        if (options.reasoningEffort !== undefined || options.temperature !== undefined)
            fail('BUILTIN_PARAMETER_NOT_ALLOWED');
        const toolsSupported = capture.choice.model.capabilityFlags.includes('tool_use');
        const request = {
            scope: capture.snapshot.scope,
            hostGeneration: capture.snapshot.hostGeneration,
            catalogRevision: capture.snapshot.catalog.catalogRevision,
            clientRequestId: randomUUID(),
            sessionId,
            exactModelId: options.model,
        };
        const prepared = parsePlatformPrepared(await this.options.admit(request));
        this.current(capture, true);
        if (!deepEqualJson(prepared.request, request) ||
            prepared.material.selectedProviderId !== capture.choice.model.providerId ||
            !prepared.material.authorizedModels.some(member => prepared.authority === null
                // A configured Key keeps its issuance snapshot. Current reviewed facts
                // may change while its exact provider/model/protocol membership stays.
                ? member.toolId === capture.choice.member.toolId && member.providerId === capture.choice.member.providerId
                    && member.exactModelId === capture.choice.member.exactModelId && member.protocol === capture.choice.member.protocol
                : deepEqualJson(member, capture.choice.member)))
            fail('BUILTIN_PLATFORM_AUTHORITY_INVALID');
        if (options.signal?.aborted)
            return;
        const model = capture.choice.model;
        if (model.maxOutputTokens === null)
            fail('BUILTIN_CAPABILITY_INCOMPLETE');
        const facts = {
            providerResponseId: null,
            returnedModel: null,
            usage: null,
            outcome: 'unknown',
        };
        const guardedFetch = async (input, init) => {
            this.current(capture, true);
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
            if (url.origin !== prepared.material.gatewayOrigin ||
                url.pathname !== '/v1/chat/completions' ||
                typeof init?.body !== 'string')
                fail('BUILTIN_PLATFORM_ROUTE_INVALID');
            const body = JSON.parse(init.body);
            if (body === null || typeof body !== 'object' || !('model' in body) || body.model !== options.model)
                fail('BUILTIN_PLATFORM_ROUTE_INVALID');
            const headers = new Headers(init.headers);
            headers.set('X-Request-Id', request.clientRequestId);
            return (this.options.fetch ?? fetch)(input, { ...init, headers, redirect: 'error' });
        };
        const profiles = resolveProfiles({
            [PLATFORM_PROVIDER]: {
                displayName: 'StudyBuddy 平台模型',
                api: 'openai-completions',
                baseURL: prepared.material.gatewayOrigin + '/v1',
                apiKeyEnv: 'PRIVATE_PLATFORM_MATERIAL',
                models: [
                    {
                        id: model.exactModelId,
                        name: model.displayName,
                        contextWindow: model.contextWindow,
                        maxTokens: model.maxOutputTokens,
                        input: this.inputModalities(capture.choice),
                        reasoningEfforts: false,
                        compat: {
                            maxTokensField: ['deepseek', 'zhipu', 'hunyuan'].includes(model.providerId)
                                ? 'max_tokens'
                                : 'max_completion_tokens',
                            supportsStore: false,
                            supportsDeveloperRole: false,
                            supportsReasoningEffort: false,
                            requiresReasoningContentOnAssistantMessages: model.providerId !== 'minimax',
                        },
                    },
                ],
            },
        });
        const adapter = new PiAiAdapter({
            profiles: () => profiles,
            resolveApiKey: () => Promise.resolve(prepared.material.apiKey),
            providerFetch: observeBuiltinTerminal(guardedFetch, 'openai_chat_completions', facts),
            ...(this.options.resolveAttachments === undefined ? {} : { resolveAttachments: this.options.resolveAttachments }),
            ...(this.options.resolveImageAccess === undefined ? {} : { resolveImageAccess: this.options.resolveImageAccess }),
            auth: {
                credentials: {
                    read: () => Promise.resolve(undefined),
                    list: () => Promise.resolve([]),
                    modify: () => Promise.reject(new LlmError('平台模型暂时不可用，请重新选择。', 'BUILTIN_AUTH_DENIED')),
                    delete: () => Promise.reject(new LlmError('平台模型暂时不可用，请重新选择。', 'BUILTIN_AUTH_DENIED')),
                },
                authContext: { env: () => Promise.resolve(undefined), fileExists: () => Promise.resolve(false) },
            },
        });
        const wireOptions = toolsSupported ? options : { ...options, tools: [] };
        for await (const chunk of adapter.stream(wireOptions)) {
            this.current(capture, true);
            if (!toolsSupported && chunk.type === 'tool-call-delta')
                fail('BUILTIN_CAPABILITY_NOT_ALLOWED');
            if ((facts.returnedModel !== null && facts.returnedModel !== model.exactModelId) ||
                facts.outcome === 'contract_invalid')
                fail('BUILTIN_RETURNED_MODEL_MISMATCH');
            if (chunk.type === 'usage')
                continue;
            if (chunk.type === 'finish' && (chunk.reason.kind === 'stop' || chunk.reason.kind === 'max-tokens' || chunk.reason.kind === 'tool-calls')) {
                const usage = projectBuiltinTerminalUsage(facts);
                if (usage !== undefined)
                    yield { type: 'usage', usage };
            }
            yield chunk;
            if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted'))
                return;
        }
        if (facts.returnedModel !== model.exactModelId)
            fail('BUILTIN_RETURNED_MODEL_MISMATCH');
    }
}
//# sourceMappingURL=studybuddy-platform-models.js.map