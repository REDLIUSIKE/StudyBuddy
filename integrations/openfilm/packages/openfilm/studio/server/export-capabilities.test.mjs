import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportCapabilities } from './exports.mjs';

/* a file of its own: what this machine encodes is kept for the whole process once ffmpeg answers */
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('an ffmpeg that arrives after Studio started is found: having none is not remembered', { skip: !hasFfmpeg && 'no ffmpeg' }, async () => {
  const path = process.env.PATH;
  const empty = mkdtempSync(join(tmpdir(), 'of-no-ffmpeg-'));
  try {
    process.env.PATH = empty;
    assert.ok(!Object.values(await exportCapabilities()).some(Boolean), 'nothing without ffmpeg');
  } finally {
    process.env.PATH = path;
    rmSync(empty, { recursive: true, force: true });
  }
  assert.ok(Object.values(await exportCapabilities()).some(Boolean), 'the encoders of the ffmpeg now on the PATH');
});
