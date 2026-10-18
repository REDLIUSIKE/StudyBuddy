import { SessionId } from '@deepseek-ai/dsh-session';
import { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import { brandString } from '@deepseek-ai/dsh-brand';
import { parseHarnessAigcContextV1, parseHarnessCapabilityInvocationV1 } from '@studybuddy/contracts';
import { createNativeAigcProjects } from "./aigc-projects.js";
import { NativeAigcTools } from "./aigc-tools.js";
import { AigcToolRpc } from "./aigc-tool-rpc.js";
import { askAigcQuestion } from "./aigc-question.js";
import { NativeAigcTemporary } from "./aigc-temporary.js";
import { nativeTemporaryCommand } from "./aigc-temporary-control.js";
import { nativeAigcRecords } from "./aigc-records.js";
import { z } from 'zod';
const nativeSchema = z.strictObject({ context: z.unknown(), operationId: z.uuid(), operation: z.enum(['question', 'temporary']), input: z.unknown(), caller: z.unknown().optional() });
const questionSchema = z.strictObject({ sessionId: z.string(), callId: z.string(), question: z.unknown() });
export function installAigcHostControl(ctx, hostGeneration, send) {
    const projects = createNativeAigcProjects(ctx, hostGeneration);
    const current = (binding) => !!projects.binding(binding);
    const rpc = new AigcToolRpc({ send, current });
    const tools = new NativeAigcTools(ctx, rpc, current, (id, binding) => projects.owningBinding(id)?.sessionId === binding.sessionId);
    const temporary = new NativeAigcTemporary(ctx, projectId => !!projects.project(projectId));
    const operations = new Map();
    const abort = (projectId) => { for (const row of operations.values())
        if (!projectId || row.projectId === projectId)
            row.abort.abort(Error('AIGC_SCOPE_REVOKED')); };
    ctx.on('agent/created', async ({ agent }) => {
        if (temporary.ownsSession(agent.id))
            return;
        if (/(?:^|[\\/])studybuddy-aigc[\\/]accounts[\\/][a-f0-9]{64}[\\/](?:workspaces|native-helpers)(?:[\\/]|$)/i.test(agent.session.header.cwd ?? ''))
            tools.protect(agent);
        const binding = projects.owningBinding(agent.id);
        if (binding)
            await tools.mount(binding, agent);
    });
    ctx.on('agent/disposed', ({ agent }) => { void tools.disposed(agent).catch(() => { }); });
    ctx.effect(() => async () => { abort(); rpc.revoke(); await temporary.close(); await projects.setScope(null); await tools.unmount(); });
    return { toolResult: value => rpc.result(value), async command(action, data) {
            if (action === 'scope') {
                if (!projects.matchesScope(data)) {
                    abort();
                    rpc.revoke();
                    await temporary.close();
                    await projects.setScope(data);
                    await tools.unmount();
                }
                return null;
            }
            if (action === 'bind')
                return projects.bind(data);
            if (action === 'records') {
                const input = z.strictObject({ context: z.unknown() }).parse(data), binding = projects.binding(parseHarnessAigcContextV1(input.context));
                const agent = binding && ctx.agents.get(SessionId(binding.sessionId));
                if (!agent)
                    throw Error('AIGC_SCOPE_REVOKED');
                return nativeAigcRecords(agent);
            }
            if (action === 'submit') {
                const input = z.strictObject({ context: z.unknown(), requestId: z.uuid(), selection: z.strictObject({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }),
                    content: z.array(z.discriminatedUnion('type', [z.strictObject({ type: z.literal('text'), text: z.string().max(100000) }),
                        z.strictObject({ type: z.literal('image'), mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), data: z.string().max(28_000_000).base64(), name: z.string().max(256) })])).min(1).max(41) }).parse(data);
                const binding = projects.binding(parseHarnessAigcContextV1(input.context));
                if (!binding)
                    throw Error('AIGC_SCOPE_REVOKED');
                const sessionId = SessionId(binding.sessionId);
                await ctx.sessionController.selectModel({ sessionId, provider: input.selection.provider, model: input.selection.model,
                    ...(input.selection.reasoningEffort === undefined ? {} : { reasoningEffort: input.selection.reasoningEffort }) });
                if (!projects.binding(binding))
                    throw Error('AIGC_SCOPE_REVOKED');
                return ctx.sessionController.prompt({ sessionId, requestId: brandString(input.requestId), mode: 'queue', content: input.content }, new AbortController().signal);
            }
            if (action === 'tools') {
                const input = z.strictObject({ context: z.unknown(), historyContext: z.string().max(65536).optional() }).parse(data), binding = projects.binding(parseHarnessAigcContextV1(input.context));
                const agent = binding && ctx.agents.get(SessionId(binding.sessionId));
                if (!binding || !agent)
                    throw Error('AIGC_SCOPE_REVOKED');
                await tools.mount(binding, agent, input.historyContext);
                return null;
            }
            if (action === 'chat-title' || action === 'project-title') {
                const input = z.strictObject({ context: z.unknown(), title: z.string().trim().min(1).max(200) }).parse(data), binding = projects.binding(parseHarnessAigcContextV1(input.context));
                if (!binding)
                    throw Error('AIGC_SCOPE_REVOKED');
                if (action === 'chat-title')
                    await ctx.sessionController.rename({ sessionId: SessionId(binding.sessionId), title: input.title });
                else
                    await ctx.workspaceController.rename({ workspaceId: WorkspaceId(binding.workspaceId), title: input.title });
                if (!projects.binding(binding))
                    throw Error('AIGC_SCOPE_REVOKED');
                return null;
            }
            if (action === 'project-close') {
                const { projectId } = z.strictObject({ projectId: z.string().regex(/^aigc-[a-f0-9]{48}$/) }).parse(data);
                abort(projectId);
                rpc.revoke(projectId);
                await temporary.close(projectId);
                await projects.close(projectId);
                await tools.unmount(projectId);
                return null;
            }
            if (action === 'cancel-native') {
                const input = z.strictObject({ operationId: z.uuid(), context: z.unknown() }).parse(data), binding = projects.binding(parseHarnessAigcContextV1(input.context));
                const row = operations.get(input.operationId);
                if (binding && row?.projectId === binding.projectId)
                    row.abort.abort(Error('AIGC_OPERATION_CANCELLED'));
                return null;
            }
            if (action === 'native') {
                const input = nativeSchema.parse(data), context = parseHarnessAigcContextV1(input.context), binding = projects.binding(context);
                if (!binding || operations.has(input.operationId) || operations.size >= 128)
                    throw Error('AIGC_SCOPE_REVOKED');
                const caller = input.caller === undefined ? undefined : parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: input.operationId, caller: input.caller, operation: 'catalog', target: null, input: null }).caller;
                if (caller && (caller.hostGeneration !== hostGeneration || JSON.stringify(caller.scope) !== JSON.stringify(context.scope) || !ctx.agents.get(SessionId(caller.callerSessionId))))
                    throw Error('AIGC_SCOPE_REVOKED');
                const controller = new AbortController();
                operations.set(input.operationId, { projectId: binding.projectId, abort: controller });
                try {
                    if (input.operation === 'temporary') {
                        const parent = ctx.agents.get(SessionId(caller?.callerSessionId ?? binding.sessionId));
                        if (!parent)
                            throw Error('AIGC_SCOPE_REVOKED');
                        const result = await nativeTemporaryCommand(ctx, temporary, parent, binding.projectId, input.input, controller.signal);
                        controller.signal.throwIfAborted();
                        if (!projects.binding(context))
                            throw Error('AIGC_SCOPE_REVOKED');
                        return result;
                    }
                    if (input.operation === 'question') {
                        const call = questionSchema.parse(input.input), owner = projects.owningBinding(call.sessionId), agent = ctx.agents.get(SessionId(call.sessionId));
                        if (!agent || (caller ? call.sessionId !== caller.callerSessionId || call.callId !== caller.toolCallId : owner?.sessionId !== binding.sessionId))
                            throw Error('AIGC_SCOPE_REVOKED');
                        const interactionOwner = caller ? agent : ctx.agents.get(SessionId(binding.sessionId));
                        if (!interactionOwner || !caller && !ctx.agents.roots().includes(interactionOwner))
                            throw Error('AIGC_QUESTION_OWNER_UNAVAILABLE');
                        const result = await askAigcQuestion(ctx, interactionOwner, call.question, controller.signal);
                        controller.signal.throwIfAborted();
                        if (!projects.binding(context))
                            throw Error('AIGC_SCOPE_REVOKED');
                        return result;
                    }
                    throw Error('AIGC_REQUEST_INVALID');
                }
                finally {
                    operations.delete(input.operationId);
                }
            }
            throw Error('AIGC_REQUEST_INVALID');
        } };
}
//# sourceMappingURL=aigc-control.js.map