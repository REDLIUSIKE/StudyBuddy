import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolveVideoRenderRuntime } from './render-runtime.mjs';
import { withRenderRuntime,videoProgram,videoBrowser } from '../../../src/runtime.mjs';
import { launch } from '../../../src/host.mjs';
import { render } from '../../../src/render.mjs';
import { createExports } from '../exports.mjs';

test('requires exact executable identity and refuses an unreviewed binary', async t => {
  const root = await mkdtemp(join(tmpdir(),'sb-video-runtime-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'browser.exe'),'reviewed-browser');
  await writeFile(join(root,'ffmpeg.exe'),'reviewed-encoder');
  await writeFile(join(root,'ffprobe.exe'),'reviewed-probe');
  const expectedIdentities = Object.fromEntries(['browser','ffmpeg','ffprobe'].map(name=>[name,{
    path:join(root,name+'.exe'),
    sha256:createHash('sha256').update('reviewed-'+({browser:'browser',ffmpeg:'encoder',ffprobe:'probe'}[name])).digest('hex'),
    version:'reviewed-test',
  }]));
  const input = {primaryRuntimeDirectory:root,candidateDirectory:root,expectedIdentities};
  const runtime = await resolveVideoRenderRuntime(input);
  assert.equal(withRenderRuntime(runtime,()=>videoProgram('ffmpeg')),join(root,'ffmpeg.exe'));
  assert.equal(withRenderRuntime(runtime,()=>videoBrowser()),join(root,'browser.exe'));
  await writeFile(join(root,'ffmpeg.exe'),'replaced');
  await assert.rejects(resolveVideoRenderRuntime(input),/identity|digest|changed/i);
});
test('an embedded operation with no runtime fails before falling back to PATH', () => {
  assert.throws(()=>withRenderRuntime(undefined,()=>videoProgram('ffmpeg'),true),/required|verified/i);
});
test('closing exports drains active work, cancels queued work and rejects new work', async t => {
  const root=await mkdtemp(join(tmpdir(),'sb-video-close-'));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
  await writeFile(join(root,'film.html'),'<!doctype html><title>Film</title>');
  const exports=createExports();
  const project={id:'project',name:'Film',path:root};
  exports.start(project,{kind:'project'},{folder:join(root,'out')});
  exports.start(project,{kind:'project'},{folder:join(root,'out')});
  await exports.stopAll();
  assert.equal(exports.busy(),false);
  assert.ok(exports.list('project').every(job=>job.status==='cancelled'));
  assert.throws(()=>exports.start(project,{kind:'project'},{folder:join(root,'out')}),/closing|closed/i);
});
test('real shared renderer preserves MP4/WebM/MOV dimensions, frame timing and alpha', {skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:60000}, async t => {
  const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
  const expectedIdentities=Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'development-reviewed'}]));
  const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities});
  const root=await mkdtemp(join(tmpdir(),'sb-video-render-'));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
  await writeFile(join(root,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:transparent}div{width:80px;height:90px;background:#e03040}</style><div>视频</div><script>window.film={width:160,height:90,duration:0.2,frame(t){document.querySelector("div").style.transform="translateX("+Math.round(t*20)+"px)"}}</script>');
  await withRenderRuntime(runtime,async()=>{
    const browser=await launch();
    t.after(()=>browser.close());
    const page=await browser.newPage();
    await page.goto('file:///'+join(root,'index.html').replaceAll('\\\\','/'));
    await page.evaluate(()=>window.film.frame(0.1));
    const first=await page.screenshot();
    await page.evaluate(()=>window.film.frame(0.1));
    assert.deepEqual(await page.screenshot(),first);
    await browser.close();
    for(const extension of ['mp4','webm','mov']){
      const out=join(root,'output.'+extension);
      await render([root],{out,workers:1,fps:10,alpha:extension!=='mp4',silent:true});
      const metadata=JSON.parse(execFileSync(runtime.ffprobeExecutable,['-v','error','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true}));
      const stream=metadata.streams.find(row=>row.codec_type==='video');
      assert.equal(stream.width,160); assert.equal(stream.height,90); assert.equal(stream.avg_frame_rate,'10/1');
      assert.equal(stream.codec_name,{mp4:'h264',webm:'vp9',mov:'prores'}[extension]);
      if(extension==='mov') assert.match(stream.pix_fmt,/yuva/);
    }
  });
});
test('cancelling a video scope closes its browser and preserves an unrelated browser', {skip:!process.env.STUDYBUDDY_VIDEO_TEST_PINS,timeout:15000},async t=>{
  const pins=JSON.parse(await readFile(process.env.STUDYBUDDY_VIDEO_TEST_PINS,'utf8'));
  const expectedIdentities=Object.fromEntries(pins.components.map(row=>[row.name,{path:row.path,sha256:row.sha256,version:'development-reviewed'}]));
  const runtime=await resolveVideoRenderRuntime({primaryRuntimeDirectory:pins.sharedResourceRoot,candidateDirectory:pins.browserRoot,expectedIdentities});
  const unrelated=await launch();t.after(()=>unrelated.close());
  const abort=new AbortController();
  const owned=await withRenderRuntime(runtime,()=>launch(),true,abort.signal);t.after(()=>owned.close());
  const disconnected=new Promise(resolve=>owned.once('disconnected',()=>resolve(true)));
  abort.abort();
  assert.equal(await Promise.race([disconnected,new Promise(resolve=>setTimeout(()=>resolve(false),1000))]),true);
  assert.equal(unrelated.isConnected(),true);
});
