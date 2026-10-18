import {expect,it} from 'vitest';
import {parseProfileModelPrices,parseProfileModelUsage} from './profile-model-insights.js';

const price=(unit:string,ratePer:number)=>({observedAt:'2026-10-14T00:00:00.000Z',source:'primary_backend_active_pricing',rows:[{
 identity:'["minimax","speech-2.8-hd"]',providerId:'minimax',providerName:'MiniMax',modelId:'speech-2.8-hd',modelName:'speech-2.8-hd',
 status:'unconfirmed',currency:null,priceVersion:'minimax-speech-cn-20261014-v1',configurationVersion:null,tiers:[],mediaCurrency:'CNY',
 mediaPrices:[{label:'语音合成',condition:'供应商计费字符',amount:'3.50',unit,ratePer}],
}]});
const usage=(extra:Record<string,unknown>={})=>({observedAt:'2026-10-14T00:00:00.000Z',period:'all',timeZone:'Asia/Shanghai',start:null,endExclusive:'2026-10-14T16:00:00.000Z',currency:'CNY',models:[],rows:[{
 identity:'["minimax","speech-2.8-hd"]',providerId:'minimax',modelId:'speech-2.8-hd',modelName:'speech-2.8-hd',funding:'platform',usage:{
 requests:1,reportedRequests:1,pendingRequests:0,input:null,output:null,total:null,cacheRead:null,cacheWrite:null,reasoning:null,
 chargedAmount:'0.0007',confirmedChargedAmount:'0.0007',unpricedRequests:0,
 nonTokenUsage:[{unit:'character',quantity:'2',reportedRequests:1,pendingRequests:0}],...extra,
}}],quarantinedRequests:0,coverage:['TERMINAL_USAGE_ONLY']});

it('preserves explicit character and audio-second tariff denominators without token conversion',()=>{
 expect(parseProfileModelPrices(price('character',10000)).rows[0]?.mediaPrices).toEqual([{label:'语音合成',condition:'供应商计费字符',amount:'3.50',unit:'character',ratePer:10000}]);
 expect(parseProfileModelPrices(price('second',3600)).rows[0]?.mediaPrices?.[0]).toMatchObject({unit:'second',ratePer:3600});
 for(const denominator of [0,-1,0.1,Number.MAX_SAFE_INTEGER+1])expect(()=>parseProfileModelPrices(price('character',denominator))).toThrow();
});
it('retains trusted character quantity with absent Token counts',()=>{
 expect(parseProfileModelUsage(usage()).rows[0]?.usage).toMatchObject({input:null,output:null,total:null,nonTokenUsage:[{unit:'character',quantity:'2',reportedRequests:1,pendingRequests:0}]});
});
it('accepts exact decimal duration but rejects token counters on a non-Token projection',()=>{
 expect(parseProfileModelUsage(usage({nonTokenUsage:[{unit:'second',quantity:'1.23456789',reportedRequests:1,pendingRequests:0}]})).rows[0]?.usage.nonTokenUsage?.[0]?.quantity).toBe('1.23456789');
 expect(()=>parseProfileModelUsage(usage({input:'2',output:'0',total:'2'}))).toThrow();
 expect(()=>parseProfileModelUsage(usage({nonTokenUsage:[{unit:'character',quantity:'2.1',reportedRequests:1,pendingRequests:0}]}))).toThrow();
});
it('preserves nine-decimal audio seconds while retaining the eight-decimal CNY contract',()=>{
 const value=usage({nonTokenUsage:[{unit:'second',quantity:'26.325000001',reportedRequests:1,pendingRequests:0}]});
 expect(parseProfileModelUsage(value).rows[0]?.usage.nonTokenUsage?.[0]?.quantity).toBe('26.325000001');
 for(const quantity of ['0.0000000001','01.25','1e-9',26.325000001])expect(()=>parseProfileModelUsage(usage({nonTokenUsage:[{unit:'second',quantity,reportedRequests:1,pendingRequests:0}]}))).toThrow();
 expect(()=>parseProfileModelUsage(usage({chargedAmount:'0.000000001',confirmedChargedAmount:'0.000000001'}))).toThrow();
});
it('keeps missing speech quantities pending instead of manufacturing zero',()=>{
 expect(parseProfileModelUsage(usage({reportedRequests:0,pendingRequests:1,nonTokenUsage:[{unit:'second',quantity:null,reportedRequests:0,pendingRequests:1}]})).rows[0]?.usage.nonTokenUsage?.[0]?.quantity).toBeNull();
 expect(()=>parseProfileModelUsage(usage({nonTokenUsage:[{unit:'second',quantity:null,reportedRequests:1,pendingRequests:0}]}))).toThrow();
});
it('binds server introduction metadata to the exact registry identity and source bytes',()=>{
 const value=price('character',10000),row=value.rows[0]! as Record<string,unknown>;
 row.catalogRevision='registry-r1';row.catalogSourceSha256='a'.repeat(64);row.profile={provider:'minimax',modelId:'speech-2.8-hd',name:'Speech 2.8 HD',summary:'文字合成语音',tags:['语音合成'],inputs:['文字'],outputs:['音频'],source:'https://platform.minimax.cn/docs/api-reference/speech-t2a-http'};
 expect(parseProfileModelPrices(value).rows[0]?.profile?.name).toBe('Speech 2.8 HD');
 row.profile={...(row.profile as Record<string,unknown>),modelId:'speech-2.8-turbo'};expect(()=>parseProfileModelPrices(value)).toThrow();
});
it('validates official HTTPS source URLs without relying on browser or Node globals',()=>{
 const value=price('character',10000),row=value.rows[0]! as Record<string,unknown>;
 row.catalogRevision='registry-r1';row.catalogSourceSha256='a'.repeat(64);
 const profile={provider:'minimax',modelId:'speech-2.8-hd',name:'Speech 2.8 HD',summary:'文字合成语音',tags:['语音合成'],inputs:['文字'],outputs:['音频'],source:'https://platform.minimax.cn/docs/api-reference/speech-t2a-http'};
 const OriginalURL=globalThis.URL;
 try{
  Object.defineProperty(globalThis,'URL',{value:undefined,configurable:true,writable:true});
  row.profile=profile;expect(parseProfileModelPrices(value).rows[0]?.profile?.source).toBe(profile.source);
  for(const source of ['http://platform.minimax.cn/docs','https://secret@platform.minimax.cn/docs','https://name:secret@platform.minimax.cn/docs','https:///docs','https://platform..minimax.cn/docs','https://platform.minimax.cn:99999/docs','https://platform.minimax.cn/has space','https://platform.minimax.cn\\@other.test/docs']){
   row.profile={...profile,source};expect(()=>parseProfileModelPrices(value)).toThrow();
  }
 }finally{Object.defineProperty(globalThis,'URL',{value:OriginalURL,configurable:true,writable:true});}
});
