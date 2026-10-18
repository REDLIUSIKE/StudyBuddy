/** Bounded independent-provider JSON transport. Never retries or follows credential redirects. */
export async function serviceJson(response:Response,limit=131072):Promise<Record<string,unknown>> {
 let bytes=0;const chunks:Uint8Array[]=[];if(response.body){const reader=response.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('RESEARCH_SERVICE_RESPONSE_TOO_LARGE');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
 let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('RESEARCH_SERVICE_RESPONSE_INVALID');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RESEARCH_SERVICE_RESPONSE_INVALID');return value as Record<string,unknown>;
}
