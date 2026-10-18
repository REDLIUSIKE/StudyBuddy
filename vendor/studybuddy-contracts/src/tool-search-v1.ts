/** Private search wire contract. A decoded UUID is identity, never authorization. */
declare const searchOperationBrand:unique symbol;
export type SearchOperationIdV1=string & {readonly [searchOperationBrand]:'SearchOperationIdV1'};
export type SearchStateV1='reserved'|'dispatched'|'unknown'|'completed'|'empty'|'failed'|'result_expired';
export type ToolSearchRequestV1=Readonly<{operationId:SearchOperationIdV1;textQuery:string;maxResults:number}>;
export type ToolSearchSourceV1=Readonly<{url:string;title?:string;snippet?:string;publishedAt?:string;chunks:readonly string[]}>;
export type ToolSearchResultV1=Readonly<{operationId:SearchOperationIdV1;state:SearchStateV1;sources:readonly ToolSearchSourceV1[];truncated:boolean;chargeCny:string;resultExpiresAt:string|null}>;
const invalid=():never=>{throw new TypeError('TOOL_SEARCH_CONTRACT_INVALID');};
function record(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return invalid();
 const keys=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
 if(required.some(key=>!Object.hasOwn(descriptors,key))||keys.some(key=>typeof key!=='string'||![...required,...optional].includes(key)||!Object.hasOwn(descriptors[key]!,'value')))return invalid();
 return value as Record<string,unknown>;
}
function operationId(value:unknown):SearchOperationIdV1{
 if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))return invalid();
 return value as SearchOperationIdV1;
}
function source(value:unknown):ToolSearchSourceV1{
 const r=record(value,['url','chunks'],['title','snippet','publishedAt']);
 if(typeof r.url!=='string'||r.url.length>4096||/[\p{Cc}]/u.test(r.url))return invalid();
 type Parsed={protocol:string;hostname:string;username:string;password:string};
 const URLClass=(globalThis as typeof globalThis&{URL:new(value:string)=>Parsed}).URL;
 let u:Parsed;try{u=new URLClass(r.url);}catch{return invalid();}
 if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password)return invalid();
 if(!Array.isArray(r.chunks)||r.chunks.length>1000||r.chunks.some(x=>typeof x!=='string'||x.includes('\u0000')))return invalid();
 const text:Record<string,string>={};
 for(const key of ['title','snippet','publishedAt']as const)if(Object.hasOwn(r,key)){if(typeof r[key]!=='string'||r[key].includes('\u0000'))return invalid();text[key]=r[key];}
 return Object.freeze({url:r.url,chunks:Object.freeze([...r.chunks]),...text});
}
export function parseToolSearchRequestV1(value:unknown):ToolSearchRequestV1{
 const r=record(value,['operationId','textQuery','maxResults']);
 if(typeof r.textQuery!=='string'||!r.textQuery.trim()||r.textQuery.length>10000||r.textQuery.includes('\u0000')||typeof r.maxResults!=='number'||!Number.isSafeInteger(r.maxResults)||r.maxResults<1||r.maxResults>8)return invalid();
 return Object.freeze({operationId:operationId(r.operationId),textQuery:r.textQuery,maxResults:r.maxResults});
}
export function parseToolSearchResultV1(value:unknown):ToolSearchResultV1{
 const r=record(value,['operationId','state','sources','truncated','chargeCny','resultExpiresAt']);
 const states:readonly SearchStateV1[]=['reserved','dispatched','unknown','completed','empty','failed','result_expired'];
 if(typeof r.state!=='string'||!states.includes(r.state as SearchStateV1)||!Array.isArray(r.sources)||r.sources.length>8||typeof r.truncated!=='boolean'||typeof r.chargeCny!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(r.chargeCny))return invalid();
 const state=r.state as SearchStateV1,sources=Object.freeze(r.sources.map(source));
 if(state==='completed'?(sources.length===0||r.resultExpiresAt===null):sources.length!==0)return invalid();
 if(!['completed','result_expired'].includes(state)&&r.chargeCny!=='0')return invalid();
 if(r.resultExpiresAt!==null&&(typeof r.resultExpiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r.resultExpiresAt)||!Number.isFinite(Date.parse(r.resultExpiresAt))))return invalid();
 const contextBytes=utf8Bytes(JSON.stringify(sources));
 if(contextBytes>65536)return invalid();
 return Object.freeze({operationId:operationId(r.operationId),state,sources,truncated:r.truncated,chargeCny:r.chargeCny,resultExpiresAt:r.resultExpiresAt as string|null});
}

function utf8Bytes(value:string):number{
 let bytes=0;for(const char of value){const code=char.codePointAt(0)!;bytes+=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;}return bytes;
}
