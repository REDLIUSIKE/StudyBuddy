import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withStudioContext} from './context.mjs';
import {nativeSubtitleTranslator} from './native-translation.mjs';
import {translateFilmSubtitles} from '../captions.mjs';
import {filmHtml} from '../../../src/film-doc.mjs';
import {writeTranscript} from '../transcripts.mjs';

async function fixture(t,request){
 const root=await mkdtemp(join(tmpdir(),'native-translation-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'assets'));
 const scope={accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:'s'},context={workspaceRoot:root,stateRoot:join(root,'state'),signal:new AbortController().signal,scopeForRoot:()=>scope,capabilities:{request}};
 await writeFile(join(root,'film.html'),filmHtml({stage:{w:320,h:180},tracks:[{clips:[{id:'voice',src:'assets/voice.wav',time:[0,2]}]}]}));
 await writeFile(join(root,'assets/voice.wav'),'fixture');await writeTranscript(root,'assets/voice.wav',{lines:[{text:'Hello',startMs:0,endMs:1000},{text:'Goodbye',startMs:1000,endMs:2000}]});
 return{root,context};
}
test('the original subtitle translation flow uses native lines and retains their times',async t=>{
 const requests=[],f=await fixture(t,async request=>{requests.push(request);return{data:{lines:['你好','再见']},artifacts:[],receiptRef:request.requestId};});
 await withStudioContext(f.context,async()=>{
  const translate=await nativeSubtitleTranslator(f.root),result=await translateFilmSubtitles(f.root,'zh',{translate});assert.deepEqual(result.translated,['assets/voice.wav']);
  const output=await readFile(join(f.root,'assets/voice.zh.vtt'),'utf8');assert.match(output,/00:00:01\.000/);assert.match(output,/你好/);
  assert.equal(requests[0].operation,'translate');assert.deepEqual(requests[0].input,{language:'zh',lines:['Hello','Goodbye']});
  await translate({src:'assets/voice.wav',language:'zh',lines:['Hello','Goodbye']});assert.equal(requests.length,1);
 });
});
test('an unknown native translation retains its request identity for reconciliation',async t=>{
 const ids=[],f=await fixture(t,async request=>{ids.push(request.requestId);throw Error('VIDEO_TRANSLATION_OUTCOME_UNKNOWN');});
 await withStudioContext(f.context,async()=>{
  const translate=await nativeSubtitleTranslator(f.root),input={src:'assets/voice.wav',language:'de',lines:['Hello','Goodbye']};
  await assert.rejects(translate(input),/OUTCOME_UNKNOWN/);await assert.rejects(translate(input),/OUTCOME_UNKNOWN/);assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
 });
});
test('a manual transcript change during translation is preserved without writing a stale translation',async t=>{
 const f=await fixture(t,async()=>{await writeTranscript(f.root,'assets/voice.wav',{lines:[{text:'New manual words',startMs:0,endMs:2000}]});return{data:{lines:['你好','再见']},artifacts:[]};});
 await withStudioContext(f.context,async()=>{
  const result=await translateFilmSubtitles(f.root,'zh',{translate:await nativeSubtitleTranslator(f.root)});assert.equal(result.translated.length,0);assert.match(result.failed[0].error,/CONFLICT/);
  assert.match(await readFile(join(f.root,'assets/voice.vtt'),'utf8'),/New manual words/);await assert.rejects(readFile(join(f.root,'assets/voice.zh.vtt')),/ENOENT/);
 });
});

test('project revocation cancels its pending translation before any result is retained',async t=>{
 const started=Promise.withResolvers(),global=new AbortController(),project=new AbortController();
 const f=await fixture(t,async(_request,signal)=>{started.resolve();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('PROJECT_CANCELLED')),{once:true}));});
 f.context.signal=global.signal;f.context.projectSignalForRoot=()=>project.signal;
 let outcome;
 try{
  const pending=withStudioContext(f.context,async()=>{const translate=await nativeSubtitleTranslator(f.root);return translate({src:'assets/voice.wav',language:'de',lines:['Hello','Goodbye']});});
  outcome=pending.then(()=> 'unexpected-completion',error=>error.message);await started.promise;project.abort();
  assert.equal(await Promise.race([outcome,new Promise(resolve=>setTimeout(()=>resolve('not-canceled'),100))]),'PROJECT_CANCELLED');
 }finally{global.abort();await outcome;}
});
