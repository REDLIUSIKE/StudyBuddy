import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {fixture,scope,caller} from './capability-fixture.mjs';
import {createCapabilityExportSnapshot} from './capability-export.mjs';
test('snapshots inline SVG textures without treating their namespace or filter as external files',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'title.html'),`<style>.grain{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'></filter><rect filter='url(%23n)'/></svg>")}</style><h1>自由出发</h1>`);
 const snapshot=await createCapabilityExportSnapshot(f.root);assert.ok(snapshot.files.some(row=>row.path==='title.html'));await snapshot.remove();
 await writeFile(join(f.root,'title.html'),'<img src="https://example.invalid/car.jpg">');await assert.rejects(createCapabilityExportSnapshot(f.root),/EXTERNAL_DEPENDENCY/);
});
test('ordinaryCallerEditsAdmittedFilm and manualEditConflicts',async t=>{
 const f=await fixture(t),before=await f.domain.capability(scope,caller,'readFile',{relativePath:'title.html'});
 await writeFile(join(f.root,'title.html'),'Manual');
 assert.equal((await f.domain.capability(scope,caller,'applyEdit',{expectedRevision:before.revision,edit:{kind:'replace-file',relativePath:'title.html',text:'AI'}})).conflict,true);
 assert.equal(await readFile(join(f.root,'title.html'),'utf8'),'Manual');
 const latest=await f.domain.capability(scope,caller,'readFile',{relativePath:'title.html'});
 await f.domain.capability(scope,caller,'applyEdit',{expectedRevision:latest.revision,edit:{kind:'replace-file',relativePath:'title.html',text:'AI'}});
 assert.equal(await readFile(join(f.root,'title.html'),'utf8'),'AI');
});
test('twoCallersKeepOwnUsageIdentity across asynchronous media requests',async t=>{
 const requests=[],f=await fixture(t,async request=>{await new Promise(resolve=>setTimeout(resolve,request.caller.sessionId==='ordinary-session'?15:1));requests.push(request);return{data:{state:'unknown'},artifacts:[]};});
 await Promise.all([caller,{...caller,grantRef:'22222222-2222-4222-8222-222222222222',sessionId:'session-video-other',toolCallId:'call-b'}].map((who,index)=>f.domain.capability(scope,who,'mediaRequest',{operation:'sfx',authorityRef:'exact-authority',requestId:`33333333-3333-4333-8333-33333333333${index}`,input:{native:{prompt:'test'}}})));
 assert.deepEqual(requests.map(row=>[row.caller.sessionId,row.caller.toolCallId]).sort(),[['ordinary-session','call-a'],['session-video-other','call-b']]);
 assert.ok(requests.every(row=>row.scope.sessionId==='editor-root'));
 await assert.rejects(f.domain.capability(scope,{...caller,rootSessionId:'forbidden'},'readProject',{}),/CALLER/);
});
