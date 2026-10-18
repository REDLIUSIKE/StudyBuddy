import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NativeVideoProjects, parseVideoProjectAdmission } from "./video-projects.js";
import { NativeVideoTools } from "./video-editing-tools.js";
import { translateVideoLines, exportVideoSession } from "./video-native.js";
import { parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts';
const Scope = z.strictObject({ accountGeneration: z.string(), workspaceId: z.string(), projectId: z.string(), sessionId: z.string() });
/** Add video capabilities to admitted native Agents; the normal Host owns all chat. */
export function installVideoHostControl(ctx, hostGeneration, send) {
    const projects = new NativeVideoProjects(ctx, hostGeneration), pending = new Map();
    const operations = new Map();
    let revoking = false;
    const closingProjects = new Set(), current = (scope) => !revoking && !closingProjects.has(scope.projectId) && !!projects.binding(scope);
    const stop = async (projectId) => { const owned = [...operations.values()].filter(row => projectId === undefined || row.scope.projectId === projectId); for (const row of owned)
        row.controller.abort(); await Promise.allSettled(owned.map(row => row.done)); };
    const tools = new NativeVideoTools(ctx, { current, invoke: async (scope, operation, toolCallId, input, signal) => {
            signal.throwIfAborted();
            if (!current(scope))
                throw Error('VIDEO_SCOPE_REVOKED');
            const rpcId = randomUUID(), request = { rpcId, hostGeneration, scope, operation, toolCallId, input };
            return new Promise((resolve, reject) => {
                const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); pending.delete(rpcId); };
                const cancel = () => { cleanup(); void send({ type: 'video-tool-cancel', rpcId, hostGeneration, scope }).catch(() => { }); reject(Error('VIDEO_TOOL_CANCELLED')); };
                const timer = setTimeout(cancel, 300000);
                timer.unref();
                signal.addEventListener('abort', cancel, { once: true });
                pending.set(rpcId, { scope, resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); }, cleanup });
                void send({ type: 'video-tool-request', request }).catch(() => { cleanup(); reject(Error('VIDEO_CHANNEL_CLOSED')); });
            });
        } });
    const revoke = async () => { revoking = true; for (const row of [...pending.values()])
        row.reject(Error('VIDEO_SCOPE_REVOKED')); await stop(); await tools.unmount(); await projects.setScope(null); };
    ctx.effect(() => revoke);
    return { toolResult: value => {
            const parsed = z.object({ rpcId: z.string(), data: z.unknown().optional(), error: z.string().optional() }).safeParse(value);
            if (!parsed.success)
                return;
            const row = pending.get(parsed.data.rpcId);
            if (!row)
                return;
            if (!current(row.scope)) {
                row.reject(Error('VIDEO_SCOPE_REVOKED'));
                return;
            }
            parsed.data.error ? row.reject(Error(/^VIDEO_[A-Z_]+$/.test(parsed.data.error) ? parsed.data.error : 'VIDEO_TOOL_FAILED')) : row.resolve(parsed.data.data);
        }, command: async (action, data) => {
            if (action === 'scope') {
                if (!projects.matchesScope(data)) {
                    await revoke();
                    await projects.setScope(data);
                    closingProjects.clear();
                    revoking = false;
                }
                return null;
            }
            if (action === 'bind') {
                const input = parseVideoProjectAdmission(data);
                if (revoking || closingProjects.has(input.projectId))
                    throw Error('VIDEO_SCOPE_REVOKED');
                return projects.bind(input);
            }
            if (action === 'tools') {
                const scope = Scope.parse(data);
                if (!current(scope))
                    throw Error('VIDEO_SCOPE_REVOKED');
                await tools.mount(scope);
                return null;
            }
            if (action === 'project-close') {
                const input = z.strictObject({ projectId: z.string(), scope: z.unknown(), hostGeneration: z.string() }).parse(data), owner = parseNativeBuiltinHostContextV1({ scope: input.scope, hostGeneration: input.hostGeneration }), projectId = input.projectId;
                const check = () => { if (!projects.matchesScope(owner))
                    throw Error('VIDEO_SCOPE_REVOKED'); };
                check();
                closingProjects.add(projectId);
                for (const row of [...pending.values()])
                    if (row.scope.projectId === projectId)
                        row.reject(Error('VIDEO_SCOPE_REVOKED'));
                await stop(projectId);
                check();
                await projects.close(projectId);
                check();
                closingProjects.delete(projectId);
                return null;
            }
            if (action === 'cancel-native') {
                const input = z.strictObject({ scope: Scope, operationId: z.uuid() }).parse(data), row = operations.get(input.operationId);
                if (row && projects.binding(input.scope) && Object.keys(row.scope).every(key => Reflect.get(row.scope, key) === Reflect.get(input.scope, key)))
                    row.controller.abort();
                return null;
            }
            if (action === 'native') {
                const input = z.strictObject({ scope: Scope, operationId: z.uuid(), operation: z.enum(['translate', 'session-export']), input: z.unknown(), callerSessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/).optional() }).parse(data), binding = projects.binding(input.scope);
                if (!binding || !current(input.scope) || operations.has(input.operationId) || operations.size >= 128)
                    throw Error('VIDEO_SCOPE_REVOKED');
                const controller = new AbortController(), check = () => { controller.signal.throwIfAborted(); if (!current(input.scope))
                    throw Error('VIDEO_SCOPE_REVOKED'); };
                const done = Promise.resolve().then(async () => {
                    check();
                    if (input.operation === 'session-export') {
                        z.strictObject({}).parse(input.input);
                        return exportVideoSession(ctx, binding, input.operationId, controller.signal, check);
                    }
                    const data = await translateVideoLines(ctx, binding, input.operationId, input.input, controller.signal, check, input.callerSessionId);
                    check();
                    return { data, artifacts: [], receiptRef: input.operationId };
                });
                operations.set(input.operationId, { scope: input.scope, controller, done });
                try {
                    return await done;
                }
                finally {
                    operations.delete(input.operationId);
                }
            }
            throw Error('VIDEO_COMMAND_INVALID');
        } };
}
//# sourceMappingURL=video-control.js.map