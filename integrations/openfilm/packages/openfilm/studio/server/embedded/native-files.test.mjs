import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext} from './context.mjs';
import {addLinkedPlaces,linkAllowed,readableLink} from '../../../src/media-links.mjs';
import {VideoPathAdmissions} from './path-admissions.mjs';
import {transcribeNativeSpeech} from './native-speech.mjs';
import {readable} from '../files.mjs';
import {createExports,projectFiles} from '../exports.mjs';
import {filmHtml} from '../../../src/film-doc.mjs';
import {resolveVideoRenderRuntime} from './render-runtime.mjs';
import {execFileSync} from 'node:child_process';

test('linked media permissions belong to account state and never modify the standalone home',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-video-linked-')),legacy=join(root,'standalone'),previous=process.env.OPENFILM_HOME;
 process.env.OPENFILM_HOME=legacy;
 t.after(async()=>{if(previous===undefined)delete process.env.OPENFILM_HOME;else process.env.OPENFILM_HOME=previous;await rm(root,{recursive:true,force:true});});
 const media=join(root,'external'),a=join(root,'account-a'),b=join(root,'account-b');await mkdir(media);await mkdir(a);await mkdir(b);
 const source=join(media,'take.wav');await writeFile(source,'fixture');
 const account=path=>({workspaceRoot:path,stateRoot:join(path,'state'),signal:new AbortController().signal});
 await withStudioContext(account(a),async()=>{
  addLinkedPlaces([media]);assert.equal(linkAllowed(source),true);
  await withStudioContext(account(b),async()=>assert.equal(linkAllowed(source),false));
  assert.equal(linkAllowed(source),true);
 });
 assert.equal(linkAllowed(source),false);
 await assert.rejects(readFile(join(legacy,'links.json')),/ENOENT/);
 assert.match(await readFile(join(a,'state/links.json'),'utf8'),/external/);
 await mkdir(join(a,'assets'));await symlink(media,join(a,'assets/linked'),process.platform==='win32'?'junction':'dir');
 assert.equal(withStudioContext(account(a),()=>readable(a,'assets/linked/take.wav')),join(a,'assets/linked/take.wav'));
 assert.throws(()=>withStudioContext(account(b),()=>readable(a,'assets/linked/take.wav')),/inside/);
});

test('the real export worker reads linked media through its owning account state',{skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:60000},async t=>{
 const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
 const renderRuntime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-fixture'}]))});
 const root=await mkdtemp(join(tmpdir(),'sb-worker-linked-')),project=join(root,'project'),outside=join(root,'external'),state=join(root,'state');
 const exports=createExports();t.after(async()=>{await exports.stopAll();await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 await mkdir(join(project,'assets'),{recursive:true});await mkdir(outside);
 await writeFile(join(outside,'red.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><path fill="#ff0000" d="M0 0h160v90H0z"/></svg>');
 await symlink(outside,join(project,'assets/linked'),process.platform==='win32'?'junction':'dir');
 await writeFile(join(project,'shot.html'),'<!doctype html><body style="margin:0;background:black"><img src="assets/linked/red.svg" width="160" height="90"><script>window.film={width:160,height:90,duration:.2,frame(t){}}</script>');
 await writeFile(join(project,'film.html'),filmHtml({stage:{w:160,h:90},tracks:[{clips:[{src:'shot.html',id:'shot'}]}]}));
 const pathAdmissions=new VideoPathAdmissions(root);await pathAdmissions.admit('asset',[outside],project);await pathAdmissions.admit('export',[root],project);
 await withStudioContext({workspaceRoot:root,stateRoot:state,signal:new AbortController().signal,renderRuntime,pathAdmissions},async()=>{
  addLinkedPlaces([outside]);const job=exports.start({id:'p',name:'Linked',path:project},{kind:'video',fps:5,hardware:false,quality:'standard'},{folder:join(root,'out')});
  let done;for(;;){done=exports.list('p').find(row=>row.id===job.id);if(['done','failed','cancelled'].includes(done.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(done.status,'done',done.error);
  const pixel=execFileSync(renderRuntime.ffmpegExecutable,['-v','error','-i',done.outputs[0],'-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  assert.ok(pixel[0]>220&&pixel[1]<20&&pixel[2]<20,'the linked red image must be visible in the encoded frame');
 });
});

test('a linked file admitted to one project is unreadable from another project in that account',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-link-projects-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const a=join(root,'a'),b=join(root,'b'),media=join(root,'media');for(const path of [join(a,'assets'),join(b,'assets'),media])await mkdir(path,{recursive:true});
 await writeFile(join(media,'take.wav'),'private');for(const path of [a,b])await symlink(media,join(path,'assets/linked'),process.platform==='win32'?'junction':'dir');
 const pathAdmissions=new VideoPathAdmissions(root);await pathAdmissions.admit('asset',[media],a);
 await withStudioContext({workspaceRoot:root,stateRoot:join(root,'state'),pathAdmissions},()=>{
  addLinkedPlaces([media]);assert.equal(readableLink(a,join(a,'assets/linked/take.wav')),true);
  assert.equal(readableLink(b,join(b,'assets/linked/take.wav')),false);
 });
});

test('speech accepts an admitted file link',{skip:process.platform==='win32'?'file symlinks require privileges unavailable in this Windows session':false},async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-speech-linked-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=join(root,'project'),media=join(root,'media');await mkdir(join(project,'assets'),{recursive:true});await mkdir(media);await writeFile(join(media,'take.wav'),'fixture');
 await symlink(join(media,'take.wav'),join(project,'assets/take.wav'),'file');
 const pathAdmissions=new VideoPathAdmissions(root);await pathAdmissions.admit('asset',[media],project);let calls=0;
 const context={workspaceRoot:root,stateRoot:join(root,'state'),pathAdmissions,signal:new AbortController().signal,scopeForRoot:()=>({projectId:'p'}),capabilities:{request:async()=>{calls++;return{data:[]};}}};
 await withStudioContext(context,async()=>{
  addLinkedPlaces([media]);await assert.rejects(transcribeNativeSpeech(project,'assets/take.wav'),/WORD_TIMESTAMPS_UNAVAILABLE/);assert.equal(calls,1);
 });
});

test('speech checks a writable transcript path before dispatch for linked folders',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-speech-folder-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=join(root,'project'),media=join(root,'media');await mkdir(join(project,'assets'),{recursive:true});await mkdir(media);await writeFile(join(media,'take.wav'),'fixture');
 await symlink(media,join(project,'assets/folder'),process.platform==='win32'?'junction':'dir');
 const pathAdmissions=new VideoPathAdmissions(root);await pathAdmissions.admit('asset',[media],project);let calls=0;
 await withStudioContext({workspaceRoot:root,stateRoot:join(root,'state'),pathAdmissions,signal:new AbortController().signal,scopeForRoot:()=>({projectId:'p'}),capabilities:{request:async()=>{calls++;return{data:[]};}}},async()=>{
  addLinkedPlaces([media]);await assert.rejects(transcribeNativeSpeech(project,'assets/folder/take.wav'),/inside|escape/i);assert.equal(calls,0);
 });
});

test('project archives reject a metadata junction instead of collecting outside settings',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-export-metadata-'));t.after(()=>rm(root,{recursive:true,force:true}));const project=join(root,'project'),outside=join(root,'outside');await mkdir(project);await mkdir(outside);await writeFile(join(outside,'settings.json'),'private outside settings');await symlink(outside,join(project,'.film'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(withStudioContext({workspaceRoot:root,stateRoot:join(root,'state')},()=>projectFiles(project,[])),/admitted|escape/i);
});

for(const part of ['history','chat','logs'])test(`project archives reject an external ${part} part junction`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'sb-export-part-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=join(root,'project'),outside=join(root,'outside');await mkdir(join(project,'.film'),{recursive:true});await mkdir(outside);
 await writeFile(join(project,'film.html'),'project film');await writeFile(join(outside,'private.txt'),'unadmitted private bytes');
 await symlink(outside,join(project,'.film',part),process.platform==='win32'?'junction':'dir');
 await assert.rejects(withStudioContext({workspaceRoot:root,stateRoot:join(root,'state')},()=>projectFiles(project,[part])),/admitted|escape/i);
 assert.equal(await readFile(join(outside,'private.txt'),'utf8'),'unadmitted private bytes');
});
