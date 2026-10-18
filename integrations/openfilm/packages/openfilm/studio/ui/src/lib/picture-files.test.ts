import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changesPicture } from './picture-files.ts';

test('a page, its styles and code, or a clip\'s own media changes the picture; notes, scripts and other media do not', () => {
  const used = new Set(['assets/video/a.mp4']);
  assert.equal(changesPicture(['mg/title.html'], used), true);
  assert.equal(changesPicture(['shared/style.css', 'notes.md'], used), true);
  assert.equal(changesPicture(['data/points.json'], used), true);
  assert.equal(changesPicture(['assets/video/a.mp4'], used), true);
  assert.equal(changesPicture(['assets/video/b.mp4'], used), false);
  assert.equal(changesPicture(['script.md', 'tools/make_voice.py', 'render.log', 'run.sh'], used), false);
  assert.equal(changesPicture(undefined, used), true);
});
