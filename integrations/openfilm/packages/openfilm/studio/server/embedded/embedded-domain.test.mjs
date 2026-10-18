import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmbeddedVideoDomain } from './domain.mjs';
import { withStudioContext } from './context.mjs';
import { editProjectFilm, readProjectFilm } from '../film.mjs';
import { filmHtml } from '../../../src/film-doc.mjs';
import { openProject } from '../projects.mjs';
import { resolveVideoRenderRuntime } from './render-runtime.mjs';

const scope = { accountGeneration: 'account-1', workspaceId: 'workspace-1', projectId: 'project-1', sessionId: 'session-1' };
const initial = '<!doctype html><script type="application/json" id="film">{"stage":{"w":640,"h":360},"tracks":[]}</script>';
async function fixture(t,renderRuntime,request) {
  const directory = await mkdtemp(join(tmpdir(), 'sb-video-'));
  const workspaceRoot = join(directory, '工作区 with spaces');
  const project = join(workspaceRoot, '中学 项目');
  const stateRoot = join(directory, 'state');
  const staticDirectory = join(directory, 'ui');
  await Promise.all([mkdir(project, { recursive:true }), mkdir(staticDirectory, { recursive:true })]);
  await writeFile(join(project,'film.html'), initial);
  await writeFile(join(staticDirectory,'index.html'), '<!doctype html><title>Studio</title>');
  let current = true;
  let resolvedProject=project;
  const activeScope={...scope};
  const domain = await createEmbeddedVideoDomain({
    accountGeneration: scope.accountGeneration, workspaceRoot, stateRoot, staticDirectory,
    guestAuthorization: 'private-test-launch-authorization',
    ...(renderRuntime?{renderRuntime}:{}),
    scopeForRoot:root=>current&&root===resolvedProject?{...activeScope}:undefined,
    resolveProject: async () => resolvedProject,
    isCurrentScope: value => current && JSON.stringify(value) === JSON.stringify(activeScope),
    capabilities: { request:request??(async () => { throw new Error('No paid service in domain tests'); }) },
  });
  t.after(async () => { await domain.close(); await rm(directory, { recursive:true,force:true }); });
  return { domain, directory, workspaceRoot, project, useRoot:value=>{resolvedProject=value;}, revoke: () => { current=false; },admitProjectId:id=>{activeScope.projectId=id;return{...activeScope};} };
}
test('only native-admitted external projects can be opened by this domain',async t=>{
 const f=await fixture(t),outside=join(f.directory,'外部 项目');await mkdir(outside);await writeFile(join(outside,'film.html'),initial);f.useRoot(outside);
 await assert.rejects(f.domain.readProject(scope),/outside|escapes|admitted/i);
 assert.equal(typeof f.domain.admitPaths,'function');
 await f.domain.admitPaths({kind:'project',accountGeneration:scope.accountGeneration,paths:[outside]});
 assert.equal((await f.domain.readProject(scope)).document,initial);
 await assert.rejects(f.domain.readFile(scope,'../private.txt'),/outside|escapes|private/i);
});

test('native export destination permission is distinct from admitting a project',async t=>{
 const f=await fixture(t),out=join(f.directory,'导出');await mkdir(out);
 assert.equal(typeof f.domain.admitPaths,'function');
 await f.domain.admitPaths({kind:'project',accountGeneration:scope.accountGeneration,paths:[out]});
 await assert.rejects(f.domain.createExport(scope,{kind:'project',folder:out}),/EXPORT_PATH|admitted/i);
 await f.domain.admitPaths({kind:'export',accountGeneration:scope.accountGeneration,scope,paths:[out]});
 const {jobId}=await f.domain.createExport(scope,{kind:'project',folder:out});let job;
 for(;;){job=(await f.domain.readExports(scope,jobId)).jobs[0];if(['done','failed','cancelled'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(job.status,'done',job.error);assert.ok(job.outputs.every(path=>path.startsWith(out)));
});
test('quiescing an admitted external project still works after its folder has disappeared',async t=>{
 const f=await fixture(t),outside=join(f.directory,'moved-external-project');await mkdir(outside);await writeFile(join(outside,'film.html'),initial);f.useRoot(outside);
 await f.domain.admitPaths({kind:'project',accountGeneration:scope.accountGeneration,paths:[outside]});
 await rm(outside,{recursive:true});await f.domain.quiesceProject(scope);
});
test('original rename waits for native project release and retains admission at its new external path',async t=>{
 const requests=[];let release,entered
 const released=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;})
 const f=await fixture(t,undefined,async request=>{requests.push(request);entered();await released;return{data:{released:true},artifacts:[]};}),outside=join(f.directory,'original-external');await mkdir(outside);await writeFile(join(outside,'film.html'),initial);f.useRoot(outside);
 await f.domain.admitPaths({kind:'project',accountGeneration:scope.accountGeneration,paths:[outside]});
 const {editorOrigin}=await f.domain.start(),headers={'x-studio-key':'private-test-launch-authorization','content-type':'application/json'};
 const opened=await fetch(editorOrigin+'/api/projects',{method:'POST',headers,body:JSON.stringify({path:outside})}),project=(await opened.json()).project;f.admitProjectId(project.id);
 const renaming=fetch(editorOrigin+'/api/projects/'+project.id,{method:'PATCH',headers,body:JSON.stringify({name:'renamed-external'})});
 await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('native release was not requested')),1000))]);
 assert.equal(await readFile(join(outside,'film.html'),'utf8'),initial);assert.equal(requests[0].operation,'project-release');release();
 const response=await renaming;assert.equal(response.status,200,await response.clone().text());const renamed=(await response.json()).project;
 assert.equal(renamed.path,join(f.directory,'renamed-external'));assert.equal((await f.domain.projectInfo(project.id)).path,renamed.path);
 await f.domain.quiesceProject({...scope,projectId:project.id});
});

test('editor imports require a native asset selection for the current project',async t=>{
 const f=await fixture(t),source=join(f.directory,'selected.wav');await writeFile(source,'selected audio');
 const {editorOrigin}=await f.domain.start(),headers={'x-studio-key':'private-test-launch-authorization','content-type':'application/json'};
 const opened=await fetch(editorOrigin+'/api/projects',{method:'POST',headers,body:JSON.stringify({path:f.project})});
 const project=(await opened.json()).project,admitted=f.admitProjectId(project.id);
 const bring=()=>fetch(editorOrigin+'/api/projects/'+project.id+'/files/bring',{method:'POST',headers,body:JSON.stringify({paths:[source],mode:'copy'})});
 assert.notEqual((await bring()).status,200);
 await f.domain.admitPaths({kind:'asset',accountGeneration:scope.accountGeneration,scope:admitted,paths:[source]});
 const imported=await bring();assert.equal(imported.status,200);assert.equal(await readFile(join(f.project,'assets/selected.wav'),'utf8'),'selected audio');
 await assert.rejects(f.domain.admitPaths({kind:'asset',accountGeneration:'other',scope:admitted,paths:[source]}),/scope|revoked/i);
});

test('project chat and log exports include the native Session archive from the existing owner',async t=>{
 let f;const requests=[];
 const pins=process.env.STUDYBUDDY_VIDEO_TEST_PINS?JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8')):null;
 if(!pins){t.skip('export metadata needs reviewed shared runtime pins');return;}
 const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-fixture'}]))});
 f=await fixture(t,runtime,async request=>{
  requests.push(request);const relativePath='.film/chat/studybuddy-native/session.zip';await mkdir(join(f.project,'.film/chat/studybuddy-native'),{recursive:true});await writeFile(join(f.project,relativePath),'native session archive');
  return{data:{state:'completed'},artifacts:[{relativePath,sha256:'a'.repeat(64),mime:'application/zip'}],receiptRef:request.requestId};
 });
 const {editorOrigin}=await f.domain.start(),info=await fetch(editorOrigin+'/api/projects',{method:'POST',headers:{'x-studio-key':'private-test-launch-authorization','content-type':'application/json'},body:JSON.stringify({path:f.project})}),project=(await info.json()).project;
 f.admitProjectId(project.id);const metadata=await fetch(editorOrigin+'/api/projects/'+project.id+'/exports',{headers:{'x-studio-key':'private-test-launch-authorization'}});
 assert.equal(metadata.status,200);assert.deepEqual((await metadata.json()).project.availableParts,['chat','logs']);
 const out=join(f.directory,'native-exports');await mkdir(out);const admitted=f.admitProjectId(project.id);await f.domain.admitPaths({kind:'export',accountGeneration:scope.accountGeneration,scope:admitted,paths:[out]});
 for(const part of ['chat','logs']){
  const {jobId}=await f.domain.createExport(admitted,{kind:'project',parts:[part],folder:out});let job;
  for(let i=0;i<500;i++){job=(await f.domain.readExports(admitted,jobId)).jobs[0];if(['done','failed','cancelled'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(job.status,'done',job.error);const zip=await readFile(job.outputs[0]);assert.ok(zip.includes(Buffer.from('.film/'+part+'/studybuddy-native/session.zip')));
 }
 assert.equal(requests.length,2);assert.ok(requests.every(request=>request.operation==='session-export'&&request.scope.projectId===project.id));
});

test('embedded file dialogs use the native owner instead of standalone scripts',async t=>{
 const {domain}=await fixture(t),{editorOrigin}=await domain.start(),headers={'x-studio-key':'private-test-launch-authorization','content-type':'application/json'};
 for(const path of ['pick-folder','pick-files']){
  const response=await fetch(editorOrigin+'/api/'+path,{method:'POST',headers,body:'{}'});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'VIDEO_NATIVE_FILES_MANAGED');
 }
});

test('reads original document without rewriting its format or global state', async t => {
  const before = process.env.OPENFILM_HOME;
  const { domain, project } = await fixture(t);
  const snapshot = await domain.readProject(scope);
  assert.equal(snapshot.document, initial);
  assert.match(snapshot.revision, /^[a-f0-9]{16,64}$/);
  assert.equal(await readFile(join(project,'film.html'),'utf8'), initial);
  assert.equal(process.env.OPENFILM_HOME, before);
});
test('provides original format documentation only to a current project scope',async t=>{
  const{domain}=await fixture(t);
  const guide=await domain.readGuide(scope,'manual');assert.match(guide.text,/window\.film/);assert.match(guide.revision,/^[a-f0-9]{16}$/);
  await assert.rejects(domain.readGuide({...scope,sessionId:'foreign'},'manual'),/scope|revoked/i);
  await assert.rejects(domain.readGuide(scope,'../../keys'),/guide|documentation/i);
});
test('resolves only a registered original project and reads a new shot as an empty revision',async t=>{
  const {domain,project,workspaceRoot,directory}=await fixture(t);
  const created=await withStudioContext({workspaceRoot,stateRoot:join(directory,'state')},()=>openProject(project));
  assert.equal((await domain.projectInfo(created.id)).path,project);
  await assert.rejects(domain.projectInfo('unregistered'),/project/i);
  const empty=await domain.readFile(scope,'shots/new.html');
  assert.equal(empty.text,'');
  await domain.applyEdit(scope,empty.revision,{kind:'replace-file',relativePath:'shots/new.html',text:'new shot'});
  assert.equal(await readFile(join(project,'shots/new.html'),'utf8'),'new shot');
});
test('project metadata junction is rejected before any outside metadata write',async t=>{
  const {project,workspaceRoot,directory}=await fixture(t);
  const outside=join(directory,'metadata-outside');await mkdir(outside);
  await symlink(outside,join(project,'.film'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(withStudioContext({workspaceRoot,stateRoot:join(directory,'state')},()=>openProject(project)),/admitted|outside|escape/i);
  assert.equal(await stat(join(outside,'.gitignore')).then(()=>true,()=>false),false);
});
test('rejectsStaleRevision: concurrent edits preserve the winning bytes', async t => {
  const { domain, project } = await fixture(t);
  const { revision } = await domain.readProject(scope);
  const edits = await Promise.all([
    domain.applyEdit(scope,revision,{kind:'replace-file',relativePath:'film.html',text:initial+'<!-- first -->'}),
    domain.applyEdit(scope,revision,{kind:'replace-file',relativePath:'film.html',text:initial+'<!-- second -->'}),
  ]);
  assert.equal(edits.filter(result => result.conflict === true).length,1);
  assert.equal(await readFile(join(project,'film.html'),'utf8'), initial+'<!-- first -->');
  assert.equal((await domain.readProject(scope)).revision, edits[0].revision);
});
test('rejectsJunctionEscape without touching an external file', async t => {
  const { domain, directory, project } = await fixture(t);
  const outside = join(directory,'outside');
  await mkdir(outside); await writeFile(join(outside,'shot.html'),'outside');
  await symlink(outside,join(project,'escape'),process.platform==='win32'?'junction':'dir');
  const { revision } = await domain.readProject(scope);
  await assert.rejects(domain.applyEdit(scope,revision,{kind:'replace-file',relativePath:'escape/shot.html',text:'changed'}),/outside|escape|admitted/i);
  assert.equal(await readFile(join(outside,'shot.html'),'utf8'),'outside');
});
test('preview cannot select an outside target or inject browser launch options',async t=>{
  const{domain,directory}=await fixture(t);const outside=join(directory,'outside.html');await writeFile(outside,'<html></html>');
  await assert.rejects(domain.look(scope,{args:[outside,'0']}),/admitted|escape|outside/i);
  await assert.rejects(domain.look(scope,{options:{launch:{args:['--user-data-dir=outside']}}}),/options|preview/i);
});
test('actual scoped preview keeps its image and diagnostic result in the same project', {skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:30000},async t=>{
  const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
  const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-development'}]))});
  const{domain,project}=await fixture(t,runtime);
  await writeFile(join(project,'shot.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white}</style><div>视频预览</div><script>window.film={width:160,height:90,duration:0.2,frame(t){}}</script>');
  const preview=await domain.look(scope,{args:['shot.html','0'],options:{count:1,offline:true}});
  assert.equal(preview.ok,true);assert.ok(Array.isArray(preview.lines));assert.equal(preview.artifacts.length,1);
  assert.match(preview.artifacts[0].relativePath.replaceAll('\\','/'),/^\.film\/cache\/look\//);
  assert.equal((await readFile(join(project,preview.artifacts[0].relativePath))).subarray(1,4).toString(),'PNG');
});

test('actual scoped audio range preview writes its waveform and sheet inside the project', {skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:30000},async t=>{
  const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
  const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-development'}]))});
  const{domain,project}=await fixture(t,runtime);
  const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(4000*Math.sin(i*2*Math.PI*440/8000)),44+2*i);
  await writeFile(join(project,'tone.wav'),wav);
  await writeFile(join(project,'shot.html'),'<!doctype html><style>body{margin:0;background:#fff}</style>视频预览<script>window.film={width:160,height:90,duration:1,frame(t){}}</script>');
  await writeFile(join(project,'film.html'),filmHtml({stage:{w:160,h:90},tracks:[{clips:[{src:'shot.html'}]},{clips:[{src:'tone.wav'}]}]}));
  const preview=await domain.look(scope,{args:['0.1-0.9'],options:{count:2,offline:true}});
  assert.equal(preview.ok,true,preview.lines.join('\n'));assert.equal(preview.artifacts.length,1);
  assert.match(preview.artifacts[0].relativePath.replaceAll('\\','/'),/^\.film\/cache\/look\//);
  assert.equal((await readFile(join(project,preview.artifacts[0].relativePath))).subarray(1,4).toString(),'PNG');
  assert.ok(preview.lines.some(line=>line.includes('tone.wav')));
});
test('preserves explicit history commits instead of making one on every edit', async t => {
  const { domain, project } = await fixture(t);
  const { revision } = await domain.readProject(scope);
  await domain.applyEdit(scope,revision,{kind:'replace-file',relativePath:'film.html',text:initial+'<!-- edit -->'});
  assert.equal(await stat(join(project,'.film','history')).then(()=>true,()=>false),false);
});
test('embedded manual edits reject a stale revision instead of silently rebasing', async t => {
  const { project, workspaceRoot, directory } = await fixture(t);
  await writeFile(join(project,'film.html'),filmHtml({stage:{w:640,h:360},tracks:[]}));
  const before = await readProjectFilm(project);
  await assert.rejects(withStudioContext({workspaceRoot,stateRoot:join(directory,'state'),signal:new AbortController().signal},
    () => editProjectFilm(project,'0000000000000000',[{op:'stage',w:800,h:600}])),/revision|changed|conflict/i);
  assert.equal((await readProjectFilm(project)).rev,before.rev);
});
test('revokesScopeAndDropsLateResult and rejects forged session identities', async t => {
  const { domain, revoke } = await fixture(t);
  await assert.rejects(domain.readProject({...scope,sessionId:'another-session'}),/scope|session|revoked/i);
  revoke();
  await assert.rejects(domain.readProject(scope),/scope|revoked/i);
});
test('isolates state and serves authenticated editor and film on distinct origins', async t => {
  const { domain } = await fixture(t);
  const { editorOrigin, filmOrigin } = await domain.start();
  assert.notEqual(editorOrigin,filmOrigin);
  assert.equal((await fetch(editorOrigin+'/api/projects')).status,401);
  assert.equal((await fetch(filmOrigin+'/')).status,401);
  const response = await fetch(editorOrigin+'/api/health',{headers:{'x-studio-key':'private-test-launch-authorization'}});
  assert.equal(response.status,200);
  assert.equal(response.url.includes('key='),false);
  await domain.close();
  await assert.rejects(domain.readProject(scope),/closed|revoked/i);
});
test('generated film cannot use injected native headers to access the editor API',async t=>{
  const {domain}=await fixture(t);
  const {editorOrigin,filmOrigin}=await domain.start();
  const forged=await fetch(editorOrigin+'/api/projects',{headers:{'x-studio-key':'private-test-launch-authorization',Origin:filmOrigin}});
  assert.equal(forged.status,403);
  const own=await fetch(editorOrigin+'/api/projects',{headers:{'x-studio-key':'private-test-launch-authorization',Origin:editorOrigin}});
  assert.equal(own.status,200);
  const page=await fetch(editorOrigin+'/');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('embedded provider configuration cannot write a second credential or start original model services',async t=>{
  const {domain}=await fixture(t),{editorOrigin}=await domain.start();
  const response=await fetch(editorOrigin+'/api/providers/elevenlabs',{method:'POST',headers:{'x-studio-key':'private-test-launch-authorization','content-type':'application/json'},body:JSON.stringify({key:'never-store-this-key'})});
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'VIDEO_NATIVE_SERVICES_MANAGED');
});
test('native export inspection and cancellation include only the admitted project',async t=>{
  const f=await fixture(t),{editorOrigin}=await f.domain.start();
  const headers={'x-studio-key':'private-test-launch-authorization','content-type':'application/json'};
  const post=async(path,body)=>{const response=await fetch(editorOrigin+path,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
  const own=(await post('/api/projects',{path:f.project})).project,foreign=(await post('/api/projects',{name:'other'})).project;
  const admitted=f.admitProjectId(own.id),out=join(f.directory,'exports');await mkdir(out);
  await f.domain.admitPaths({kind:'export',accountGeneration:scope.accountGeneration,scope:admitted,paths:[out]});
  const ownJob=(await post('/api/projects/'+own.id+'/exports',{jobs:[{kind:'project'}],folder:out})).exports[0];
  const foreignScope=f.admitProjectId(foreign.id);f.useRoot(foreign.path);
  await f.domain.admitPaths({kind:'export',accountGeneration:scope.accountGeneration,scope:foreignScope,paths:[out]});
  const foreignJob=(await post('/api/projects/'+foreign.id+'/exports',{jobs:[{kind:'project'}],folder:out})).exports[0];
  f.useRoot(f.project);f.admitProjectId(own.id);
  let found;
  for(let i=0;i<100;i++){found=(await f.domain.readExports(admitted,ownJob.id)).jobs[0];if(found.status==='done'||found.status==='failed')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(found.status,'done',found.error);assert.ok(found.outputs.length);assert.ok(found.outputs.every(path=>path.startsWith(out)));
  assert.equal((await f.domain.readExports(admitted)).jobs.length,1);
  await assert.rejects(f.domain.readExports(admitted,foreignJob.id),/scope|project|export/i);
  await assert.rejects(f.domain.cancelExport(admitted,foreignJob.id),/scope|project|export/i);
});
