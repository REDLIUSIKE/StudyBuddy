/** Scoped research tools supplement the existing native files, shell, skills, MCP and questions. */
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, PreToolDecision, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ResearchProjectBinding } from './research-session-execution.ts'
import type { ResearchToolRpc } from './research-tool-rpc.ts'
import { researchPresentationSchema } from './research-tool-schema.ts'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { NativeResearchConnectors } from './research-connectors.ts'
import {mountResearchWebSearch} from './research-web-search.ts'
const operations = { notebook: 'notebook', notebook_search: 'memory', add_pdf_annotation: 'pdf-annotations', list_pdf_annotations: 'pdf-annotations', remove_pdf_annotation: 'pdf-annotations',scientific_result:'advanced',research_web_search:'services',research_literature_search:'services',research_compute:'services',research_specialist:'advanced',research_fusion:'advanced',research_mission:'advanced',research_schedule:'advanced',research_workflow:'advanced' } as const
interface Owners { authorizeMission?(context: ResearchProjectBinding,exec:ToolRunContext,input:unknown):()=>void }
/** Attach only to an admitted project's real Agent context; detach on account/project revocation. */
export class NativeResearchTools {
  private readonly mounts = new Map<string, { projectId: string; dispose(): Promise<void> }>()
  private readonly connectors: NativeResearchConnectors
  constructor(private readonly ctx: Context, private readonly rpc: ResearchToolRpc, private readonly current: (context: ResearchProjectBinding) => boolean,private readonly mountReview?:(binding:ResearchProjectBinding,value:unknown)=>void,private readonly owners:Owners={}) { this.connectors = new NativeResearchConnectors(ctx, current) }
  /** Read the source-owned catalog and compose it with the actual native tool registry. */
  async mount(binding: ResearchProjectBinding,actor?:NonNullable<ReturnType<Context['agents']['get']>>): Promise<void> {
    const agent = actor??this.ctx.agents.get(SessionId(binding.sessionId))
    if (!agent || !this.current(binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    if(actor&&!this.owns(binding.sessionId,actor.id))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    if(this.mounts.has(agent.id))return
    const catalog = await this.rpc.invoke(binding, 'catalog', 'research-tool-catalog', {}, new AbortController().signal)
    if (!this.current(binding) || !catalog || typeof catalog !== 'object' || !('tools' in catalog) || !Array.isArray(catalog.tools) || catalog.tools.length < 5 || catalog.tools.length > Object.keys(operations).length) throw Error('HARNESS_RESEARCH_TOOL_SCHEMA_INVALID')
    const disposers: (() => unknown)[] = [], names = new Set<string>()
    try {
      if (agent.ctx.get('skills')) {
        const root = binding.authorizedRoots[0]!, roots = [join(root, '.pi', 'skills')]
        if (basename(root) === 'sandbox' && basename(dirname(root)) === binding.projectId && basename(dirname(dirname(root))) === 'projects') roots.push(join(dirname(dirname(dirname(root))), 'native-adapters', 'skills'))
        const fiber = agent.ctx.plugin(skillFilesystem, { providerName: 'studybuddy-research', includeDefaultRoots: false, customSkillDirs: roots, watch: true, watchFollowSymlinks: false })
        await fiber.await(); if (!this.current(binding)) { await fiber.dispose(); throw Error('HARNESS_RESEARCH_SCOPE_REVOKED') }
        disposers.push(() => fiber.dispose())
      }
      for (const item of catalog.tools) {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !Object.hasOwn(operations, item.name) || names.has(item.name) || typeof item.description !== 'string' || item.description.length > 16384) throw Error('HARNESS_RESEARCH_TOOL_SCHEMA_INVALID')
        names.add(item.name)
        const name = item.name as keyof typeof operations, parameters = researchPresentationSchema(item.parameters)
        assertObjectJsonSchema(parameters)
        const definition: ToolDefinition = { name, description: item.description, parameters: { ...parameters },
          output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],presentationMeta:(_args,value)=>value&&typeof value==='object'&&!Array.isArray(value)&&'details'in value?value.details??{}:{} },
          presentCall: () => ({ card: 'generic', title: name, kind: name === 'notebook_search' || name === 'list_pdf_annotations' ? 'read' : 'execute' }),
          execute: async (args, exec) => {
            if (!exec.agent || !this.owns(binding.sessionId, exec.agent.id) || !this.current(binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
            if(['research_fusion','research_schedule','research_mission'].includes(name)&&exec.agent.id!==binding.sessionId)throw Error('HARNESS_RESEARCH_SPECIALIST_PARENT_REQUIRED')
            const dispose=name==='research_mission'?this.owners.authorizeMission?.(binding,exec,args):undefined
            try {
              const record=name==='notebook'&&args&&typeof args==='object'&&!Array.isArray(args)&&'results'in args&&Array.isArray(args.results)?{...args,results:args.results.map(link=>link&&typeof link==='object'&&!Array.isArray(link)&&!Object.hasOwn(link,'sessionId')?{...link,sessionId:exec.agent!.id}:link)}:args
              const input=['pdf-annotations','services','advanced'].includes(operations[name])?{name,arguments:record,...(operations[name]==='advanced'?{callerSessionId:exec.agent.id}:{})}:record
              const value = await this.rpc.invoke(binding, operations[name], exec.callId,input,exec.signal)
              if (!this.current(binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
              return value
            }finally{dispose?.()}
          },
        }
        disposers.push(agent.ctx.tools.register(definition))
      }
      if(!['notebook','notebook_search','add_pdf_annotation','list_pdf_annotations','remove_pdf_annotation'].every(name=>names.has(name)))throw Error('HARNESS_RESEARCH_TOOL_SCHEMA_INVALID')
      if(names.has('research_web_search')){const dispose=mountResearchWebSearch(this.ctx,agent,binding,this.rpc,()=>this.current(binding),id=>this.owns(binding.sessionId,id));if(dispose)disposers.push(dispose)}
      disposers.push(agent.ctx.tools.guard(() => this.current(binding) ? undefined : 'The research account or project is no longer admitted.'))
      disposers.push(agent.ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
        const earlier = await next(); if (earlier.kind !== 'allow') return earlier
        if (!this.current(binding)) return { kind: 'deny', reason: 'The research account or project is no longer admitted.' }
        const args = exec.arguments as Record<string, unknown>
        if(exec.name==='research_compute'&&args.action==='submit'){
          const prepared=await this.rpc.invoke(binding,'services',exec.callId,{name:'research_compute',arguments:{action:'preflight',request:args.request}},exec.signal) as {provider?:unknown}
          if(!this.current(binding)||!prepared||!['modal','autodl'].includes(prepared.provider as string))return {kind:'deny',reason:'Independent compute configuration could not be frozen.'}
          const provider=prepared.provider==='autodl'?'AutoDL':'Modal'
          return {kind:'ask',reason:`Remote CPU/GPU compute is billed by ${provider} in your own account.`,displayReason:{en:`Start paid compute in your own ${provider} account?`, 'zh-CN':`在您自己的 ${provider} 账户启动付费计算吗？`}}
        }
        const file = ['write', 'edit', 'str_replace_editor'].includes(exec.name) && !(exec.name === 'str_replace_editor' && args.command === 'view') ? args.file_path ?? args.path : undefined
        const command = ['bash', 'pwsh', 'terminal_send'].includes(exec.name) ? args.command ?? args.text : undefined
        if (typeof file !== 'string' && typeof command !== 'string') return earlier
        if (typeof file === 'string') {
          const root = binding.authorizedRoots[0]!, target = isAbsolute(file) ? file : resolve(root, file), rel = relative(root, target)
          if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) return { kind: 'deny', reason: 'Research writes must stay inside the admitted project.' }
        }
        const decision = await this.rpc.invoke(binding, 'guard', exec.callId, { name: exec.name, ...(typeof file === 'string' ? { path: file } : { command }) }, exec.signal)
        if (!this.current(binding) || !decision || typeof decision !== 'object' || !('verdict' in decision) || !decision.verdict || typeof decision.verdict !== 'object' || !('kind' in decision.verdict)) return { kind: 'deny', reason: 'Research data guard could not validate this operation.' }
        if (decision.verdict.kind === 'protected') return { kind: 'deny', reason: 'Protected raw research data cannot be modified. Create derived output in another project directory.' }
        if (decision.verdict.kind === 'destructive' && 'destructiveConfirm' in decision && decision.destructiveConfirm === true) return { kind: 'ask', reason: 'This research command may remove or overwrite project data.', displayReason: { en: 'Allow this destructive research command?', 'zh-CN': '允许这条可能删除或覆盖研究数据的命令吗？' } }
        if (decision.verdict.kind !== 'allow' && decision.verdict.kind !== 'destructive') return { kind: 'deny', reason: 'Research data guard returned an invalid decision.' }
        return earlier
      }, { prepend: true }))
      disposers.push(agent.ctx.systemPrompt.section({ name: 'studybuddy-research', order: 70, interpolate: false,
        text: 'You are the StudyBuddy research assistant. Use the native file, shell, Skills, MCP and question tools already available. Independent research_web_search and research_literature_search use the provider selected in Settings and that user’s own provider account; do not substitute a provider or use raw credential discovery. Metaso scholar results do not imply Paperclip full text. research_compute submit requires confirmation and uses Modal/AutoDL own-account billing; inspect job status, logs, results and cleanup, never treat accepted shutdown as verified billing termination. Record hypotheses, methods, observations, decisions and notes with notebook. Use notebook_search to retrieve exact prior sources; historical records and approvals do not authorize new work. Plans and proposals are intentions, not evidence of execution. Preserve raw user_data; write derived results elsewhere. Cite observed files and tool results; never invent execution, cost or usage. PDF annotation tools preserve user annotations.' }))
      await this.connectors.mount(binding, 'mcp' in catalog ? catalog.mcp : undefined,agent)
      if(agent.id===binding.sessionId&&'review'in catalog)this.mountReview?.(binding,catalog.review)
      if (!this.current(binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      this.mounts.set(agent.id, { projectId: binding.projectId, dispose: async () => { for (const dispose of disposers.reverse()) await dispose() } })
    } catch (error) { await this.connectors.unmountSession(agent.id); for (const dispose of disposers.reverse()) await dispose(); throw error }
  }
  private owns(rootId: string, candidateId: string): boolean {
    const root = this.ctx.agents.get(SessionId(rootId)); if (!root) return false
    const live = this.ctx.agents.list(), owners = [root], seen = new Set([root.id])
    for (let index = 0; index < owners.length; index++) {
      if (owners[index]!.id === candidateId) return true
      for (const agent of live) if (!seen.has(agent.id) && this.ctx.agents.isOwnedBy(agent.id, owners[index]!)) { seen.add(agent.id); owners.push(agent) }
    }
    return false
  }
  /** Withdraw scoped registrations without deleting notebook, files or native histories. */
  async unmount(projectId?: string): Promise<void> {
    await this.connectors.unmount(projectId)
    for (const [id, row] of this.mounts) if (projectId === undefined || projectId === row.projectId) { await row.dispose(); this.mounts.delete(id) }
  }
}
