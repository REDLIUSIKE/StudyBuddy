import { afterEach,describe,it,expect } from 'vitest'
import { mkdtemp,writeFile,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline,type AppReady } from '@deepseek-ai/dsh-cmdline'
import * as VideoPlugin from '../src/video-editing-plugin.ts'

const owners:Context[]=[]
const roots:string[]=[]
afterEach(async()=>{await Promise.all(owners.splice(0).map(ctx=>ctx.fiber.dispose()));for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'sb-video-plugin-'));roots.push(root)
 const module=join(root,'domain.mjs')
 await writeFile(module,`let closed=false; export async function createEmbeddedVideoDomain(options){const signal=options.projectSignalForRoot(options.workspaceRoot);return {
 start:async()=>({editorOrigin:'http://127.0.0.1:18001',filmOrigin:'http://localhost:18002'}),quiesceProject:async()=>{if(!signal.aborted)throw Error('VIDEO_TEST_PROJECT_NOT_ABORTED');await new Promise(resolve=>setTimeout(resolve,5));},admitPaths:async()=>({admitted:true}),translate:async()=>({language:'zh',translated:[],already:0,same:0,failed:[]}),
 projectInfo:async()=>({id:'p1',path:options.workspaceRoot,name:'fixture'}),readGuide:async()=>({guide:'manual',text:'format',revision:'1'}),
 readProject:async scope=>({document:await options.resolveProject(scope),revision:'1234',assets:[]}),
 readFile:async()=>({text:'',revision:'0'}),applyEdit:async()=>({revision:'1'}),
 capability:async(scope,caller,operation,args)=>({scope,caller,operation,args}),
 look:async()=>({ok:true,lines:[],artifacts:[]}),mediaRequest:async()=>({data:{subtitlesStatus:'created'},artifacts:[]}),transcribe:async(scope,src,signal)=>src==='wait.wav'?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('VIDEO_TRANSCRIPTION_CANCELLED')),{once:true})):({src,requestIds:[],artifacts:[]}),createExport:async()=>({jobId:'job'}),cancelExport:async()=>{},readExports:async()=>({jobs:[]}),
 close:async()=>{closed=true}
 }}`)
 const input=new PassThrough(),output=new PassThrough(),chunks:Buffer[]=[]
 output.on('data',(chunk:Buffer)=>chunks.push(chunk))
 const callbacks=new Set<()=>void>()
 const ready:AppReady={onReady(fn){callbacks.add(fn);return()=>{callbacks.delete(fn)}}}
 const exits:number[]=[]
 const config={domainEntry:module,staticDirectory:root}
 const scope={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:'s1'}
 const bootstrap={accountGeneration:'a1',workspaceRoot:root,stateRoot:join(root,'state'),guestAuthorization:'a'.repeat(64),bindings:[{scope,projectRoot:root}]}
 const ctx=new Context();owners.push(ctx)
 provideCmdline(ctx,{args:[],ready,exit:code=>{exits.push(code)}})
 const text=()=>Buffer.concat(chunks).toString('utf8')
 const mount=()=>ctx.plugin({...VideoPlugin,apply:(host:Context,value:VideoPlugin.Config)=>VideoPlugin.mountVideoPlugin(host,value,input,output)},config)
 return{root,config,scope,bootstrap,input,output,ready,exits,ctx,text,mount,commit:()=>{for(const fn of callbacks)fn()}}
}
describe('video Host profile',()=>{
 it('loads service through the real Loader and reports only origins after ready',async()=>{
  const f=await fixture(),configPath=join(f.root,'cordis.yml')
  await writeFile(configPath,JSON.stringify([{id:'video',name:'cordis:video-test',config:f.config}]))
  let owner:Context|undefined
  const loading=boot('video-fixture',configPath,[],host=>{
   owner=host;owners.push(host)
   provideCmdline(host,{args:[],ready:f.ready,exit:code=>{f.exits.push(code)}})
   host.loader.builtins['video-test']={...VideoPlugin,apply:(ctx:Context,cfg:VideoPlugin.Config)=>VideoPlugin.mountVideoPlugin(ctx,cfg,f.input,f.output)}
  })
  f.input.write(JSON.stringify(f.bootstrap)+'\n')
  await loading
  expect(owner?.get('videoEditing')).toBeDefined();expect(f.text()).toBe('')
  f.commit();await expect.poll(f.text).toContain('"type":"ready"')
  expect(JSON.parse(f.text())).toEqual({type:'ready',editorOrigin:'http://127.0.0.1:18001',filmOrigin:'http://localhost:18002'})
  await owner?.fiber.dispose()
  expect(owner?.get('videoEditing')).toBeUndefined()
  expect(f.input.listenerCount('data')).toBe(0)
 })
 it('preserves split bootstrap bytes and correlated commands after the same chunk',async()=>{
  const f=await fixture(),mounted=f.mount(),wire=JSON.stringify(f.bootstrap)
  f.input.write(wire.slice(0,11));f.input.write(wire.slice(11)+'\n'+JSON.stringify({type:'command',id:'one',operation:'readProject',scope:f.scope})+'\n')
  await mounted
  await expect.poll(f.text).toContain('"id":"one"')
  expect(JSON.parse(f.text()).result.document).toBe(f.root)
 })
 it('revokesScopeAndDropsLateResult: unbinding denies the old Session',async()=>{
  const f=await fixture(),mounted=f.mount();f.input.write(JSON.stringify(f.bootstrap)+'\n');await mounted
  f.input.write(JSON.stringify({type:'command',id:'remove',operation:'unbind',scope:f.scope})+'\n')
  await expect.poll(f.text).toContain('"id":"remove"')
  f.input.write(JSON.stringify({type:'command',id:'old',operation:'readProject',scope:f.scope})+'\n')
  await expect.poll(f.text).toContain('VIDEO_SCOPE_REVOKED')
 })
 it('cancels the owned transcription operation without stopping the video profile',async()=>{
  const f=await fixture(),mounted=f.mount();f.input.write(JSON.stringify(f.bootstrap)+'\n');await mounted;f.commit()
  f.input.write(JSON.stringify({type:'command',id:'words',operation:'transcribe',scope:f.scope,input:{src:'wait.wav'}})+'\n')
  await new Promise(resolve=>setTimeout(resolve,20))
  f.input.write(JSON.stringify({type:'command',id:'same-binding',operation:'bind',scope:f.scope,projectRoot:f.root})+'\n')
  await expect.poll(f.text).toContain('"id":"same-binding"');expect(f.text()).not.toContain('VIDEO_TRANSCRIPTION_CANCELLED')
  f.input.write(JSON.stringify({type:'cancel-command',id:'words'})+'\n')
  await expect.poll(f.text).toContain('VIDEO_TRANSCRIPTION_CANCELLED')
  f.input.write(JSON.stringify({type:'command',id:'still-alive',operation:'readProject',scope:f.scope})+'\n')
  await expect.poll(f.text).toContain('"id":"still-alive"')
 })
 it('rejects a binding for a different account generation',async()=>{
  const f=await fixture(),mounted=f.mount();f.input.write(JSON.stringify(f.bootstrap)+'\n');await mounted
  f.input.write(JSON.stringify({type:'command',id:'forged',operation:'bind',scope:{...f.scope,accountGeneration:'other-account'},projectRoot:f.root})+'\n')
  await expect.poll(f.text).toContain('VIDEO_SCOPE_REVOKED')
 })
 it('opens the bound project through the private capability command with its original caller',async()=>{
  const f=await fixture(),mounted=f.mount();f.input.write(JSON.stringify(f.bootstrap)+'\n');await mounted
  const caller={schemaVersion:1,grantRef:'11111111-1111-4111-8111-111111111111',sessionId:'session-aigc-origin',toolCallId:'project-open'}
  f.input.write(JSON.stringify({type:'command',id:'open-project',operation:'capability',scope:f.scope,caller,input:{operation:'openProject',args:{}}})+'\n')
  await expect.poll(f.text).toContain('"id":"open-project"')
  expect(JSON.parse(f.text())).toEqual({type:'result',id:'open-project',result:{scope:f.scope,caller,operation:'openProject',args:{}}})
  f.input.write(JSON.stringify({type:'command',id:'foreign-project',operation:'capability',scope:{...f.scope,projectId:'other'},caller,input:{operation:'openProject',args:{}}})+'\n')
  await expect.poll(f.text).toContain('"id":"foreign-project","error":"VIDEO_SCOPE_REVOKED"')
 })
 it('accepts private path selections only for the current account and project binding',async()=>{
  const f=await fixture(),mounted=f.mount();f.input.write(JSON.stringify(f.bootstrap)+'\n');await mounted
  const send=(id:string,input:unknown)=>f.input.write(JSON.stringify({type:'command',id,operation:'admitPaths',input})+'\n')
  send('project-path',{kind:'project',accountGeneration:f.scope.accountGeneration,paths:[f.root]})
  await expect.poll(f.text).toContain('"id":"project-path","result":{"admitted":true}')
  send('wrong-owner',{kind:'project',accountGeneration:'other',paths:[f.root]})
  await expect.poll(f.text).toContain('"id":"wrong-owner","error":"VIDEO_SCOPE_REVOKED"')
  send('wrong-project',{kind:'asset',accountGeneration:f.scope.accountGeneration,paths:[f.root],scope:{...f.scope,projectId:'other'}})
  await expect.poll(f.text).toContain('"id":"wrong-project","error":"VIDEO_SCOPE_REVOKED"')
 })
 it('invalid bootstrap fails without revealing private input',async()=>{
  const f=await fixture(),mounted=f.mount()
  f.input.write(JSON.stringify({...f.bootstrap,guestAuthorization:'private-credential-must-not-be-echoed'})+'\n')
  await expect(mounted).rejects.toThrow('VIDEO_BOOTSTRAP_INVALID')
  expect(f.text()).not.toContain('private-credential')
 })
 it('early stdin EOF and disposal during startup do not announce readiness',async()=>{
  const f=await fixture(),mounted=f.mount()
  f.input.end()
  await mounted
  f.commit();expect(f.text()).toBe('')
  await f.ctx.fiber.dispose();expect(f.input.listenerCount('data')).toBe(0)
 })
})
