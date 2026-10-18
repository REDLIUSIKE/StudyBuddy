import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext} from './context.mjs';
import {runGet,subtitleTranscriber} from './native-get.mjs';
import {transcribeNativeSpeech} from './native-speech.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,fault){
 const root=await mkdtemp(join(tmpdir(),'sb-native-tts-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'assets'));await mkdir(join(root,'.film/studybuddy-media'),{recursive:true});
 const src='assets/voice.wav',audio=Buffer.from('RIFF fixture'),controller=new AbortController(),scope={accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:'s'};
 const id='88888888-8888-4888-8888-888888888888',artifact={relativePath:src,mime:'audio/wav',sha256:hash(audio)};
 const timing={durationMs:2300,words:[{token:'你好',startMs:124,endMs:812},{token:'世界',startMs:1341,endMs:2197}]};
 let calls=0;
 const current={workspaceRoot:root,stateRoot:join(root,'state'),signal:controller.signal,scopeForRoot:()=>scope,capabilities:{request:async request=>{
  calls++;assert.equal(request.operation,'tts');await writeFile(join(root,src),audio);
  const details={wordTimestampsStatus:fault==='missing'?'unavailable':'available',...(fault==='missing'?{}:{timing})};
  await writeFile(join(root,'.film/studybuddy-media',id+'.json'),JSON.stringify({schemaVersion:1,state:'ready',requestId:id,contextHash:'a'.repeat(64),inputHash:'b'.repeat(64),artifact,bytes:audio.length,stagedRelativePath:null,details}));
  if(fault==='manual')await writeFile(join(root,'assets/voice.vtt'),'WEBVTT\n\n00:00:00.100 --> 00:00:02.000\n手动字幕\n');
  if(fault==='cancel')controller.abort();
  return{data:{requestId:id,modelId:'exact-native',state:'completed',...details},artifacts:[artifact],receiptRef:id};
 }}};
 const run=()=>withStudioContext(current,async()=>JSON.parse(await runGet(root,'tts',{authorityRef:'approved',requestId:id,input:{native:{prompt:fault==='unaligned'?'不同的文本':'你好世界'}}})));
 return{root,src,current,run,calls:()=>calls};
}
test('native TTS lands original VTT using actual word milliseconds and preserves manual text',async t=>{
 const f=await fixture(t),result=await f.run(),vtt=await readFile(join(f.root,'assets/voice.vtt'),'utf8');
 assert.match(vtt,/00:00:00\.124/);assert.match(vtt,/<00:00:01\.341>/);assert.equal(result.data.subtitlesStatus,'created');assert.equal(result.artifacts.length,2);
 const manual=await fixture(t,'manual'),preserved=await manual.run();assert.equal(preserved.data.subtitlesStatus,'preserved');assert.match(await readFile(join(manual.root,'assets/voice.vtt'),'utf8'),/手动字幕/);
 await withStudioContext(manual.current,()=>transcribeNativeSpeech(manual.root,manual.src));assert.equal(manual.calls(),1);
});
test('missing or unaligned word timing keeps audio and blocks automatic paid ASR repair',async t=>{
 for(const fault of ['missing','unaligned']){
  const f=await fixture(t,fault),result=await f.run();assert.equal(result.data.subtitlesStatus,'unavailable');assert.equal(result.artifacts.length,1);
  await assert.rejects(readFile(join(f.root,'assets/voice.vtt')),/ENOENT/);
  await assert.rejects(withStudioContext(f.current,()=>transcribeNativeSpeech(f.root,f.src)),/VIDEO_TTS_SUBTITLES_UNAVAILABLE/);assert.equal(f.calls(),1);
 }
});
test('revoking TTS project scope cannot publish a late VTT',async t=>{
 const f=await fixture(t,'cancel');await assert.rejects(f.run(),/abort|REVOKED/i);await assert.rejects(readFile(join(f.root,'assets/voice.vtt')),/ENOENT/);
});
test('original manual subtitle action can explicitly request ASR for generated speech',async t=>{
 const f=await fixture(t,'missing');await f.run();let catalogs=0;
 f.current.capabilities.request=async request=>{assert.equal(request.operation,'catalog');catalogs++;return{data:[],artifacts:[]};};
 await assert.rejects(withStudioContext(f.current,async()=>{const transcribe=await subtitleTranscriber();return transcribe(f.root,f.src);}),/^Error: VIDEO_WORD_TIMESTAMPS_UNAVAILABLE$/);
 assert.equal(catalogs,1);
});
