import { it,expect } from 'vitest'
import { mkdtemp,rm,mkdir,realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VideoBridge } from '../src/studybuddy/video-bridge.ts'
it('writes native identity before admission and retries the same Session after a lost response',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'video-bridge-'))),project=join(root,'project');await mkdir(project)
 const scope={accountId:'account',generation:1},owner={scope,hostGeneration:'11111111-1111-4111-8111-111111111111'},sessions:string[]=[];let lost=true,current=true
  const runtime={generation:()=> 'generation',command:async(_scope:unknown,operation:string)=>operation==='projectInfo'?{id:'original-ID',path:project}:operation==='mediaRequest'?{data:{subtitlesStatus:'created'},artifacts:[]}:null,admitPaths:async()=>[project],restoreProjectPaths:async()=>{}}
 const bridge=new VideoBridge({userDataRoot:root,runtime:runtime as never,isCurrent:()=>current,hostContext:()=>owner,mediaRequest:async()=>{throw Error('must-use-original-domain')},command:async(action,value)=>{
  if(action==='native'){const operation=value as {operationId:string};return{data:{lines:['你好']},artifacts:[],receiptRef:operation.operationId}}
  if(action!=='bind')return null
  const row=value as any;sessions.push(row.sessionId)
  if(lost){lost=false;throw Error('VIDEO_CHANNEL_CLOSED')}
  return{scope:{accountGeneration:'generation',workspaceId:'workspace',projectId:row.projectId,sessionId:row.sessionId},ownedScope:scope,lease:row.lease,hostGeneration:owner.hostGeneration,projectRoot:project}
 }})
 try{
  await expect(bridge.bind(scope,'original-ID')).rejects.toThrow('VIDEO_CHANNEL_CLOSED')
  const bound=await bridge.bind(scope,'original-ID');expect(sessions).toEqual([bound.scope.sessionId,bound.scope.sessionId]);expect(bridge.current(bound.scope)).toBe(true)
  expect(await bridge.tool({rpcId:'media',hostGeneration:owner.hostGeneration,scope:bound.scope,operation:'mediaRequest',toolCallId:'tool',input:{operation:'tts',authorityRef:'approved',requestId:'11111111-1111-4111-8111-111111111119',input:{native:{prompt:'声音'}}}},new AbortController().signal)).toMatchObject({data:{subtitlesStatus:'created'}})
  const translation={scope:bound.scope,operation:'translate' as const,requestId:'00000000-0000-4000-8000-000000000091',input:{language:'zh',lines:['Hello']}}
  expect((await bridge.capability(translation,new AbortController().signal)).data).toEqual({lines:['你好']})
  const caller={scope,hostGeneration:owner.hostGeneration,callerSessionId:'ordinary-caller',workspaceId:null,toolCallId:'original-call'}
  await bridge.retainTask(caller,'original-ID');await bridge.releaseView(scope,'original-ID')
  expect(bridge.current(bound.scope),'switchingViewDoesNotReleaseTask').toBe(true)
  bridge.releaseTask(caller,'original-ID')
  await expect(bridge.capability({...translation,scope:{...bound.scope,projectId:'other'}},new AbortController().signal)).rejects.toThrow('VIDEO_SCOPE_REVOKED')
  const closing=bridge.capability({scope:bound.scope,operation:'project-release',requestId:'00000000-0000-4000-8000-000000000093',input:{}},new AbortController().signal);expect(bridge.current(bound.scope)).toBe(false);expect((await closing).data).toEqual({released:true})
  expect(bridge.current(bound.scope)).toBe(false);const reopened=await bridge.bind(scope,'original-ID');expect(reopened.scope.sessionId).toBe(bound.scope.sessionId)
  current=false;expect(bridge.current(bound.scope)).toBe(false);await expect(bridge.tool({rpcId:'id',hostGeneration:owner.hostGeneration,scope:bound.scope,operation:'readProject',toolCallId:'tool',input:{}},new AbortController().signal)).rejects.toThrow('VIDEO_SCOPE_REVOKED')
 }finally{await bridge.revoke();await rm(root,{recursive:true,force:true})}
})
