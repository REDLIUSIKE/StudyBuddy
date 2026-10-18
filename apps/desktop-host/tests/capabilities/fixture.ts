import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import Approval from '@deepseek-ai/dsh-user-approval'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryStorageBackend } from '../../../../packages/storage/storage-domain/tests/helpers/memory-backend.ts'
import type {CapabilityToolDescriptor,CapabilityAdapter} from '../../src/capabilities/types.ts'

export const owner = { scope: { accountId: 'account-a', generation: 1 }, hostGeneration: '00000000-0000-4000-8000-000000000004' }
export async function fixture() {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: process.cwd() })
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.effect(() => () => facility.closeAll(), 'capabilities.test-storage')
  await ctx.plugin(AgentLoop, { agents: [] })
  const make = async (id: string) => (await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const agent = await make('session-video-00000000-0000-4000-8000-000000000001')
  const other = await make('session-00000000-0000-4000-8000-000000000002')
  const call = (name: string, args: unknown, actor = agent) => ctx.tools.execute({ name, agent: actor, callId: ToolCallId('call-' + crypto.randomUUID()), arguments: args, signal: new AbortController().signal })
  return { ctx, agent, other, call, close: () => ctx.fiber.dispose() }
}
export function documentAdapter():CapabilityAdapter&{descriptor:CapabilityToolDescriptor} {
  const descriptor:CapabilityToolDescriptor = { name: 'writeChapter', description: 'Save one chapter.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, output: { type: 'object', properties: { saved: { type: 'boolean' } }, required: ['saved'], additionalProperties: false }, effect: 'write' }
  return {
    id: 'novel', revision: 'a'.repeat(64), descriptor,
    async describe() { return { id: this.id, revision: this.revision, label: 'Novel', artifactSchemas: {} } },
    async listProjects() { return [] },
    async bind() { return { moduleId: 'novel', projectRef: 'novel-one' } },
    async tools() { return [this.descriptor] },
    async execute() { return { data: { saved: true }, artifacts: [], operationRef: null } },
    async status() { return { data: { state: 'completed' }, artifacts: [], operationRef: null } },
    async cancel() { return { data: { stopped: true }, artifacts: [], operationRef: null } },
    async release() {},
  }
}
