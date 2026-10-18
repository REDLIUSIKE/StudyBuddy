/** Workspace-backed Session creation for one settled webhook rule result. */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { brandString } from '@deepseek-ai/dsh-brand';
import { boundContextSummary, createUserMessage, errorChain } from '@deepseek-ai/dsh-llm';
/** Require one non-empty string field from an untyped rule result. */
function requiredString(record, field) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`webhook Session request ${field} must be a non-empty string`);
    }
    return value;
}
/** Snapshot and validate a same-process rule result before crossing awaits. */
function resolveRequest(ctx, input) {
    const candidate = input;
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new TypeError('webhook rule result must be null or a Session request object');
    }
    const record = candidate;
    const workspacePath = requiredString(record, 'workspacePath');
    if (!isAbsolute(workspacePath)) {
        throw new TypeError(`webhook Session request workspacePath must be absolute, got ${JSON.stringify(workspacePath)}`);
    }
    const title = requiredString(record, 'title');
    const prompt = requiredString(record, 'prompt');
    const agentPreset = requiredString(record, 'agentPreset');
    const permissionPreset = requiredString(record, 'permissionPreset');
    const model = record['model'];
    if (model !== undefined && (model === null || typeof model !== 'object' || Array.isArray(model))) {
        throw new TypeError('webhook Session request model must be an object');
    }
    let agentOptions;
    let modelSelection;
    if (model === undefined) {
        const selected = ctx.agentDefaultModel.currentSelection();
        agentOptions = { provider: selected.provider, model: selected.model };
        modelSelection = { ...selected };
    }
    else {
        const modelRecord = model;
        const provider = requiredString(modelRecord, 'provider');
        const modelId = requiredString(modelRecord, 'model');
        const maxTokens = modelRecord['maxTokens'];
        if (maxTokens !== undefined
            && (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens <= 0)) {
            throw new TypeError('webhook Session request model.maxTokens must be a positive safe integer');
        }
        agentOptions = {
            provider,
            model: modelId,
            ...(maxTokens === undefined ? {} : { maxTokens }),
        };
        modelSelection = { provider, model: modelId };
    }
    return { workspacePath, title, prompt, agentPreset, permissionPreset, modelSelection, agentOptions };
}
/** Log a rollback failure without replacing the operation's original failure. */
function reportRollbackFailure(ctx, subject, error) {
    ctx.logger.warn(`webhook: ${subject} rollback failed: ${errorChain(error)}`);
}
/** Apply the creation-time selection until its first durable request header exists. */
function installInitialModelSelection(agentCtx, selection) {
    agentCtx.on('agent/request', async ({ agent }, next) => {
        const resolved = await next();
        if (agent.session.requestHeader() !== undefined
            || resolved.provider !== selection.provider
            || resolved.model !== selection.model)
            return resolved;
        const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved;
        return {
            ...withoutInheritedEffort,
            ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
        };
    });
}
/**
 * Create, attach, title, configure, and prompt one ordinary root Session.
 * Successful prompt admission ends webhook ownership of the operation; the
 * Agent remains lifecycle-owned by `ctx` and follows normal Session behavior.
 *
 * @param ctx - untraced runtime context that owns the resulting Agent.
 * @param delivery - exact verified provider delivery recorded in the message source.
 * @param ruleId - rule that returned the request.
 * @param request - same-process rule result.
 * @param signal - registration lifetime cancellation through publication.
 */
export async function createWebhookSession(ctx, delivery, ruleId, request, signal) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const resolved = resolveRequest(ctx, request);
        ctx.permissionPresets.resolve(resolved.permissionPreset);
        const preset = await ctx.agentPresets.resolve(resolved.agentPreset);
        const presetScope = __addDisposableResource(env_1, await ctx.agentPresets.acquireScope(preset.id), true);
        void presetScope;
        signal.throwIfAborted();
        const workspace = await ctx.workspaceRegistry.create(resolved.workspacePath);
        signal.throwIfAborted();
        const sessionId = brandString(`webhook-${randomUUID()}`);
        const handle = await ctx.agents.create({
            sessionId,
            signal,
            meta: { cwd: workspace.path, agentPreset: preset.id },
            agentOptions: resolved.agentOptions,
            setup: async (agentCtx) => {
                await ctx.agentPresets.mount(agentCtx, preset.id);
                installInitialModelSelection(agentCtx, resolved.modelSelection);
            },
        });
        let attached = false;
        try {
            signal.throwIfAborted();
            await workspace.attachSession(sessionId);
            attached = true;
            signal.throwIfAborted();
            ctx.permissionPresets.set(handle.agent.session, resolved.permissionPreset);
            ctx.sessionTitle.rename(handle.agent.session, resolved.title);
            handle.agent.followup(createUserMessage({
                content: [{ type: 'text', text: resolved.prompt }],
                source: {
                    kind: 'webhook',
                    provider: delivery.kind,
                    source: delivery.source,
                    deliveryId: delivery.deliveryId,
                    ruleId,
                    form: 'notice',
                    summary: boundContextSummary(`${delivery.kind} webhook handled by ${ruleId}`),
                },
            }));
        }
        catch (error) {
            if (attached) {
                try {
                    await workspace.detachSession(sessionId);
                }
                catch (rollbackError) {
                    reportRollbackFailure(ctx, `Workspace detach for Session "${sessionId}"`, rollbackError);
                }
            }
            try {
                await handle.dispose();
            }
            catch (rollbackError) {
                reportRollbackFailure(ctx, `Agent disposal for Session "${sessionId}"`, rollbackError);
            }
            throw error;
        }
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
}
//# sourceMappingURL=session.js.map