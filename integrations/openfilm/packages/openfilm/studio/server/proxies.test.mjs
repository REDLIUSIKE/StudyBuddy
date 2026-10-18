import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureProxies, heavy, proxySize, readyProxy } from './proxies.mjs';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('heavy footage: past 1080p, or not 8-bit H.264, VP8/9 or AV1', () => {
  assert.equal(heavy({ width: 1920, height: 1080, codec: 'h264', pixfmt: 'yuv420p' }), false);
  assert.equal(heavy({ width: 1080, height: 1920, codec: 'h264', pixfmt: 'yuv420p' }), false, 'a phone\'s 1080p, upright');
  assert.equal(heavy({ width: 3840, height: 2160, codec: 'h264', pixfmt: 'yuv420p' }), true);
  assert.equal(heavy({ width: 1920, height: 1080, codec: 'prores', pixfmt: 'yuv422p10le' }), true);
  assert.equal(heavy({ width: 1920, height: 1080, codec: 'hevc', pixfmt: 'yuv420p' }), true);
  assert.equal(heavy({ width: 1920, height: 1080, codec: 'h264', pixfmt: 'yuv420p10le' }), true);
  assert.equal(heavy({ codec: 'mp3' }), false, 'a sound');
});

test('a proxy is its height on the short side, even, the shape kept, never larger than the footage', () => {
  assert.deepEqual(proxySize(3840, 2160, 720), { w: 1280, h: 720 });
  assert.deepEqual(proxySize(2160, 3840, 720), { w: 720, h: 1280 });
  assert.deepEqual(proxySize(4096, 2160, 540), { w: 1024, h: 540 });
  assert.deepEqual(proxySize(1280, 720, 1080), { w: 1280, h: 720 });
});

test('heavy footage gets a proxy in the background, with the same frames at the same times; light footage none', { skip: !hasFfmpeg && 'no ffmpeg' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-proxies-'));
  mkdirSync(join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=2560x1440:rate=25:duration=1', '-pix_fmt', 'yuv420p', join(root, 'assets', 'big.mp4')]);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1', '-pix_fmt', 'yuv420p', join(root, 'assets', 'small.mp4')]);
  const first = await ensureProxies(root, ['assets/big.mp4', 'assets/small.mp4'], 540);
  assert.deepEqual(Object.keys(first), ['assets/big.mp4']);
  assert.ok(['waiting', 'making'].includes(first['assets/big.mp4'].state));
  let states = first;
  for (const end = Date.now() + 30_000; states['assets/big.mp4']?.state !== 'ready' && Date.now() < end;) {
    await new Promise((r) => setTimeout(r, 100));
    states = await ensureProxies(root, ['assets/big.mp4'], 540);
  }
  assert.equal(states['assets/big.mp4'].state, 'ready');
  const proxy = readyProxy(root, 'assets/big.mp4', 540);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,codec_name', '-of', 'json', proxy]).toString()).streams[0];
  assert.deepEqual([info.width, info.height, info.codec_name, Number(info.nb_read_frames)], [960, 540, 'h264', 25]);
  assert.equal(readyProxy(root, 'assets/big.mp4', 720), null, 'another height is another proxy');
});
