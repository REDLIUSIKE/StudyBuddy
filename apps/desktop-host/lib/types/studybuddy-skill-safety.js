import { SessionId } from '@deepseek-ai/dsh-session';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { parseSkillSafetyErrorCode } from '@deepseek-ai/dsh-skill-safety-assistant/errors';
import { createSkillSafetyProvider } from '@deepseek-ai/dsh-skill-safety-assistant/provider';
import { parseSkillSafetyInvocation, parseSkillSafetyPrepared, parseSkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/wire';
import { parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts';
import { randomUUID } from 'node:crypto';
import { SkillSafetyEntry } from "./skill-safety-entry.js";
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { join, resolve } from 'node:path';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
/** Install the private native provider; never create a model turn at startup.
 * @param ctx - Original native Host.
 * @param send - Existing private child-process IPC.
 * @param hostGeneration - Existing fixed live Host identity.
 * @returns The closed Host control. */
export function installSkillSafetyHostControl(ctx, send, hostGeneration) {
    let scope = null;
    const sessions = new Set();
    const entry = new SkillSafetyEntry(ctx, () => scope?.scope);
    const pending = new Map();
    const current = (actor) => !!scope && scope.scope.accountId === actor.accountId && scope.scope.generation === actor.generation && sessions.has(actor.sessionId) && ctx.sessions.get(actor.sessionId)?.header.agentPreset === 'skill-safety';
    const actorFor = (agent) => {
        const actor = scope && { ...scope.scope, sessionId: agent.session.id };
        if (!actor || !current(actor) || ctx.agents.get(agent.id) !== agent || !ctx.agents.roots().includes(agent) || agent.id !== actor.sessionId)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        return Object.freeze(actor);
    };
    const rpc = (actor, operation, signal) => {
        if (signal.aborted)
            return Promise.reject(new SkillSafetyError('SKILL_SAFETY_CANCELLED'));
        const request = parseSkillSafetyInvocation({ rpcId: randomUUID(), context: { hostGeneration, actor }, operation });
        if (request.operation.kind !== 'release' && !current(actor))
            return Promise.reject(new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'));
        return new Promise((resolve, reject) => {
            let timer;
            const row = { request, cancelled: false, resolve, reject,
                cleanup: () => { clearTimeout(timer); signal.removeEventListener('abort', row.cancel); },
                cancel: () => {
                    if (row.cancelled)
                        return;
                    row.cancelled = true;
                    clearTimeout(timer);
                    // Main answers after its aborted downloader/worker is quiescent.
                    timer = setTimeout(() => { pending.delete(request.rpcId); row.cleanup(); reject(new SkillSafetyError('SKILL_SAFETY_OUTCOME_UNKNOWN')); }, 30_000);
                    timer.unref();
                    void send({ type: 'skill-safety-cancel', rpcId: request.rpcId, context: request.context }).catch(() => { pending.delete(request.rpcId); row.cleanup(); reject(new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE')); });
                } };
            timer = setTimeout(row.cancel, 20 * 60_000);
            timer.unref();
            pending.set(request.rpcId, row);
            signal.addEventListener('abort', row.cancel, { once: true });
            void send({ type: 'skill-safety-request', request }).catch(() => { pending.delete(request.rpcId); row.cleanup(); reject(new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE')); });
        });
    };
    const control = {
        bindRootAgent: actorFor,
        preflight: async (invocation, command) => parseSkillSafetyPrepared(await rpc(invocation.actor, { kind: 'preflight', command }, invocation.signal)),
        execute: async (invocation, prepared, answer) => parseSkillSafetyResult(await rpc(invocation.actor, { kind: 'execute', prepared, ...(answer === undefined ? {} : { answer }) }, invocation.signal)),
        release: async (invocation, prepared) => { await rpc(invocation.actor, { kind: 'release', prepared }, AbortSignal.timeout(10_000)); },
        presentation: async (sessionId) => ({ sessionId, guide: !!scope && sessions.has(sessionId) && ctx.sessions.get(sessionId)?.header.agentPreset === 'skill-safety' }),
        result: value => {
            if (!value || typeof value !== 'object' || !('rpcId' in value) || typeof value.rpcId !== 'string')
                return;
            const row = pending.get(value.rpcId);
            if (!row)
                return;
            pending.delete(value.rpcId);
            row.cleanup();
            if (row.cancelled) {
                row.reject(new SkillSafetyError('SKILL_SAFETY_CANCELLED'));
                return;
            }
            if (row.request.operation.kind !== 'release' && !current(row.request.context.actor)) {
                row.reject(new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'));
                return;
            }
            if ('error' in value && value.error !== undefined) {
                row.reject(new SkillSafetyError(parseSkillSafetyErrorCode(value.error)));
                return;
            }
            if (!('data' in value)) {
                row.reject(new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID'));
                return;
            }
            row.resolve(value.data);
        },
        command: async (action, data) => {
            if (action === 'scope') {
                const next = data === null ? null : parseNativeBuiltinHostContextV1(data);
                if (next && next.hostGeneration !== hostGeneration)
                    throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
                if (JSON.stringify(scope) !== JSON.stringify(next)) {
                    const owned = [...sessions].flatMap(id => { const agent = ctx.agents.get(id); return agent ? [agent] : []; });
                    scope = next;
                    sessions.clear();
                    for (const row of pending.values())
                        row.cancel();
                    for (const agent of owned)
                        agent.cancel({ kind: 'parent' });
                    await Promise.all(owned.map(agent => agent.whenIdle()));
                }
                return null;
            }
            if (action === 'begin-session') {
                if (!scope || !data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('requestId' in data) || typeof data.requestId !== 'string')
                    throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
                return entry.beginSkillSafetySession(data.requestId);
            }
            if (action === 'registry-readback') {
                if (!scope || !data || typeof data !== 'object' || Object.keys(data).length !== 4 || !('sessionId' in data) || typeof data.sessionId !== 'string' || !('name' in data) || typeof data.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || !('directory' in data) || typeof data.directory !== 'string' || resolve(data.directory) !== resolve(join(resolveDshHome(), 'skills', data.name)) || !('digest' in data) || typeof data.digest !== 'string' || !/^[a-f0-9]{64}$/.test(data.digest))
                    throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
                const id = SessionId(data.sessionId), captured = scope;
                if (!sessions.has(id) || ctx.sessions.get(id)?.header.agentPreset !== 'skill-safety')
                    throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
                // Discover metadata through the actual registry, without get()/body/context injection.
                const lifecycle = new AbortController();
                let provider;
                const unregister = ctx.skills.registerProvider(control => provider = new FileSystemSkillProvider(ctx, control, { providerName: 'skill-safety-readback-' + randomUUID(), watch: false }));
                try {
                    const catalog = await ctx.skills.snapshot({ cwd: ctx.sessions.get(id).header.cwd, signal: lifecycle.signal });
                    return scope === captured && catalog.complete && catalog.skills.some(skill => skill.name === data.name && skill.path !== undefined && resolve(skill.path) === resolve(join(data.directory, 'SKILL.md')));
                }
                finally {
                    lifecycle.abort();
                    unregister();
                    await provider?.dispose();
                }
            }
            if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('sessionId' in data) || typeof data.sessionId !== 'string' || data.sessionId.length > 256)
                throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
            const id = SessionId(data.sessionId);
            if (!scope || ctx.sessions.get(id)?.header.agentPreset !== 'skill-safety')
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            if (action === 'bind') {
                sessions.add(id);
                return { ...scope.scope, sessionId: id };
            }
            if (!sessions.has(id))
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            if (action === 'inspect-model')
                return ctx.sessionController.inspectLiveModelSelection(id) ?? null;
            throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
        },
    };
    ctx.skillSafety.registerProvider(createSkillSafetyProvider(ctx, control));
    ctx.effect(() => () => { scope = null; sessions.clear(); for (const row of pending.values())
        row.cancel(); });
    return control;
}
//# sourceMappingURL=studybuddy-skill-safety.js.map