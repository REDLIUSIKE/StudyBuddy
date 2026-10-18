/** Preserve the native web_search card/schema while routing admitted research searches to its chosen service. */
import {createHash} from 'node:crypto'
import type {Agent} from '@deepseek-ai/dsh-agent'
import type {Context} from '@deepseek-ai/cordis'
import type {ResearchProjectBinding} from './research-session-execution.ts'
import type {ResearchToolRpc} from './research-tool-rpc.ts'
/** Scoped shadowing leaves ordinary Sessions and the original web-fetch behavior intact. */
export function mountResearchWebSearch(ctx:Context,agent:Agent,binding:ResearchProjectBinding,rpc:ResearchToolRpc,current:()=>boolean,owned:(id:string)=>boolean):(()=>unknown)|undefined{
 const original=ctx.tools.get('web_search',agent);if(!original)return
 return agent.ctx.tools.register({...original,description:original.description+' Research searches use the Exa/Bocha service selected in Settings, with the user’s own provider account.',execute:async(args,exec)=>{
  if(!exec.agent||!owned(exec.agent.id)||!current())throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
  const queries=(args as {queries?:unknown}).queries;if(!Array.isArray(queries)||!queries.length||queries.length>4||queries.some(query=>typeof query!=='string'||!query.trim()||query.length>4096))throw Error('RESEARCH_WEB_QUERY_INVALID')
  const sources:{url:string;title:string;snippet:string}[]=[],seen=new Set<string>();let truncated=false
  for(const [index,query] of [...new Set(queries as string[])].entries()){
   if(!current())throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
   const callId='search-'+createHash('sha256').update(exec.callId+':'+index).digest('hex')
   const result=await rpc.invoke(binding,'services',callId,{name:'research_web_search',arguments:{query,count:8}},exec.signal) as {sources?:unknown}
   if(!current()||!result||!Array.isArray(result.sources))throw Error('HARNESS_RESEARCH_SEARCH_RESPONSE_INVALID')
   for(const row of result.sources){if(!row||typeof row.url!=='string'||typeof row.title!=='string'||typeof row.summary!=='string')throw Error('HARNESS_RESEARCH_SEARCH_RESPONSE_INVALID');if(seen.has(row.url))continue;seen.add(row.url);if(sources.length>=8){truncated=true;continue;}sources.push({url:row.url,title:row.title,snippet:row.summary})}
  }
  return {sources,truncated}
 }})
}
