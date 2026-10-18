import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';
const parse=(value:unknown)=>{
 const f=(contracts as unknown as Record<string,unknown>).parseHarnessMediaInvocationV1;
 return typeof f==='function'?f(value):{feature:'missing'};
};
const uuid='44444444-4444-4444-8444-444444444444';
const context={scope:{accountId:'11111111-1111-4111-8111-111111111111',generation:3},hostGeneration:'22222222-2222-4222-8222-222222222222',sessionId:'session-33333333-3333-4333-8333-333333333333'};
const invocation={schemaVersion:1,rpcId:uuid,context,operation:'create-image',input:{requestId:uuid,modelId:'doubao-seedream-5-0-flash-260915',prompt:'A car',size:'1.5K'}};
describe('private Harness media invocation',()=>{
 it('retains exact owned context and approved image request',()=>{expect(parse(invocation)).toEqual(invocation);});
 it.each([{...invocation,apiKey:'not-permitted'}, {...invocation,input:{...invocation.input,baseUrl:'https://foreign.test'}},
  {...invocation,input:{...invocation.input,modelId:'unreviewed-model'}}, {...invocation,input:{...invocation.input,size:'4K'}},
  {...invocation,context:{...context,scope:{...context.scope,generation:-1}}}])('rejects credential, route, membership and generation mutations',v=>{expect(()=>parse(v)).toThrow();});
 it('admits video only with the reviewed model and bounded parameters',()=>{
  const value={...invocation,operation:'create-video',input:{requestId:uuid,modelId:'doubao-seedance-2-5-260628',prompt:'A car',duration:4,resolution:'480p',ratio:'16:9',generateAudio:false}};
  expect(parse(value)).toEqual(value);
  expect(()=>parse({...value,input:{...value.input,duration:0}})).toThrow();
 });
 it('keeps status and content separate from generation',()=>{
  for(const operation of ['status','content']){const value={...invocation,operation,input:{requestId:uuid,kind:'video'}};
   expect(parse(value)).toEqual(value);expect(()=>parse({...value,input:{...value.input,prompt:'resubmit'}})).toThrow();}
 });
 it('requires the actual owning conversation and Host generation',()=>{
  expect(()=>parse({...invocation,context:{...context,sessionId:''}})).toThrow();
  expect(()=>parse({...invocation,context:{...context,hostGeneration:'foreign'}})).toThrow();
 });
});
