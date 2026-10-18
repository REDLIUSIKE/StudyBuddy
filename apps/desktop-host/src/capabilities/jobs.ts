import type {Context} from '@deepseek-ai/cordis'
import type {JobId,JobOutcome} from '@deepseek-ai/dsh-jobs'
import type {CapabilityContext,CapabilityTarget,CapabilityResult} from './types.ts'
import type {CapabilityRegistry} from './registry.ts'
import type {CapabilityAssociationStore} from './associations.ts'
declare module '@deepseek-ai/dsh-jobs/view' {interface JobKindMap {creative:'creative'}}
const delay=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve()},timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done()})
/** A producer of native owned Jobs, never a workflow scheduler or paid retry loop. */
export class CapabilityJobs{
 private readonly active=new Map<string,{id:JobId;moduleId:string;target:CapabilityTarget;agent:CapabilityContext['agent'];cancel():void;done:Promise<JobOutcome>}>()
 constructor(private readonly ctx:Context,private readonly registry:CapabilityRegistry,private readonly store:CapabilityAssociationStore,private readonly assert:(context:CapabilityContext)=>void,private readonly interval=1000){}
 private key(context:CapabilityContext,ref:string){return JSON.stringify([context.caller.scope,context.caller.hostGeneration,context.agent.id,ref])}
 async reconcile(context:CapabilityContext,ref:string,cancel=false):Promise<CapabilityResult>{
  this.assert(context);const association=await this.store.operation(context.caller,ref);if(!association)throw Error('CAPABILITY_OPERATION_NOT_AUTHORIZED')
  const owned=this.active.get(this.key(context,ref))
  if(cancel&&owned){owned.cancel();return{data:{cancellationRequested:true},artifacts:[],operationRef:ref}}
  const adapter=this.registry.get(association.target.moduleId)
  await adapter.bind(context,{action:'attach',projectRef:association.target.projectRef});this.assert(context)
  const result=await (cancel?adapter.cancel(context,ref,association.target):adapter.status(context,ref,association.target));this.assert(context)
  for(const artifact of result.artifacts)await this.store.recordArtifact(context.caller,artifact)
  return result
 }
 track(context:CapabilityContext,target:CapabilityTarget,ref:string):JobId{
  this.assert(context);const key=this.key(context,ref),existing=this.active.get(key);if(existing)return existing.id
  const jobs=this.ctx.get('jobs');if(!jobs)throw Error('CAPABILITY_NATIVE_JOBS_UNAVAILABLE')
  const adapter=this.registry.get(target.moduleId)
  const controller=new AbortController(),lifetime=new AbortController(),background={...context,signal:lifetime.signal}
  let cancelledAt:number|undefined,cancelSent=false
  const cancel=()=>{cancelledAt??=Date.now();controller.abort()}
  let done!:Promise<JobOutcome>
  const id=jobs.start({kind:'creative',owner:context.agent.id,label:'创作任务 · '+target.moduleId,outputLimitBytes:8192,run:job=>{
   done=(async()=>{
    try{
     const deadline=Date.now()+2*60*60*1000
     for(;;){
      if(Date.now()>deadline||cancelledAt!==undefined&&Date.now()-cancelledAt>30000)throw Error('CAPABILITY_OUTCOME_UNKNOWN:'+ref)
      // Cleanup retains the originally admitted adapter; removing a module or Agent must not strand work.
      // Cancellation is a single mutation. Later observations always use status, including after a cached reply.
      if(controller.signal.aborted&&!cancelSent){cancelSent=true;await adapter.cancel(background,ref,target)}
      const result=controller.signal.aborted?await adapter.status(background,ref,target):await this.reconcile(background,ref),data=result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data:null
      const state=data?.state??(Array.isArray(data?.jobs)?(data.jobs[0] as {status?:string}|undefined)?.status:undefined)
      job.updateProgress(controller.signal.aborted?'正在停止':'创作处理中')
      if(['completed','done','succeeded','failed','cancelled','canceled','error','interrupted','unknown'].includes(String(state)))return{status:controller.signal.aborted?'killed':['completed','done','succeeded'].includes(String(state))?'completed':'failed',detail:String(state),result:JSON.stringify(result)}
      await delay(this.interval,lifetime.signal)
     }
    }catch(error){if(!cancelSent){cancelSent=true;try{await adapter.cancel({...background,signal:AbortSignal.timeout(5000)},ref,target)}catch{/* The failed Job keeps the explicit unknown/error observation; no paid resubmit. */}}return{status:controller.signal.aborted?'killed':'failed',detail:error instanceof Error?error.message:'CAPABILITY_OUTCOME_UNKNOWN:'+ref}}
    finally{lifetime.abort();if(this.active.get(key)?.id===id)this.active.delete(key)}
   })()
   return{cancel,done}
  }})
  this.active.set(key,{id,moduleId:target.moduleId,target:{...target},agent:context.agent,cancel,done});return id
 }
 async withdrawModule(id:string){const active=[...this.active.values()].filter(row=>row.moduleId===id);for(const job of active)job.cancel();await Promise.allSettled(active.map(row=>row.done))}
 async withdrawAgent(agent:CapabilityContext['agent']){const active=[...this.active.values()].filter(row=>row.agent===agent);for(const job of active)job.cancel();await Promise.allSettled(active.map(row=>row.done))}
 async withdrawTarget(agent:CapabilityContext['agent'],target:CapabilityTarget){const active=[...this.active.values()].filter(row=>row.agent===agent&&JSON.stringify(row.target)===JSON.stringify(target));for(const job of active)job.cancel();await Promise.allSettled(active.map(row=>row.done))}
 async close(){const active=[...this.active.values()];for(const job of active)job.cancel();await Promise.allSettled(active.map(job=>job.done))}
}
