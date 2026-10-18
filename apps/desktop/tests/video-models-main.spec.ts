import {it,expect} from 'vitest'
import {StudyBuddyVideo} from '../src/studybuddy/video.ts'
import {VIDEO_IPC} from '../src/studybuddy/video-types.ts'

function fixture(read:()=>Promise<unknown>){
 const scope={accountId:'account',generation:'generation'},selection={projectId:'project',sessionId:'session',projectEpoch:2}
 let calls=0
 const video=new StudyBuddyVideo({
  auth:{scope:()=>scope},
  runtime:{ensure:async()=>({editorOrigin:'http://127.0.0.1:3333'})},
  bridge:{
   bind:async()=>({scope:{...scope,workspaceId:'workspace',projectId:'project',sessionId:'session'}}),
   capability:async(request:unknown)=>{calls++;expect(request).toMatchObject({operation:'catalog',input:{}});return{data:await read(),artifacts:[]}},
  },
 } as never)
 const internals=video as unknown as {guests:{checkedGuest:(event:unknown)=>unknown};selected:Map<number,typeof selection>}
 internals.guests.checkedGuest=()=>({lease:{scope,lease:'lease'}});internals.selected.set(7,selection)
 const handlers=new Map<string,(event:unknown,action:unknown)=>Promise<unknown>>()
 video.register({handle:(name:string,handler:never)=>handlers.set(name,handler)} as never,()=>{},()=>{})
 const event={sender:{id:7},senderFrame:{url:'http://127.0.0.1:3333/projects/project'}}
 const invoke=(action:unknown)=>handlers.get(VIDEO_IPC.guestAction)!(event,action)
 return{invoke,internals,calls:()=>calls}
}
it('shows only the selected account native catalog without provider configuration or request authorities',async()=>{
 const f=fixture(async()=>[{operation:'tts',modelId:'speech-2.8-hd',label:'Speech HD',authorityRef:'private-authority',parameters:{}}])
 expect(await f.invoke({kind:'models',projectId:'project',projectEpoch:2})).toEqual({ok:true,data:[{operation:'tts',modelId:'speech-2.8-hd',label:'Speech HD'}]});expect(f.calls()).toBe(1)
})
it('rejects a stale selection and extra provider fields before reading any catalog',async()=>{
 const f=fixture(async()=>[])
 for(const action of [{kind:'models',projectId:'project',projectEpoch:1},{kind:'models',projectId:'project',projectEpoch:2,provider:'external'}])expect(await f.invoke(action)).toMatchObject({ok:false})
 expect(f.calls()).toBe(0)
})
it('does not return model results after the selected project changes',async()=>{
 let complete!:(value:unknown)=>void
 const f=fixture(()=>new Promise(resolve=>{complete=resolve}))
 const pending=f.invoke({kind:'models',projectId:'project',projectEpoch:2})
 await new Promise(resolve=>setTimeout(resolve,0));expect(f.calls()).toBe(1)
 f.internals.selected.set(7,{projectId:'other',sessionId:'other',projectEpoch:3});complete([])
 expect(await pending).toEqual({ok:false,error:{code:'VIDEO_SCOPE_REVOKED'}})
})
