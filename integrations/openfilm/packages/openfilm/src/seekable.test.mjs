import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filmHtml } from './film-doc.mjs';
import { render } from './render.mjs';
import { seekableCopies, slowSeeking } from './seekable.mjs';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const ffmpeg = { skip: !hasFfmpeg && 'no ffmpeg', timeout: 120_000 };

/** 4 s at 30 fps with a key frame every `gop` frames. */
const clip = (file, gop) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '4',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-pix_fmt', 'yuv420p', file]);
/** A video's frame times, as its packets give them. */
const times = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file]).toString().trim().split('\n').map(Number).sort((a, b) => a - b);

test('a video with key frames far apart gets a copy with the same frames at the same times; one that seeks fast does not', ffmpeg, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-seekable-'));
  try {
    clip(join(dir, 'slow.mp4'), 120);
    clip(join(dir, 'fast.mp4'), 5);
    assert.ok(await slowSeeking(join(dir, 'slow.mp4')), 'a key frame every 4 s');
    assert.equal(await slowSeeking(join(dir, 'fast.mp4')), null, 'six a second');
    const copies = await seekableCopies([join(dir, 'slow.mp4'), join(dir, 'fast.mp4')], dir);
    assert.deepEqual([...copies.keys()], [join(dir, 'slow.mp4')]);
    const copy = /** @type {string} */ (copies.get(join(dir, 'slow.mp4')));
    assert.deepEqual(times(copy), times(join(dir, 'slow.mp4')));
    assert.equal(await slowSeeking(copy), null, 'the copy seeks fast');
    /* kept: the next render finds it */
    const again = await seekableCopies([join(dir, 'slow.mp4')], dir);
    assert.equal(again.get(join(dir, 'slow.mp4')), copy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a render serves the film\'s slow-seeking videos as their copies', ffmpeg, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-seekable-render-'));
  try {
    clip(join(dir, 'a.mp4'), 120);
    writeFileSync(join(dir, 'film.html'), filmHtml({ stage: { w: 320, h: 180 }, tracks: [{ clips: [{ id: 'v', src: 'a.mp4', at: 0, time: [0, 3] }] }] }));
    const done = await render([dir], { out: join(dir, 'out.mp4'), workers: 2, silent: true, onProgress() {} });
    assert.ok(existsSync(done.out));
    assert.equal(readdirSync(join(dir, '.film/cache/seek')).filter((f) => f.endsWith('.mp4') && !f.includes('.part')).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
