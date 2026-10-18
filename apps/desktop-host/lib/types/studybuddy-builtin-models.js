/** Private Electron Main ↔ Host control; public page transports never register these commands. */
import { randomUUID } from 'node:crypto';
import { LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import { BuiltinModelDirectory, createBuiltinWireAdapter, PlatformModelDirectory, parsePlatformPrepared, parsePlatformRequest } from '@deepseek-ai/dsh-llm-studybuddy-builtin';
import { parseNativeBuiltinCatalogPublishV1, parseNativeBuiltinFrozenRequestV1, parseNativeBuiltinHostContextV1, } from '@studybuddy/contracts';
import { MediaHostController } from "./media-tools.js";
import { assertResearchModelBudget } from "./research-budget-guard.js";
import { NativeImageTools } from "./image-tools.js";
/** Construct exact native source routing and its only private IPC authority.
 * @param ctx - Shipped Host services; the initiator boundary establishes conversation trust.
 * @param send - Private Node IPC delivery to Electron Main.
 * @returns Controls inaccessible to API Gateway or renderer requests. */
export function installBuiltinHostControl(ctx, send) {
    const hostGeneration = randomUUID();
    const media = new MediaHostController(ctx, hostGeneration, send);
    const platformPending = new Map();
    const platform = new PlatformModelDirectory(ctx, {
        trustedSession: options => { const agent = ctx.agents.currentInitiator(); return agent !== undefined && options.sessionId === agent.id && ctx.sessions.get(agent.id) !== undefined ? String(agent.id) : undefined; },
        resolveAttachments: () => ctx.get('attachments'),
        resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
        admit: async (request) => {
            await assertResearchModelBudget(ctx, { sessionId: request.sessionId, requestId: request.clientRequestId, modelId: request.exactModelId, fundingSource: 'platform' });
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { platformPending.delete(request.clientRequestId); reject(new LlmError('Platform admission timed out', 'BUILTIN_PLATFORM_TIMEOUT')); }, 20000);
                platformPending.set(request.clientRequestId, { resolve, reject, timer });
                void send({ type: 'platform-admit', request }).catch(() => { clearTimeout(timer); platformPending.delete(request.clientRequestId); reject(new LlmError('Platform admission is unavailable', 'BUILTIN_PLATFORM_UNAVAILABLE')); });
            });
        },
    });
    const pending = new Map();
    const directory = new BuiltinModelDirectory(ctx, {
        hostGeneration,
        createAdapter: (route, headers, facts, purpose) => createBuiltinWireAdapter(route, headers, {
            ...facts === undefined ? {} : { facts },
            ...purpose === undefined ? {} : { purpose },
            resolveAttachments: () => ctx.get('attachments'),
            resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
        }),
        trustedConversation: (options) => {
            const agent = ctx.agents.currentInitiator();
            if (agent === undefined || options.sessionId !== agent.id)
                return undefined;
            const session = ctx.sessions.get(agent.id);
            if (session === undefined)
                return undefined;
            return {
                sessionId: String(agent.id), appendAudit: async (request) => {
                    session.append('studybuddy/builtin-request', request);
                    if (!await ctx.sessions.flush(session))
                        throw new LlmError('The built-in request audit is unavailable', 'BUILTIN_AUDIT_UNAVAILABLE');
                },
            };
        },
        admit: async (request) => {
            if (request.sessionId !== null)
                await assertResearchModelBudget(ctx, { sessionId: request.sessionId, requestId: request.clientRequestId, modelId: request.selection.exactModelId, fundingSource: request.selection.fundingSource });
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(request.clientRequestId);
                    reject(new LlmError('Built-in admission timed out', 'BUILTIN_REQUEST_TIMEOUT'));
                }, 15_000);
                pending.set(request.clientRequestId, { resolve, reject, timer });
                void send({ type: 'builtin-admit', request }).catch(() => {
                    clearTimeout(timer);
                    pending.delete(request.clientRequestId);
                    reject(new LlmError('Built-in admission is unavailable', 'BUILTIN_REQUEST_NOT_ADMITTED'));
                });
            });
        },
    });
    ctx.agentDefaultModel.requireExplicitSelection({
        provider: provider => directory.catalogVisible(provider) || platform.catalogVisible(provider), selection: selected => directory.selectionAllowed(selected.provider, selected.model) || platform.selectionAllowed(selected.provider, selected.model),
    });
    new NativeImageTools(ctx, {
        models: () => [...platform.imageToolModels(), ...directory.imageToolModels()],
        allowed: (provider, model) => directory.selectionAllowed(provider, model) || platform.selectionAllowed(provider, model),
    });
    ctx.effect(() => () => {
        for (const request of pending.values()) {
            clearTimeout(request.timer);
            request.reject(new LlmError('The Host has stopped', 'BUILTIN_HOST_UNAVAILABLE'));
        }
        pending.clear();
        for (const request of platformPending.values()) {
            clearTimeout(request.timer);
            request.reject(new LlmError('The Host has stopped', 'BUILTIN_HOST_UNAVAILABLE'));
        }
        platformPending.clear();
    });
    return {
        hostGeneration,
        command: async (action, data) => {
            switch (action) {
                case 'media-scope':
                    media.setScope(data);
                    return null;
                case 'platform-apply':
                    platform.apply(data, hostGeneration);
                    return null;
                case 'platform-revoke': {
                    const context = parseNativeBuiltinHostContextV1({ scope: data.scope, hostGeneration });
                    platform.revoke(context.scope);
                    return null;
                }
                case 'apply': return directory.apply(data);
                case 'readback': {
                    if (data === null || typeof data !== 'object' || !('scope' in data) || !('operationId' in data) ||
                        typeof data.operationId !== 'string')
                        throw new Error('BUILTIN_HOST_COMMAND_INVALID');
                    const context = parseNativeBuiltinHostContextV1({ scope: data.scope, hostGeneration });
                    return directory.readback(context.scope, data.operationId);
                }
                case 'publish':
                    directory.publishReady(parseNativeBuiltinCatalogPublishV1(data).readiness);
                    return null;
                case 'validate': return directory.validate(data);
                case 'revoke': {
                    if (data === null || typeof data !== 'object' || !('scope' in data))
                        throw new Error('BUILTIN_HOST_COMMAND_INVALID');
                    const context = parseNativeBuiltinHostContextV1({ scope: data.scope, hostGeneration });
                    if ('localRef' in data) {
                        if (typeof data.localRef !== 'string')
                            throw new Error('BUILTIN_HOST_COMMAND_INVALID');
                        directory.revokeSource(context.scope, data.localRef);
                    }
                    else {
                        directory.revoke(context.scope);
                        platform.revoke(context.scope);
                    }
                    return null;
                }
                default: throw new Error('BUILTIN_HOST_COMMAND_INVALID');
            }
        },
        admissionResult: (message) => {
            if (message === null || typeof message !== 'object' || !('clientRequestId' in message) ||
                typeof message.clientRequestId !== 'string')
                return;
            const request = pending.get(message.clientRequestId);
            if (request === undefined)
                return;
            clearTimeout(request.timer);
            pending.delete(message.clientRequestId);
            try {
                if ('error' in message || !('data' in message))
                    throw new Error('BUILTIN_REQUEST_NOT_ADMITTED');
                const result = parseNativeBuiltinFrozenRequestV1(message.data);
                if (result.clientRequestId !== message.clientRequestId)
                    throw new Error('BUILTIN_REQUEST_IDENTITY_MISMATCH');
                request.resolve(result);
            }
            catch {
                request.reject(new LlmError('The exact built-in request was not admitted', 'BUILTIN_REQUEST_NOT_ADMITTED'));
            }
        },
        mediaResult: message => media.result(message),
        platformAdmissionResult: message => {
            if (message === null || typeof message !== 'object' || !('clientRequestId' in message) || typeof message.clientRequestId !== 'string')
                return;
            const pending = platformPending.get(message.clientRequestId);
            if (pending === undefined)
                return;
            clearTimeout(pending.timer);
            platformPending.delete(message.clientRequestId);
            const failures = { NATIVE_TOOLS_UNAVAILABLE: '平台连接服务暂时不可用，请稍后重试。', NATIVE_TOOL_FUNDING_REQUIRED: 'AI 余额不足，请充值后重试。', NATIVE_TOOL_RATE_LIMITED: '连接请求过于频繁，请稍后重试。', NATIVE_TOOL_NOT_ALLOWED: '当前账号或设备不能使用该模型。', NATIVE_TOOL_BINDING_CONFLICT: '模型连接状态已改变，请重试。', NATIVE_TOOL_AUTHORITY_CHANGED: '模型授权已改变，请重新选择。', NATIVE_TOOL_MATERIAL_EXPIRED: '连接申请已过期，请重试。', NATIVE_TOOL_MATERIAL_CANCELLED: '上次连接申请已结束，请重试。', NATIVE_TOOL_MEMBERSHIP_RECONNECT_REQUIRED: '模型目录已更新，需要重新连接。', NATIVE_TOOL_BODY_INVALID: '平台模型连接请求无效。' };
            if ('error' in message) {
                const code = typeof message.error === 'string' && Object.hasOwn(failures, message.error) ? message.error : 'BUILTIN_PLATFORM_UNAVAILABLE';
                pending.reject(new LlmError(failures[code] ?? '平台模型连接失败，请重试。', code));
                return;
            }
            try {
                if (!('data' in message))
                    throw new Error('BUILTIN_PLATFORM_UNAVAILABLE');
                const value = parsePlatformPrepared(message.data);
                if (parsePlatformRequest(value.request).clientRequestId !== message.clientRequestId)
                    throw new Error('BUILTIN_PLATFORM_AUTHORITY_INVALID');
                pending.resolve(value);
            }
            catch {
                pending.reject(new LlmError('平台模型连接状态无效，请重试。', 'BUILTIN_PLATFORM_UNAVAILABLE'));
            }
        },
    };
}
/** Stable public error only; private source material and SDK errors never cross controls.
 * @param value - Caught private control failure.
 * @returns A secret-free built-in error code. */
export function builtinControlError(value) {
    if (value instanceof LlmError && value.code !== undefined && /^BUILTIN_[A-Z_]{1,64}$/.test(value.code))
        return value.code;
    return 'BUILTIN_HOST_REJECTED';
}
//# sourceMappingURL=studybuddy-builtin-models.js.map