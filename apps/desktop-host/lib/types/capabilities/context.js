import { randomUUID } from 'node:crypto';
import { parseHarnessCapabilityInvocationV1 } from '@studybuddy/contracts';
/** Only a live native execution can establish a capability caller. */
export function capabilityContext(ctx, owner, exec) {
    const agent = exec.agent;
    if (!agent || ctx.agents.get(agent.id) !== agent || agent.session.id !== agent.id || ctx.sessions.get(agent.id) !== agent.session)
        throw Error('CAPABILITY_SESSION_REQUIRED');
    exec.signal.throwIfAborted();
    const workspaceId = ctx.get('workspaceRegistry')?.list().find(workspace => workspace.sessionIds.includes(agent.id))?.id ?? null;
    const caller = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: { ...owner, callerSessionId: agent.id, workspaceId, toolCallId: exec.callId }, operation: 'catalog', target: null, input: null }).caller;
    return { caller, agent, signal: exec.signal };
}
//# sourceMappingURL=context.js.map