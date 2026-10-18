import type {OwnedScope} from '@studybuddy/contracts';
import type {MainSession} from './services.ts';
interface Options {current(scope:OwnedScope):boolean;withSession<T>(run:(session:MainSession)=>Promise<T>):Promise<T>;fetch(url:string,init:RequestInit):Promise<Response>}
/** Only the original Main authentication owner reads the fixed private usage endpoint. */
export class ResearchUsageClient {
 constructor(private readonly options:Options){}
 async read(scope:OwnedScope,input:unknown,signal:AbortSignal):Promise<unknown>{const assert=()=>{signal.throwIfAborted();if(!this.options.current(scope))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')};assert();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).join(',')!=='requests'||!('requests'in input)||!Array.isArray(input.requests)||input.requests.length>100)throw Error('RESEARCH_USAGE_INPUT_INVALID');
  for(const row of input.requests)if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='fundingSource,modelId,requestId'||row.fundingSource!=='platform'||typeof row.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(row.requestId)||typeof row.modelId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(row.modelId))throw Error('RESEARCH_USAGE_INPUT_INVALID');
  return this.options.withSession(async session=>{assert();if(session.scope.accountId!==scope.accountId||session.scope.generation!==scope.generation)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');const response=await this.options.fetch('https://guijitongzhuo.com/api/v2/research-usage/settlements',{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{Authorization:'Bearer '+session.accessToken,'X-StudyBuddy-Client-Audience':'studybuddy-native-tools-v2','Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input)});assert();if(!response.ok||!response.body)throw Error('RESEARCH_BUDGET_USAGE_UNAVAILABLE');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{for(;;){const item=await reader.read();assert();if(item.done)break;bytes+=item.value.length;if(bytes>131072)throw Error('RESEARCH_USAGE_RESPONSE_INVALID');chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});}assert();return JSON.parse(Buffer.concat(chunks).toString('utf8'));});
 }
}
