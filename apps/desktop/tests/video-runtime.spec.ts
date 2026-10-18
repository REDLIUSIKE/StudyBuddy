import { describe,it,expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { mkdtemp,rm,readFile,mkdir,realpath,rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChildProcess } from 'node:child_process'
import { VideoRuntime } from '../src/studybuddy/video-runtime.ts'
import * as PathModule from '../src/studybuddy/video-path-store.ts'

function child(){
 const stdin=new PassThrough(),stdout=new PassThrough(),stderr=new PassThrough()
 return Object.assign(new ChildProcess(),{stdin,stdout,stderr,stdio:[stdin,stdout,stderr,null,null] as [PassThrough,PassThrough,PassThrough,null,null],exitCode:null as number|null,signalCode:null,killed:false,pid:54321})
}
const scope={accountId:'video-account',generation:1}

it('reports known media input errors while keeping unknown private errors off the wire',async()=>{
 const root=await mkdtemp(join(tmpdir(),'video-input-error-')),process=child(),responses:Array<{id:string,error:string}>=[]
 process.stdin.on('data',chunk=>{
  const message=JSON.parse(String(chunk).trim())
  if(!message.type)process.stdout.write('{"type":"ready","editorOrigin":"http://127.0.0.1:21234","filmOrigin":"http://localhost:21235"}\n')
  if(message.type==='capability-result')responses.push(message)
 })
 process.stdin.on('finish',()=>{Object.assign(process,{exitCode:0});process.emit('exit',0,null)})
 let calls=0
 const runtime=new VideoRuntime({userDataRoot:root,isCurrent:()=>true,resources:async()=>({directory:root,node:join(root,'node.exe'),entry:join(root,'dsh.mjs'),plugin:join(root,'video-plugin.mjs'),domainEntry:join(root,'domain.mjs'),staticDirectory:join(root,'web'),manifestSha256:'b'.repeat(64),renderRuntime:{browserExecutable:join(root,'browser.exe'),ffmpegExecutable:join(root,'ffmpeg.exe'),ffprobeExecutable:join(root,'ffprobe.exe'),identities:{}}}),invoke:async()=>{throw Error(calls++===0?'AIGC_REQUEST_INVALID':'private upstream credential sk-do-not-forward')},launch:()=>process,invalidated:()=>{}})
 try{
  await runtime.ensure(scope)
  const project={accountGeneration:runtime.generation(scope),workspaceId:'workspace',projectId:'project',sessionId:'session'}
  for(const id of ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']){
   process.stdout.write(JSON.stringify({type:'capability',id,request:{scope:project,requestId:id,operation:'video',authorityRef:'choice',input:{native:{}}}})+'\n')
   await new Promise(resolve=>setTimeout(resolve,0))
  }
  expect(responses.map(row=>row.error)).toEqual(['VIDEO_MEDIA_INPUT_INVALID','VIDEO_CAPABILITY_FAILED'])
  expect(JSON.stringify(responses)).not.toContain('sk-do-not-forward')
 }finally{await runtime.revoke();await rm(root,{recursive:true,force:true})}
})
describe('private video process owner',()=>{
 it('persists only an admitted same-parent project rename and restores its new root after restart',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'video-path-rename-'))),workspace=join(root,'managed'),before=join(root,'selected'),after=join(root,'renamed'),unselected=join(root,'unselected'),scope={accountId:'path-owner',generation:1}
  await Promise.all([mkdir(workspace),mkdir(before),mkdir(unselected)])
  try{
   const store=new PathModule.VideoPathStore(()=>join(root,'private'),()=>true)
   await store.commit(scope,'project',await store.canonical(scope,'project',[before]));await rename(before,after)
   await store.relocated(scope,workspace,before,after)
   const restored=new PathModule.VideoPathStore(()=>join(root,'private'),()=>true),saved=await restored.read(scope)
   expect(saved).toEqual([{kind:'project',path:after}]);expect(await restored.available(scope,'project',saved.map(entry=>entry.path))).toEqual([after])
   await expect(restored.relocated(scope,workspace,join(root,'never-selected'),unselected)).rejects.toThrow('VIDEO_PROJECT_PATH_NOT_ADMITTED')
   await expect(restored.relocated(scope,workspace,after,join(workspace,'different-parent'))).rejects.toThrow('VIDEO_PATH_ADMISSION_INVALID')
   expect(await restored.read(scope)).toEqual(saved)
  }finally{await rm(root,{recursive:true,force:true})}
 })
 it('native file selection drops late account results before granting any path',async()=>{
  const Picker=Reflect.get(PathModule,'VideoNativeFiles')
  expect(typeof Picker).toBe('function')
  let current=true,grants=0,finish:((value:{canceled:boolean;filePaths:string[]})=>void)|undefined
  const picker=new Picker({show:()=>new Promise(resolve=>{finish=resolve}),admit:async()=>{grants++;return['approved']}})
  const pending=picker.pick(scope,null,{purpose:'project',folder:true},()=>{if(!current)throw Error('VIDEO_SCOPE_REVOKED')})
  current=false;finish!({canceled:false,filePaths:[join(tmpdir(),'chosen')]})
  await expect(pending).rejects.toThrow('VIDEO_SCOPE_REVOKED');expect(grants).toBe(0)
 })
 it('native picker gives asset and export selections only to the current project scope',async()=>{
  const Picker=Reflect.get(PathModule,'VideoNativeFiles')
  expect(typeof Picker).toBe('function')
  const grants:any[]=[],project={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:'s1'}
  const picker=new Picker({show:async()=>({canceled:false,filePaths:[join(tmpdir(),'chosen')]}),admit:async(_owner:unknown,input:unknown)=>{grants.push(input);return['approved']}})
  expect(await picker.pick(scope,project,{purpose:'asset',folder:false},()=>{})).toEqual(['approved'])
  expect(grants[0]).toMatchObject({kind:'asset',scope:project})
  await expect(picker.pick(scope,null,{purpose:'export',folder:true},()=>{})).rejects.toThrow('VIDEO_PROJECT_NOT_SELECTED')
  await expect(picker.pick(scope,project,{purpose:'asset',folder:false,paths:['forged']},()=>{})).rejects.toThrow('VIDEO_PATH_PICKER_INVALID')
 })
 it('restores selected project paths only for their account and keeps export grants separate',async()=>{
  const root=await mkdtemp(join(tmpdir(),'video-native-paths-')),picked=join(root,'picked');await mkdir(picked)
  let owner='account-a';const admissions:Array<{owner:string;input:any}>=[],processes:ReturnType<typeof child>[]=[]
  const runtime=new VideoRuntime({userDataRoot:root,isCurrent:scope=>scope.accountId===owner,resources:async()=>({directory:root,node:join(root,'node.exe'),entry:join(root,'dsh.mjs'),plugin:join(root,'video-plugin.mjs'),domainEntry:join(root,'domain.mjs'),staticDirectory:join(root,'web'),manifestSha256:'a'.repeat(64),renderRuntime:{browserExecutable:join(root,'browser.exe'),ffmpegExecutable:join(root,'ffmpeg.exe'),ffprobeExecutable:join(root,'ffprobe.exe'),identities:{}}}),invoke:async()=>({data:null,artifacts:[]}),launch:()=>{
   const process=child(),launchOwner=owner;processes.push(process)
   process.stdin.on('data',chunk=>{for(const line of String(chunk).trim().split('\n')){const frame=JSON.parse(line);if(!frame.type){process.stdout.write(JSON.stringify({type:'ready',editorOrigin:'http://127.0.0.1:21234',filmOrigin:'http://localhost:21235'})+'\n')}else if(frame.type==='command'){if(frame.operation==='admitPaths')admissions.push({owner:launchOwner,input:frame.input});process.stdout.write(JSON.stringify({type:'result',id:frame.id,result:{admitted:true}})+'\n')}}})
   process.stdin.on('finish',()=>{Object.assign(process,{exitCode:0});process.emit('exit',0,null)});return process
  },invalidated:()=>{}})
  const a={accountId:'account-a',generation:1},b={accountId:'account-b',generation:2}
  try{
   await runtime.ensure(a);expect(typeof runtime.admitPaths).toBe('function')
   expect(await runtime.admitPaths(a,{kind:'project',paths:[picked]})).toEqual([await realpath(picked)])
   await runtime.revoke();await runtime.ensure(a);expect(admissions.filter(row=>row.owner===a.accountId)).toHaveLength(2);expect(admissions[1]?.input.paths).toEqual([await realpath(picked)])
   await runtime.revoke();owner=b.accountId;await runtime.ensure(b);expect(admissions.filter(row=>row.owner===b.accountId)).toEqual([])
   await expect(runtime.admitPaths(a,{kind:'project',paths:[picked]})).rejects.toThrow(/SCOPE/)
  }finally{await runtime.revoke();await rm(root,{recursive:true,force:true})}
 })
 it('launches a named minimal profile, correlates commands and never exposes tokens in URLs or environment',async()=>{
  const root=await mkdtemp(join(tmpdir(),'video-runtime-'));const process=child();let env:NodeJS.ProcessEnv|undefined,args:readonly string[]=[];let bootstrap:any
  process.stdin.on('data',chunk=>{for(const line of String(chunk).trim().split('\n')){const frame=JSON.parse(line);if(!frame.type){bootstrap=frame;process.stdout.write(JSON.stringify({type:'ready',editorOrigin:'http://127.0.0.1:21234',filmOrigin:'http://localhost:21235'})+'\n')}else if(frame.type==='command'){process.stdout.write(JSON.stringify({type:'result',id:frame.id,result:{revision:'123'}})+'\n')}}})
  process.stdin.on('finish',()=>{Object.assign(process,{exitCode:0});process.emit('exit',0,null)})
  const runtime=new VideoRuntime({userDataRoot:root,isCurrent:s=>s.generation===1,resources:async()=>({directory:root,node:join(root,'node.exe'),entry:join(root,'dsh.mjs'),plugin:join(root,'video-plugin.mjs'),domainEntry:join(root,'domain.mjs'),staticDirectory:join(root,'web'),manifestSha256:'a'.repeat(64),renderRuntime:{browserExecutable:join(root,'browser.exe'),ffmpegExecutable:join(root,'ffmpeg.exe'),ffprobeExecutable:join(root,'ffprobe.exe'),identities:{}}}),invoke:async()=>({data:null,artifacts:[]}),launch:(_exe,values,options)=>{env=options.env;args=values;return process},invalidated:()=>{}})
  try{
   expect(await runtime.ensure(scope)).toEqual({editorOrigin:'http://127.0.0.1:21234',filmOrigin:'http://localhost:21235'})
   expect(args.slice(-2)).toEqual(['--profile','studybuddy-video']);expect(JSON.stringify(env)).not.toContain(bootstrap.guestAuthorization)
   expect(bootstrap.accountGeneration).toBe(runtime.generation(scope));expect(bootstrap.bindings).toEqual([])
   const headers=runtime.requestHeaders(scope,'http://127.0.0.1:21234/api/projects');expect(headers['X-Studio-Key']).toHaveLength(64)
   expect(runtime.requestHeaders(scope,'ws://127.0.0.1:21234/api/events?visible=1')).toEqual(headers)
   expect(runtime.requestHeaders(scope,'ws://127.0.0.1:21234/api/projects/admitted-project/events')).toEqual(headers)
   for(const url of ['ws://localhost:21235/api/events','ws://127.0.0.1:21234/api/other','ws://127.0.0.1:21234/api/events?key=forged','ws://127.0.0.1:21234/api/events?visible=1&visible=0','wss://127.0.0.1:21234/api/events','ws://external.example/api/events','ws://user:secret@127.0.0.1:21234/api/events'])expect(runtime.requestHeaders(scope,url)).toEqual({})
   expect(runtime.isEditorUrl(scope,'ws://127.0.0.1:21234/api/events')).toBe(false)
   expect(runtime.requestHeaders(scope,'blob:http://127.0.0.1:21234/untrusted')).toEqual({});expect(runtime.isEditorUrl(scope,'blob:http://127.0.0.1:21234/untrusted')).toBe(false)
   expect(runtime.requestHeaders(scope,'https://example.org')).toEqual({});expect(runtime.requestHeaders({...scope,generation:2},'http://127.0.0.1:21234')).toEqual({})
   const binding={accountGeneration:runtime.generation(scope),workspaceId:'workspace',projectId:'project',sessionId:'session'}
   expect(await runtime.command(scope,'readProject',{scope:binding})).toEqual({revision:'123'})
   const patch=await readFile(join(env!.DSH_HOME!,'profiles/studybuddy-video/cordis.patch.yml'),'utf8');expect(patch).toContain('domainEntry');expect(patch).not.toContain('python')
  }finally{await runtime.revoke();await rm(root,{recursive:true,force:true})}
 })
 it('revokes pending commands before replacing the account and waits for the owned child',async()=>{
  const root=await mkdtemp(join(tmpdir(),'video-runtime-'));const process=child();let notified=0
  process.stdin.on('data',chunk=>{if(!JSON.parse(String(chunk).trim()).type)process.stdout.write('{"type":"ready","editorOrigin":"http://127.0.0.1:21234","filmOrigin":"http://localhost:21235"}\n')})
  process.stdin.on('finish',()=>{Object.assign(process,{exitCode:0});process.emit('exit',0,null)})
  const runtime=new VideoRuntime({userDataRoot:root,isCurrent:()=>true,resources:async()=>({directory:root,node:join(root,'node.exe'),entry:join(root,'dsh.mjs'),plugin:join(root,'video-plugin.mjs'),domainEntry:join(root,'domain.mjs'),staticDirectory:join(root,'web'),manifestSha256:'b'.repeat(64),renderRuntime:{browserExecutable:join(root,'browser.exe'),ffmpegExecutable:join(root,'ffmpeg.exe'),ffprobeExecutable:join(root,'ffprobe.exe'),identities:{}}}),invoke:async()=>({data:null,artifacts:[]}),launch:()=>process,invalidated:()=>{notified++}})
  try{await runtime.ensure(scope);const pending=runtime.command(scope,'projectInfo',{projectId:'project'});const rejected=expect(pending).rejects.toThrow('VIDEO_SCOPE_REVOKED');await runtime.revoke();await rejected;expect(process.exitCode).toBe(0);expect(notified).toBe(0)}finally{await runtime.revoke();await rm(root,{recursive:true,force:true})}
 })
})
