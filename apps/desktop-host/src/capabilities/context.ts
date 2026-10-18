import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-workspace'
import type { NativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import { parseHarnessCapabilityInvocationV1 } from '@studybuddy/contracts'
import type { CapabilityContext } from './types.ts'

/** Only a live native execution can establish a capability caller. */
export function capabilityContext(ctx: Context, owner: NativeBuiltinHostContextV1, exec: { agent?: Agent | undefined; callId: string; signal: AbortSignal }): CapabilityContext {
  const agent = exec.agent
  if (!agent || ctx.agents.get(agent.id) !== agent || agent.session.id !== agent.id || ctx.sessions.get(agent.id) !== agent.session) throw Error('CAPABILITY_SESSION_REQUIRED')
  exec.signal.throwIfAborted()
  const workspaceId = ctx.get('workspaceRegistry')?.list().find(workspace => workspace.sessionIds.includes(agent.id))?.id ?? null
  const caller = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: { ...owner, callerSessionId: agent.id, workspaceId, toolCallId: exec.callId }, operation: 'catalog', target: null, input: null }).caller
  return { caller, agent, signal: exec.signal }
}
