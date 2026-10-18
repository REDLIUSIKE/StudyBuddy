import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext,withStudioProject,studioProjectSignal,waitForStudioProjectWork} from './context.mjs';
import {trackRenderChild} from '../../../src/runtime.mjs';
import {createExports} from '../exports.mjs';
import {filmHtml} from '../../../src/film-doc.mjs';
import {resolveVideoRenderRuntime} from './render-runtime.mjs';

test('project cleanup waits for its actual child exit and preserves another project child',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-project-process-')),a=join(root,'a'),b=join(root,'b');await mkdir(a);await mkdir(b);
 const ca=new AbortController(),cb=new AbortController(),signals=new Map([[a,ca.signal],[b,cb.signal]]),errors=[];
 const context={workspaceRoot:root,stateRoot:join(root,'state'),signal:new AbortController().signal,projectSignalForRoot:path=>signals.get(path)};
 const start=path=>withStudioProject(path,()=>{const child=trackRenderChild(spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,signal:studioProjectSignal(path)}));child.on('error',error=>{if(error.name!=='AbortError')errors.push(error);});return child;});
 try{
  const [first,second]=await withStudioContext(context,()=>Promise.all([start(a),start(b)]));ca.abort();await waitForStudioProjectWork(context,a);
  assert.ok(first.exitCode!==null||first.signalCode!==null);assert.equal(second.exitCode,null);assert.equal(second.signalCode,null);assert.doesNotThrow(()=>process.kill(second.pid,0));assert.deepEqual(errors,[]);
 }finally{ca.abort();cb.abort();await waitForStudioProjectWork(context);await rm(root,{recursive:true,force:true});}
});

test('cancelling a real render drains that project and preserves the next queued project',{skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:30000},async t=>{
 const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8')),renderRuntime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-fixture'}]))});
 const root=await mkdtemp(join(tmpdir(),'sb-project-render-')),a=join(root,'a'),b=join(root,'b'),ca=new AbortController(),cb=new AbortController(),signals=new Map([[a,ca.signal],[b,cb.signal]]),exports=createExports();
 const context={workspaceRoot:root,stateRoot:join(root,'state'),signal:new AbortController().signal,renderRuntime,projectSignalForRoot:path=>signals.get(path)};
 t.after(async()=>{ca.abort();cb.abort();await exports.stopAll();await waitForStudioProjectWork(context);await rm(root,{recursive:true,force:true});});
 for(const [path,duration,color]of [[a,20,'red'],[b,.2,'blue']]){await mkdir(path);await writeFile(join(path,'shot.html'),'<body style="margin:0;background:'+color+'"><script>window.film={width:160,height:90,duration:'+duration+',frame(t){}}</script>');await writeFile(join(path,'film.html'),filmHtml({stage:{w:160,h:90},tracks:[{clips:[{src:'shot.html',id:'shot'}]}]}));}
 const [first,second]=withStudioContext(context,()=>[exports.start({id:'a',name:'a',path:a},{kind:'video',fps:5,hardware:false,quality:'standard'},{folder:join(root,'out')}),exports.start({id:'b',name:'b',path:b},{kind:'video',fps:5,hardware:false,quality:'standard'},{folder:join(root,'out')})]);
 for(let i=0;i<1000;i++){const job=exports.list('a').find(row=>row.id===first.id);if(job.framesDone>0)break;if(['failed','done','cancelled'].includes(job.status))assert.fail('Expected an active frame before cancel: '+JSON.stringify(job));await new Promise(resolve=>setTimeout(resolve,10));}
 assert.ok(exports.list('a')[0].framesDone>0);ca.abort();await exports.waitForProject('a');await waitForStudioProjectWork(context,a);assert.equal(exports.list('a')[0].status,'cancelled');
 for(let i=0;i<1000;i++){const job=exports.list('b').find(row=>row.id===second.id);if(['done','failed','cancelled'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
 const done=exports.list('b')[0];assert.equal(done.status,'done',done.error);assert.ok((await readFile(done.outputs[0])).length>0);assert.equal(cb.signal.aborted,false);
});
