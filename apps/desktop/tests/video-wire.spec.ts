import {expect,it} from 'vitest'
import {parseVideoToolInvocation,parseVideoCapabilityRequest,parseVideoProjectRelocated} from '../src/studybuddy/video-wire.ts'
it('carries native subtitle tool requests through the actual private wire parser',()=>{
 const request={rpcId:'00000000-0000-4000-8000-000000000001',hostGeneration:'00000000-0000-4000-8000-000000000002',scope:{accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:'s'},toolCallId:'call',input:{}}
 for(const operation of ['transcribe','translate'])expect(parseVideoToolInvocation({...request,operation}).operation).toBe(operation)
 expect(()=>parseVideoToolInvocation({...request,operation:'shell'})).toThrow('VIDEO_INVOCATION_INVALID')
})
it('rejects undeclared capability fields and admits only the private completed-rename message',()=>{
 const scope={accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:'s'},id='00000000-0000-4000-8000-000000000004'
 expect(parseVideoCapabilityRequest({scope,requestId:id,operation:'project-release',input:{}}).operation).toBe('project-release')
 expect(()=>parseVideoCapabilityRequest({scope,requestId:id,operation:'tts',input:{},apiKey:'untrusted'})).toThrow('VIDEO_CAPABILITY_INVALID')
 expect(parseVideoProjectRelocated({type:'project-relocated',id,accountGeneration:'a',event:{projectId:'p',from:'old',to:'new'}}).event.projectId).toBe('p')
 expect(()=>parseVideoProjectRelocated({type:'project-relocated',id,accountGeneration:'a',event:{projectId:'p',from:'old',to:'new',key:'untrusted'}})).toThrow('VIDEO_PATH_ADMISSION_INVALID')
})
