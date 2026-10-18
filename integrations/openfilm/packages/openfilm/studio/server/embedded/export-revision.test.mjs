import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,stat,mkdir,symlink} from 'node:fs/promises';import {join} from 'node:path';
import {fixture,scope,caller} from './capability-fixture.mjs';import {createCapabilityExportSnapshot} from './capability-export.mjs';
import {createExports} from '../exports.mjs';
import {resolveVideoRenderRuntime} from './render-runtime.mjs';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
test('exportPinsProducingRevision and copies complete local dependencies',async t=>{
 const f=await fixture(t),snapshot=await createCapabilityExportSnapshot(f.root);
 try{await writeFile(join(f.root,'title.html'),'newer manual edit');assert.equal(await readFile(join(snapshot.root,'title.html'),'utf8'),'<p>汽车</p>');assert.match(snapshot.revision,/^[a-f0-9]{64}$/);assert.equal(snapshot.files.length,2);}finally{await snapshot.remove();}
});
test('unsnapshotable dependencies fail before queuing an export',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'title.html'),'<img src="missing.png">');await assert.rejects(createCapabilityExportSnapshot(f.root),/SNAPSHOT/);
});
test('snapshot staging refuses a junction out of the project and preserves foreign files',async t=>{
 const f=await fixture(t),outside=join(f.directory,'outside');await mkdir(outside);await writeFile(join(outside,'keep.txt'),'keep');await mkdir(join(f.root,'.film/cache'),{recursive:true});await symlink(outside,join(f.root,'.film/cache/capability-export'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(createCapabilityExportSnapshot(f.root),/escape|SNAPSHOT/i);assert.equal(await readFile(join(outside,'keep.txt'),'utf8'),'keep');
});
test('cancelled queued exports release their isolated snapshot',async t=>{
 const f=await fixture(t),first=await createCapabilityExportSnapshot(f.root),second=await createCapabilityExportSnapshot(f.root),queue=createExports();
 queue.start({id:'film-a',name:'Car',path:f.root},{kind:'project'},{folder:join(f.directory,'exports'),snapshot:first});
 const job=queue.start({id:'film-a',name:'Car',path:f.root},{kind:'project'},{folder:join(f.directory,'exports'),snapshot:second});
 queue.cancel(job.id);await queue.stopAll();await assert.rejects(stat(second.root),{code:'ENOENT'});
});
test('snapshot export renders and FFmpeg decodes the producing revision',async t=>{
 if(!process.env.STUDYBUDDY_VIDEO_TEST_PINS){t.skip('reviewed render pins required');return;}
 const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
 const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities:Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'reviewed-fixture'}]))});
 const f=await fixture(t,undefined,runtime);
 await writeFile(join(f.root,'title.html'),'<body style="margin:0;background:red"><script>window.film={width:160,height:90,duration:1,frame(t){}}</script>');
 const started=await f.domain.capability(scope,caller,'createExport',{kind:'video',fps:10,shortEdge:180});
 await writeFile(join(f.root,'film.html'),'newer manual draft');let job;
 for(let count=0;count<200;count++){job=(await f.domain.readExports(scope,started.jobId)).jobs[0];if(['done','failed','cancelled'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(job.status,'done',job.error);assert.equal(job.producingRevision,started.producingRevision);assert.equal(job.originSessionId,caller.sessionId);assert.equal(job.outputs.length,1);
 const run=promisify(execFile);await run(runtime.ffmpegExecutable,['-v','error','-i',job.outputs[0],'-f','null','-'],{windowsHide:true});
 const probe=JSON.parse((await run(runtime.ffprobeExecutable,['-v','error','-show_entries','format=duration','-of','json',job.outputs[0]],{windowsHide:true})).stdout);assert.ok(Number(probe.format.duration)>=0.9);
});
