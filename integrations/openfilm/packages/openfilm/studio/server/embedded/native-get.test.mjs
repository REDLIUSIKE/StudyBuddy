import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext} from './context.mjs';
import {subtitleTranscriber} from './native-get.mjs';
import {parseVtt} from '../transcripts.mjs';
const runtime=process.env.STUDYBUDDY_VIDEO_TEST_FFMPEG&&process.env.STUDYBUDDY_VIDEO_TEST_FFPROBE?{ffmpegExecutable:process.env.STUDYBUDDY_VIDEO_TEST_FFMPEG,ffprobeExecutable:process.env.STUDYBUDDY_VIDEO_TEST_FFPROBE}:null;
async function fixture(t,fault){
 const root=await mkdtemp(join(tmpdir(),'sb-word-subtitles-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'assets'));
 const src='assets/声音 with spaces.wav',audio=Buffer.alloc(44+3*32000);
 audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(3*32000,40);
 await writeFile(join(root,src),audio);
 const controller=new AbortController(),scope={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:'s1'},requests=[];
 const current={workspaceRoot:root,stateRoot:root,signal:controller.signal,scopeForRoot:value=>value===root?scope:undefined,renderRuntime:runtime,capabilities:{request:async(request)=>{
  assert.deepEqual(request.scope,scope);
  if(request.operation==='catalog')return{data:[{operation:'asr',modelId:'asr-exact',authorityRef:'native-asr',parameters:{maxDurationSeconds:2,maxFileBytes:50000000,formats:['wav'],responseFormats:['json','verbose_json'],timestampLevels:['word']}}],artifacts:[]};
  assert.equal(request.operation,'asr');assert.equal(request.authorityRef,'native-asr');
  assert.match(request.input.native.audioPath,/^\.film\/studybuddy-speech\/[a-f0-9-]{36}\.wav$/);
  const bytes=await readFile(join(root,request.input.native.audioPath));assert.equal(bytes.length,request.input.native.bytes);
  requests.push(request);
  const first=requests.length===1,segments=first?[{id:0,text:'你',start:0.1,end:0.5,speaker:'S1'},{id:1,text:'好',start:1.4,end:1.7,speaker:'S1'}]:[{id:0,text:'呀',start:0.1,end:0.6,speaker:'S1'}];
  if(fault==='manual')await writeFile(join(root,'assets/声音 with spaces.vtt'),'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n手动修改\n');
  if(fault==='revoke')controller.abort();
  return{data:{requestId:request.requestId,modelId:'asr-exact',state:'completed',text:first?'你好':'呀',duration:first?2:1,nSpeakers:1,segments:fault==='missing'?[]:segments},artifacts:[],receiptRef:request.requestId};
 }}};
 const run=()=>withStudioContext(current,async()=>{const transcribe=await subtitleTranscriber();return transcribe(root,src,controller.signal);});
 return{root,src,requests,run};
}
test('original subtitles use real chunk offsets and word times, and reuse finished chunks', {skip:!runtime},async t=>{
 const f=await fixture(t);await f.run();
 const body=await readFile(join(f.root,'assets/声音 with spaces.vtt'),'utf8'),parsed=parseVtt(body);
 assert.match(body,/<00:00:01\.400>/);assert.ok(parsed.lines.some(line=>line.startMs===2100));
 assert.equal(f.requests.length,2);await f.run();assert.equal(f.requests.length,2);
 assert.equal((await readdir(join(f.root,'.film/studybuddy-speech'))).filter(name=>name.endsWith('.wav')).length,0);
});
test('missing word timings never become evenly divided fabricated subtitles',{skip:!runtime},async t=>{
 const f=await fixture(t,'missing');await assert.rejects(f.run(),/TIMESTAMP|SPEECH_RESPONSE/);
 await assert.rejects(readFile(join(f.root,'assets/声音 with spaces.vtt')),/ENOENT/);
});
test('manual subtitles and revoked scopes are preserved while transcription is in flight',{skip:!runtime},async t=>{
 const f=await fixture(t,'manual');await assert.rejects(f.run(),/CONFLICT/);
 assert.match(await readFile(join(f.root,'assets/声音 with spaces.vtt'),'utf8'),/手动修改/);
 const revoked=await fixture(t,'revoke');await assert.rejects(revoked.run(),/abort|REVOKED/i);
 await assert.rejects(readFile(join(revoked.root,'assets/声音 with spaces.vtt')),/ENOENT/);
});
