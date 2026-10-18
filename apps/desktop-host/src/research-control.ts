/** Closed Main-to-Host operations for the retained local research runtime. */
import type { Context } from '@deepseek-ai/cordis'
import { ResearchHostController } from './research-host.ts'
import { createNativeResearchExecution } from './research-session-execution.ts'
import { NativeResearchProjects } from './research-projects.ts'
import { parseHarnessResearchInvocationV1, parseHarnessResearchContextV1 } from '@studybuddy/contracts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createHash } from 'node:crypto'
import { ResearchToolRpc } from './research-tool-rpc.ts'
import { NativeResearchTools } from './research-tools.ts'
import {NativeResearchAdvanced} from './research-advanced.ts'
import {NativeResearchReviews} from './research-review-mount.ts'
import {NativeResearchCompositions} from './research-compositions.ts'
import {NativeResearchLineageExport} from './research-lineage-export.ts'
import {installResearchBudgetGuard} from './research-budget-guard.ts'
import {NativeResearchGoals} from './research-goal.ts'
import {NativeResearchSchedules} from './research-schedules.ts'
import {NativeResearchProvenance} from './research-provenance.ts'
import {NativeResearchWorkflowControl} from './research-workflow-control.ts'
import {NativeResearchWorkflowHost} from './research-workflow-host.ts'
export interface ResearchHostControl { command(action: string, data: unknown): Promise<unknown>; toolResult(value: unknown): void }
/** Install the actual native provider without creating an agent at startup.
 * @param ctx - Original running native Host.
 * @param hostGeneration - Existing private Host generation.
 * @returns Closed private control operations. */
export function installResearchHostControl(ctx: Context, hostGeneration: string, send: (value: object) => Promise<void>): ResearchHostControl {
  const projects = new NativeResearchProjects(ctx, hostGeneration)
  const execution = createNativeResearchExecution(ctx, { binding: projects.binding,
    helperMaxTokens: { 'methods-draft': 4000, 'next-experiments': 6000, 'latex-assist': 4000 } })
  const controller = new ResearchHostController({ hostGeneration, execution })
  const rpc = new ResearchToolRpc({ send, current: context => projects.binding(context) !== undefined })
  ctx.effect(()=>installResearchBudgetGuard(ctx,async request=>{
    const binding=projects.owningBinding(request.sessionId);if(!binding)return
    await rpc.invoke(binding,'budget','budget:'+request.requestId,{requestId:request.requestId,modelId:request.modelId,fundingSource:request.fundingSource},new AbortController().signal)
    if(!projects.binding(binding))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
  }))
  const current=(context:Parameters<typeof projects.binding>[0])=>projects.binding(context)!==undefined
  const directory=(context:Parameters<typeof projects.binding>[0])=>{const root=projects.binding(context)?.authorizedRoots[0];if(!root)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');return root}
  const goals=new NativeResearchGoals(ctx,{current,directory,maxDepth:3,freeze:async(context,missionId,objective)=>{const frozen=await advanced.freezeStart(context,{action:'start',operationId:missionId,label:'持续研究',prompt:objective,persona:'',modelRef:null,reasoningEffort:null,tools:null,inheritParentContext:false,systemPromptMode:'append',inheritProjectContext:true,inheritSkills:true,maxTokens:4000});if(frozen.modelRef===null||frozen.tools===null)throw Error('HARNESS_RESEARCH_GOAL_MODEL_REQUIRED');return {modelRef:frozen.modelRef,reasoningEffort:frozen.reasoningEffort,tools:frozen.tools,maxTokens:frozen.maxTokens}},composeChild:async(context,agent)=>{const binding=projects.binding(context);if(!binding)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');provenance.mount(binding,agent);await tools.mount(binding,agent)}})
  const provenance=new NativeResearchProvenance(ctx,rpc,current)
  const advanced=new NativeResearchAdvanced(ctx,{current,directory,maxDepth:3,catalog:()=>ctx.sessionController.modelCatalog(),composeChild:async(context,agent)=>{const binding=projects.binding(context);if(!binding)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');provenance.mount(binding,agent);await tools.mount(binding,agent)}})
  const workflowHost:NativeResearchWorkflowHost=new NativeResearchWorkflowHost(ctx,{current,directory,proveCaller:(context,id):ReturnType<NativeResearchWorkflowControl['proveCaller']>=>workflowControl.proveCaller(context,id)})
  const workflowControl:NativeResearchWorkflowControl=new NativeResearchWorkflowControl(ctx,advanced,workflowHost)
  const schedules=new NativeResearchSchedules(ctx,{current,directory,contextForSession:id=>projects.owningBinding(id),freeze:(context,target)=>workflowControl.freeze(context,target),dispatch:(context,target,operationId)=>rpc.invoke(context,'advanced',operationId,{name:'research_workflow',arguments:{action:'start-frozen',operationId,target}},new AbortController().signal),inspect:(context,operationId)=>rpc.invoke(context,'advanced','inspect:'+operationId,{name:'research_workflow',arguments:{action:'inspect',operationId}},new AbortController().signal),budget:async context=>{const value=await rpc.invoke(context,'budget','schedule-budget',{action:'status'},new AbortController().signal);if(!value||typeof value!=='object'||!('paused'in value)||typeof value.paused!=='boolean')throw Error('HARNESS_RESEARCH_BUDGET_UNAVAILABLE');return {paused:value.paused}}})
  const reviews=new NativeResearchReviews(ctx,advanced,context=>projects.binding(context)!==undefined)
  const compositions=new NativeResearchCompositions(ctx,advanced,context=>projects.binding(context)!==undefined,context=>{const root=projects.binding(context)?.authorizedRoots[0];if(!root)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');return root})
  const tools = new NativeResearchTools(ctx, rpc, current,(binding,value)=>reviews.mount(binding,value),{authorizeMission:(binding,exec,input)=>goals.authorizeMission(binding,exec,input)})
  ctx.effect(() => async () => { controller.setScope(null);await schedules.close();await goals.close();await workflowHost.dispose();await advanced.close();await compositions.close();await provenance.close();rpc.revoke();reviews.unmount();await projects.setScope(null);await tools.unmount() })
  return { toolResult: value => rpc.result(value), command: async (action, data) => {
    if (action === 'scope') {
      const changed = !projects.matchesScope(data); controller.setScope(data)
      if (changed) {await schedules.suspend();await goals.suspend();await workflowHost.close();await advanced.close();await compositions.close();await provenance.unmount();rpc.revoke()}
      if(changed)reviews.unmount();await projects.setScope(data);if (changed) await tools.unmount(); return null
    }
    if (action === 'bind') return projects.bind(data)
    if (action === 'tools') {
      if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('context' in data)) throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      const context = parseHarnessResearchContextV1(data.context), binding = projects.binding(context)
      if (!binding || !await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      await goals.mount(context);provenance.mount(binding);await tools.mount(binding);await schedules.command(context,{action:'ensure-host'}); return null
    }
    if (action === 'invoke') return controller.invoke(parseHarnessResearchInvocationV1(data), new AbortController().signal)
    if(action==='advanced'||action==='goal'||action==='schedules'){
      if(!data||typeof data!=='object'||Object.keys(data).length!==2||!('context'in data)||!('input'in data)||JSON.stringify(data.input).length>131072)throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      const context=parseHarnessResearchContextV1(data.context);if(!await execution.admitted(context))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      if(action==='goal'||action==='schedules'){const result=action==='goal'?await goals.command(context,data.input):await schedules.command(context,data.input);if(!await execution.admitted(context))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');return result}
      const input=data.input as {action?:unknown;operationId?:unknown}|null
      const result=input?.action==='compose'?await compositions.compose(context,input):input?.action==='composition-inspect'&&Object.keys(input).length===2&&typeof input.operationId==='string'?compositions.inspect(context,input.operationId):input?.action==='composition-cancel'&&Object.keys(input).length===2&&typeof input.operationId==='string'?await compositions.cancel(context,input.operationId):await workflowControl.command(context,input)
      if(!await execution.admitted(context))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');return result
    }
    if (action === 'model-catalog') {
      if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('context' in data)) throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      const context = parseHarnessResearchContextV1(data.context)
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      const catalog = await ctx.sessionController.modelCatalog()
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      return catalog
    }
    if (action === 'journal-export') {
      if (!data || typeof data !== 'object' || Object.keys(data).length !== 2 || !('context' in data) || !('input' in data)) throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      const context = parseHarnessResearchContextV1(data.context)
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      const binding=projects.binding(context);if(!binding)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      const query=ctx.get('sessionQuery');if(!query)throw Error('HARNESS_RESEARCH_EXPORT_QUERY_UNAVAILABLE')
      const lineage=new NativeResearchLineageExport(query,()=>projects.binding(context)!==undefined)
      const input=data.input
      let page:unknown
      if(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===1&&'kind'in input&&input.kind==='sessions')page=await lineage.list(binding)
      else if(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===3&&'sessionId'in input&&typeof input.sessionId==='string'&&'cursor'in input&&'endSeq'in input)page=await lineage.page(binding,input.sessionId,{cursor:input.cursor,endSeq:input.endSeq})
      else page=await lineage.page(binding,context.sessionId,input)
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      return page
    }
    if (action === 'journal') {
      if (!data || typeof data !== 'object' || Object.keys(data).length !== 2 || !('context' in data) || !('afterSeq' in data) || !Number.isSafeInteger(data.afterSeq) || Number(data.afterSeq) < -1) throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      const context = parseHarnessResearchContextV1(data.context)
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      const session = ctx.sessions.get(SessionId(context.sessionId))
      if (!session) throw Error('HARNESS_RESEARCH_SESSION_NOT_FOUND')
      const events = session.snapshotEvents().filter(event => event.seq > Number(data.afterSeq)).slice(0, 32)
      const records = events.map(event => {
        const json = JSON.stringify(event.data)
        return { eventId: `${session.id}:${event.seq}`, nativeSessionId: session.id, seq: Number(event.seq), time: event.time, kind: event.type,
          payloadSample: json.slice(0, 8192), payloadSha256: createHash('sha256').update(json).digest('hex'), truncated: json.length > 8192 }
      })
      if (!await execution.admitted(context)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
      return { projectId: context.projectId, nativeSessionId: session.id, records }
    }
    if (action === 'project-close') {
      if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('projectId' in data) || typeof data.projectId !== 'string') throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
      await schedules.suspend(data.projectId);await goals.suspend(data.projectId);await workflowHost.close(data.projectId);await advanced.close(data.projectId);await compositions.close(data.projectId);await provenance.unmount(data.projectId);rpc.revoke(data.projectId);reviews.unmount(data.projectId);await projects.close(data.projectId);await tools.unmount(data.projectId); return null
    }
    throw Error('HARNESS_RESEARCH_REQUEST_INVALID')
  } }
}
