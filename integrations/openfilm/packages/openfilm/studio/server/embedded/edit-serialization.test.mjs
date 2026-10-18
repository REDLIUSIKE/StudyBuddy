import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext,withStudioEdit} from './context.mjs';
import {writeSourceSubtitles,restoreSourceFiles} from '../subtitle-edits.mjs';
import {commitChanges,restoreCommit,checkout} from '../history.mjs';
import {vttOf} from '../transcripts.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'sb-shared-edit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'assets'));await writeFile(join(root,'assets/voice.wav'),'fixture');
 await writeFile(join(root,'assets/voice.vtt'),vttOf([{text:'Original',startMs:0,endMs:1000}]));
 const film='<!doctype html><meta name="viewport" content="width=640, height=360"><section><iframe src="title.html" at="0" time="0-3"></iframe></section>';
 await writeFile(join(root,'film.html'),film);await writeFile(join(root,'title.html'),'First title');
 return{root,context:{workspaceRoot:root,stateRoot:join(root,'state'),signal:new AbortController().signal}};
}

// A model edit has already read its expected revision and pauses before writing. Manual changes must wait.
async function duringModelEdit(f,manual,inspect,delay){
 await withStudioContext(f.context,async()=>{
  const gate=Promise.withResolvers(),entered=Promise.withResolvers();let settled=false;
  const model=withStudioEdit(f.root,async()=>{entered.resolve();await gate.promise;});await entered.promise;
  const change=manual().finally(()=>{settled=true;});const observed=change.then(()=>null,error=>error);
  try{await Promise.race([observed,new Promise(resolve=>setTimeout(resolve,delay))]);assert.equal(settled,false,'manual change ran inside the model revision/write transaction');await inspect();}
  finally{gate.resolve();await model;await observed;}
  await change;
 });
}

test('manual subtitle writes wait for the model revision/write transaction',async t=>{
 const f=await fixture(t),before=await readFile(join(f.root,'assets/voice.vtt'),'utf8');
 await duringModelEdit(f,()=>writeSourceSubtitles(f.root,'assets/voice.wav',[{text:'Manual edit',startMs:0,endMs:1000}]),async()=>assert.equal(await readFile(join(f.root,'assets/voice.vtt'),'utf8'),before),100);
 assert.match(await readFile(join(f.root,'assets/voice.vtt'),'utf8'),/Manual edit/);
});

test('manual subtitle undo checks and writes its snapshot inside the shared transaction',async t=>{
 const f=await fixture(t),before=await readFile(join(f.root,'assets/voice.vtt'),'utf8');
 const saved=await writeSourceSubtitles(f.root,'assets/voice.wav',[{text:'Manual edit',startMs:0,endMs:1000}]);
 await duringModelEdit(f,()=>restoreSourceFiles(f.root,'assets/voice.wav',saved.after,saved.before),async()=>assert.match(await readFile(join(f.root,'assets/voice.vtt'),'utf8'),/Manual edit/),100);
 assert.equal(await readFile(join(f.root,'assets/voice.vtt'),'utf8'),before);
});

for(const action of ['restore','checkout'])test(`history ${action} waits for the model revision/write transaction`,async t=>{
 const f=await fixture(t),first=await commitChanges(f.root,'First title');
 await writeFile(join(f.root,'title.html'),'Second title');await commitChanges(f.root,'Second title');
 await duringModelEdit(f,()=>action==='restore'?restoreCommit(f.root,first):checkout(f.root,{target:'first-version',create:true,from:first}),async()=>assert.equal(await readFile(join(f.root,'title.html'),'utf8'),'Second title'),1000);
 assert.equal(await readFile(join(f.root,'title.html'),'utf8'),'First title');
});
