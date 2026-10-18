import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fetchFfmpeg, ffmpegIn } from './ffmpeg-runtime.mjs';

/** A response whose body comes in one piece. */
const answer = (bytes) => new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), { headers: { 'content-length': String(bytes.length) } });

test('a build whose checksum is not the pinned one is not kept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-ffmpeg-'));
  const fetch = async () => answer(gzipSync(Buffer.from('not ffmpeg')));
  await assert.rejects(fetchFfmpeg(dir, { platform: 'darwin', arch: 'arm64', fetch }), /did not match its checksum/);
  assert.equal(ffmpegIn(dir, 'darwin'), false);
});

test('no build for a platform says so', async () => {
  await assert.rejects(fetchFfmpeg(mkdtempSync(join(tmpdir(), 'of-ffmpeg-')), { platform: 'linux', arch: 'x64' }), /no ffmpeg to download for linux-x64/);
});

test('a download that fails is tried again, three times in all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-ffmpeg-'));
  const asked = [];
  const fetch = async (url) => { asked.push(url.split('/').pop()); throw new TypeError('fetch failed'); };
  await assert.rejects(fetchFfmpeg(dir, { platform: 'win32', arch: 'x64', fetch }), /fetch failed/);
  assert.deepEqual(asked.filter((n) => n === 'ffmpeg-win32-x64.gz').length, 3);
});

test('a download that stops coming is stopped and tried again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-ffmpeg-'));
  let tries = 0;
  const fetch = async (url, { signal }) => {
    if (url.endsWith('ffmpeg-darwin-x64.gz')) tries++;
    /* fetch ends a body whose request is aborted with an error */
    return new Response(new ReadableStream({ start(c) { signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); } }));
  };
  await assert.rejects(fetchFfmpeg(dir, { platform: 'darwin', arch: 'x64', fetch, stallMs: 50 }), /stalled/);
  assert.equal(tries, 3);
});

test('the installer\'s copy has the build\'s license, its readme and where its source is', async () => {
  /* the programs themselves are the pinned builds: a stand-in with the pinned checksum is not to be had, so this
     checks the license files only, with the programs already there */
  const dir = mkdtempSync(join(tmpdir(), 'of-ffmpeg-'));
  writeFileSync(join(dir, 'ffmpeg.exe'), '');
  writeFileSync(join(dir, 'ffprobe.exe'), '');
  const fetch = async (url) => answer(Buffer.from(`text of ${url.split('/').pop()}`));
  await fetchFfmpeg(dir, { platform: 'win32', arch: 'x64', license: true, fetch });
  assert.equal(readFileSync(join(dir, 'LICENSE'), 'utf8'), 'text of win32-x64.LICENSE');
  assert.equal(readFileSync(join(dir, 'README'), 'utf8'), 'text of win32-x64.README');
  assert.match(readFileSync(join(dir, 'SOURCE'), 'utf8'), /^FFmpeg 6\.1\.1,[^]*ffmpeg-6\.1\.1\.tar\.xz/);
});
