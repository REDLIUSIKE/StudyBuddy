/** Private native model admission hook. A project cap never mutates the gateway wallet. */
import type {Context} from '@deepseek-ai/cordis';
export interface ResearchBudgetAdmission {sessionId:string;requestId:string;modelId:string;fundingSource:'platform'|'user_api'}
const guards=new WeakMap<Context,(request:ResearchBudgetAdmission)=>Promise<void>>();
export function installResearchBudgetGuard(ctx:Context,guard:(request:ResearchBudgetAdmission)=>Promise<void>):()=>void {if(guards.has(ctx))throw Error('HARNESS_RESEARCH_BUDGET_ALREADY_INSTALLED');guards.set(ctx,guard);return ()=>{if(guards.get(ctx)===guard)guards.delete(ctx);};}
export async function assertResearchModelBudget(ctx:Context,request:ResearchBudgetAdmission):Promise<void> {await guards.get(ctx)?.(request);}
