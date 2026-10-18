import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
import {pageFacts,pageFrame,closePageFrames} from '../pageframes.mjs';
import * as studioContext from './context.mjs';
const {withStudioContext,withStudioProject,waitForStudioProjectWork}=studioContext;

const browserExecutable=process.env.STUDYBUDDY_TEST_BROWSER??chromium.executablePath();
const enabled=existsSync(browserExecutable);
async function within(work,ms){let timer;try{return await Promise.race([work.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}finally{clearTimeout(timer);}}
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'video-preview-cancel-')),a=join(directory,'a'),b=join(directory,'b');
 await Promise.all([mkdir(a),mkdir(b)]);
 const pending=[],loaded=new Map(),controllers=new Map([[a,new AbortController()],[b,new AbortController()]]);
 let blocked=true;
 const server=createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  res.setHeader('content-type','text/html');
  const frame=blocked&&name==='/frame-blocked.html'?"fetch('/frame-entered');return new Promise(()=>{});":name==='/frame-later.html'?"if(t>0){fetch('/frame-entered');return new Promise(()=>{});}":'';
  res.end('<!doctype html><script>window.film={width:320,height:180,duration:2,frame(t){'+frame+'},ready:'+((blocked&&name==='/blocked.html')?'new Promise(()=>{})':'Promise.resolve()')+'};</script>');
  loaded.get(name)?.resolve();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const context={workspaceRoot:directory,stateRoot:join(directory,'state'),signal:new AbortController().signal,renderRuntime:{browserExecutable},projectSignalForRoot:root=>controllers.get(root)?.signal};
 t.after(async()=>{
  for(const controller of controllers.values())controller.abort();
  await closePageFrames();await Promise.allSettled(pending);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(directory,{recursive:true,force:true});
 });
 return{a,b,context,controllers,unblock:()=>{blocked=false;},
  async facts(root,name){if(!existsSync(join(root,name)))await writeFile(join(root,name),'fixture');const work=withStudioContext(context,()=>withStudioProject(root,()=>pageFacts(root,base,name)));pending.push(work);return work;},
  async frame(root,name,ms=0){if(!existsSync(join(root,name)))await writeFile(join(root,name),'fixture');const work=withStudioContext(context,()=>withStudioProject(root,()=>pageFrame(root,base,name,ms,160)));pending.push(work);return work;},
  loaded(name){const gate=Promise.withResolvers();loaded.set('/'+name,gate);return gate.promise;},
 };
}

test('closing a project cancels its active preview in a browser first used by another project', {skip:!enabled},async t=>{
 const f=await fixture(t);
 await f.facts(f.a,'ready.html');
 const entered=f.loaded('blocked.html'),work=f.facts(f.b,'blocked.html');
 const outcome=work.then(()=>null,error=>error);
 await entered;await new Promise(resolve=>setTimeout(resolve,100));
 const at=performance.now();f.controllers.get(f.b).abort();
 const drained=await within(waitForStudioProjectWork(f.context,f.b),1500);
 t.diagnostic('preview cancellation '+Math.round(performance.now()-at)+' ms');
 assert.equal(drained,true,'project close still waits for the preview readiness timeout');
 assert.ok(await outcome instanceof Error);
 // Cancelling a preview must neither invalidate another project nor cache a cancellation as a broken page.
 await f.facts(f.a,'ready.html');
 f.unblock();f.controllers.set(f.b,new AbortController());
 assert.equal((await f.facts(f.b,'blocked.html')).width,320);
});

test('closing a queued project does not wait for another project to finish drawing', {skip:!enabled},async t=>{
 const f=await fixture(t),entered=f.loaded('blocked.html');
 const drawing=f.facts(f.a,'blocked.html'),drawingOutcome=drawing.then(()=>null,error=>error);
 await entered;
 const queued=f.facts(f.b,'queued.html'),queuedOutcome=queued.then(()=>null,error=>error);
 await new Promise(resolve=>setTimeout(resolve,100));
 f.controllers.get(f.b).abort();
 assert.equal(await within(waitForStudioProjectWork(f.context,f.b),1500),true,'queued previews retain project work until an unrelated drawing finishes');
 assert.ok(await queuedOutcome instanceof Error);
 f.controllers.get(f.a).abort();await drawingOutcome;
});

test('closing during shared browser startup does not keep the project waiting for that startup', {skip:!enabled},async t=>{
 const started=Promise.withResolvers(),release=Promise.withResolvers(),launch=chromium.launch;
 t.mock.method(chromium,'launch',async function(options){started.resolve();await release.promise;return launch.call(this,options);});
 const f=await fixture(t),drawing=f.facts(f.a,'ready.html'),outcome=drawing.then(()=>null,error=>error);
 try{
  await started.promise;f.controllers.get(f.a).abort();
  assert.equal(await within(waitForStudioProjectWork(f.context,f.a),1500),true,'project close still waits for the shared browser to launch');
  assert.ok(await outcome instanceof Error);
 }finally{release.resolve();}
});

test('closing an active frame interrupts its page without writing or caching a failed frame', {skip:!enabled},async t=>{
 const f=await fixture(t);await f.facts(f.a,'ready.html');
 const entered=f.loaded('frame-entered'),drawing=f.frame(f.b,'frame-blocked.html'),outcome=drawing.then(()=>null,error=>error);
 await entered;f.controllers.get(f.b).abort();
 assert.equal(await within(waitForStudioProjectWork(f.context,f.b),1500),true,'an active frame still waits for its frame timeout');
 assert.ok(await outcome instanceof Error);
 assert.equal(existsSync(join(f.b,'.film/cache/pageframes')),false);
 f.unblock();f.controllers.set(f.b,new AbortController());
 assert.ok((await f.frame(f.b,'frame-blocked.html')).length>100);
});

test('a cached page responds to the current preview cancellation rather than its first owner', {skip:!enabled},async t=>{
 const f=await fixture(t);
 await f.frame(f.b,'frame-later.html');
 f.controllers.set(f.b,new AbortController());
 const entered=f.loaded('frame-entered'),drawing=f.frame(f.b,'frame-later.html',500),outcome=drawing.then(()=>null,error=>error);
 await entered;f.controllers.get(f.b).abort();
 assert.equal(await within(waitForStudioProjectWork(f.context,f.b),1500),true,'a reused preview page retained its old cancellation signal');
 assert.ok(await outcome instanceof Error);
});

test('project shutdown also cancels library previews started before a native project binding existed', {skip:!enabled},async t=>{
 const f=await fixture(t);f.controllers.delete(f.b);
 const entered=f.loaded('blocked.html'),drawing=f.facts(f.b,'blocked.html'),outcome=drawing.then(()=>null,error=>error);
 await entered;f.controllers.set(f.b,new AbortController());f.controllers.get(f.b).abort();
 studioContext.cancelStudioProjectWork?.(f.context,f.b);
 assert.equal(await within(waitForStudioProjectWork(f.context,f.b),1500),true,'a pre-admission preview is outside native project cancellation');
 assert.ok(await outcome instanceof Error);
});

test('project shutdown closes its idle library preview pages while preserving another project', {skip:!enabled},async t=>{
 let browser;const launch=chromium.launch;
 t.mock.method(chromium,'launch',async function(options){return browser=await launch.call(this,options);});
 const f=await fixture(t);await f.facts(f.a,'ready.html');const other=browser.contexts()[0];
 f.controllers.delete(f.b);await f.facts(f.b,'ready.html');
 const own=browser.contexts().find(context=>context!==other),closed=new Promise(resolve=>own.once('close',resolve));
 studioContext.cancelStudioProjectWork(f.context,f.b);await waitForStudioProjectWork(f.context,f.b);
 assert.equal(await within(closed,1500),true,'a completed library preview kept its project page running');
 assert.ok(browser.contexts().includes(other),'another project lost its preview');
});
