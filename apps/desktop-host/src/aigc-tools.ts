/** Original AIGC tool descriptors execute on the domain; native agents own calls and durable results. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AigcProjectBinding } from './aigc-projects.ts'
import type { AigcToolRpc } from './aigc-tool-rpc.ts'
import { adaptAigcTool, AigcToolRecord } from './aigc-tool-adapter.ts'
import { z } from 'zod'
const catalogSchema = z.strictObject({ tools: z.array(AigcToolRecord).max(512) })
const resourceSchema = z.strictObject({ text: z.string().max(512 * 1024) })
const stateSchema = z.object({ connections: z.array(z.object({ state: z.object({ directory: z.string(), canvasId: z.string().nullable(), canvasRevision: z.number().int().nonnegative().optional() }) })) })

export class NativeAigcTools {
  private readonly mounts = new Map<Agent, { projectId: string; close(): Promise<void> }>()
  private readonly pending = new Map<Agent, Promise<void>>()
  private readonly fences = new WeakMap<Agent, { binding?: AigcProjectBinding }>()
  constructor(private readonly ctx: Context, private readonly rpc: Pick<AigcToolRpc, 'invoke'>,
    private readonly current: (binding: AigcProjectBinding) => boolean, private readonly owns: (id: string, binding: AigcProjectBinding) => boolean) {}
  mount(binding: AigcProjectBinding, agent: Agent, historyContext?: string): Promise<void> {
    if (this.mounts.has(agent)) return Promise.resolve()
    const previous = this.pending.get(agent); if (previous) return previous
    const work = this.attach(binding, agent, historyContext).finally(() => { this.pending.delete(agent) }); this.pending.set(agent, work); return work
  }
  /** A resumed private actor remains closed until Main has admitted and mounted it again. */
  protect(agent: Agent): void {
    if (this.fences.has(agent)) return
    const fence: { binding?: AigcProjectBinding } = {}; this.fences.set(agent, fence)
    const allowed = () => !!fence.binding && this.mounts.has(agent) && this.current(fence.binding) && this.owns(agent.id, fence.binding)
    agent.ctx.tools.guard(() => allowed() ? undefined : 'AIGC_SCOPE_REVOKED')
    agent.ctx.on('agent/pre-step', async (_payload, next) => {if(!allowed())await this.ctx.get('capabilities')?.restoreOrigin?.(agent);return allowed()?next():{kind:'reject' as const}})
  }
  private assert(binding: AigcProjectBinding, agent: Agent) {
    if (!this.current(binding) || !this.owns(agent.id, binding) || agent.session.header.cwd !== binding.authorizedRoot) throw Error('AIGC_SCOPE_REVOKED')
  }
  private async attach(binding: AigcProjectBinding, agent: Agent, historyContext?: string): Promise<void> {
    this.protect(agent)
    this.assert(binding, agent)
    const lifetime = new AbortController(), disposers: (() => unknown)[] = []
    const resources = async (signal: AbortSignal) => {
      this.assert(binding, agent)
      const value = resourceSchema.parse(await this.rpc.invoke(binding, agent.id, 'resources', 'aigc-resources', {}, signal))
      this.assert(binding, agent); return value.text
    }
    try {
      const catalog = catalogSchema.parse(await this.rpc.invoke(binding, agent.id, 'catalog', 'aigc-catalog', {}, lifetime.signal))
      this.assert(binding, agent)
      const names = catalog.tools.map(tool => tool.name)
      if (new Set(names).size !== names.length) throw Error('AIGC_PLUGIN_CONTRACT_INVALID')
      for (const tool of catalog.tools) disposers.push(agent.ctx.tools.register(adaptAigcTool(tool, async (args, exec, descriptor) => {
        this.assert(binding, agent)
        if (exec.agent !== agent) throw Error('AIGC_ACTOR_MISMATCH')
        const signal = AbortSignal.any([exec.signal, lifetime.signal])
        const state = stateSchema.parse(await this.rpc.invoke(binding, agent.id, 'state', exec.callId, {}, signal))
        const connections = state.connections.filter(row => row.state.directory === binding.authorizedRoot)
        if (connections.length > 1) throw Error('AIGC_CANVAS_AMBIGUOUS')
        const canvas = connections[0]?.state
        const value = await this.rpc.invoke(binding, agent.id, 'execute', exec.callId, { name: descriptor.name, arguments: args,
          schemaSha256: descriptor.schemaSha256, canvasId: canvas?.canvasId ?? null, expectedRevision: canvas?.canvasRevision ?? 0 }, signal)
        this.assert(binding, agent); return value
      }, images => this.ctx.attachments.saveImages(images))))
      // Shell/file bypasses cannot overwrite an editor document behind the coordinator.
      const nativeControl = new Set(['subagent', 'send_message', 'interrupt_agent', 'list_agents', 'list_subagent_models','present'])
      disposers.push(agent.ctx.tools.restrict({ allow: this.ctx.tools.schemas().filter(tool => nativeControl.has(tool.name)||this.ctx.get('capabilities')?.tools.permits(agent,tool.name)).map(tool => tool.name) }))
      disposers.push(agent.ctx.tools.presentAs('native'))
      disposers.push(agent.ctx.tools.guard(() => this.current(binding) ? undefined : 'AIGC_SCOPE_REVOKED'))
      if (historyContext) disposers.push(agent.ctx.systemPrompt.context({ name: 'studybuddy-aigc-history', order: 75, required: true, interpolate: false, text: historyContext }))
      const initial = await resources(lifetime.signal)
      disposers.push(agent.ctx.systemPrompt.context({ name: 'studybuddy-aigc', order: 70, required: true, interpolate: false, text: initial }))
      disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        const text = await resources(context.signal ? AbortSignal.any([context.signal, lifetime.signal]) : lifetime.signal)
        const result = await next()
        return { ...result, contexts: [...result.contexts.filter(row => row.name !== 'studybuddy-aigc'), { name: 'studybuddy-aigc', text, interpolate: false }] }
      }, { prepend: true }))
      this.assert(binding, agent)
      this.fences.get(agent)!.binding = binding
      this.mounts.set(agent, { projectId: binding.projectId, close: async () => { delete this.fences.get(agent)!.binding; lifetime.abort(); for (const dispose of disposers.reverse()) await dispose() } })
    } catch (error) { lifetime.abort(); for (const dispose of disposers.reverse()) await dispose(); throw error }
  }
  async unmount(projectId?: string): Promise<void> {
    for (const [agent, row] of this.mounts) if (projectId === undefined || row.projectId === projectId) { this.mounts.delete(agent); await row.close() }
    await Promise.allSettled(this.pending.values())
  }
  async disposed(agent: Agent): Promise<void> { const row = this.mounts.get(agent); if (row) { this.mounts.delete(agent); await row.close() } }
}
