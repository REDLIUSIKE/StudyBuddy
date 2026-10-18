import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('all api.rename callers re-admit the current native project after the folder mutation',async t=>{
 const originalFetch=globalThis.fetch;
 let changed:(id:string)=>Promise<unknown>=async()=>{};
 Object.defineProperty(globalThis,'studybuddyVideoHost',{configurable:true,value:{version:1,name:'StudyBuddy',onProjectChanged:(id:string)=>changed(id)}});
 t.after(()=>{globalThis.fetch=originalFetch;Reflect.deleteProperty(globalThis,'studybuddyVideoHost');});
 const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../api.ts',import.meta.url))],tsconfig:fileURLToPath(new URL('../../tsconfig.json',import.meta.url)),bundle:true,write:false,platform:'node',format:'esm',target:'node24',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const {api}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 await t.test('header and library share an awaited native re-admission',async()=>{
  const events:string[]=[],project={id:'project-id',name:'Renamed',path:'new-root'};
  let release!:()=>void;
  globalThis.fetch=async()=>{events.push('rename');return Response.json({project});};
  changed=async id=>{assert.equal(id,project.id);events.push('native');await new Promise<void>(resolve=>{release=resolve;});};
  let completed=false;const pending=api.rename(project.id,project.name).then(value=>{completed=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,5));assert.deepEqual(events,['rename','native']);assert.equal(completed,false);
  release();assert.deepEqual(await pending,project);
 });
 await t.test('a failed rename still restores admission for the unchanged project',async()=>{
  let calls=0;globalThis.fetch=async()=>Response.json({error:'name taken'},{status:409});changed=async id=>{assert.equal(id,'project-id');calls++;};
  await assert.rejects(api.rename('project-id','taken'),/name taken/);assert.equal(calls,1);
 });
 await t.test('a failed native admission never reports success for a writable conversation',async()=>{
  globalThis.fetch=async()=>Response.json({project:{id:'project-id',name:'Renamed',path:'new-root'}});changed=async()=>{throw Error('VIDEO_SCOPE_REVOKED');};
  await assert.rejects(api.rename('project-id','Renamed'),/VIDEO_SCOPE_REVOKED/);
 });
});
