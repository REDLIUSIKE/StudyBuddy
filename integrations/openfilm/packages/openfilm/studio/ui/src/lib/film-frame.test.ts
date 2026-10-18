import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILM_FRAME_IDS, customFilmFrame, filmFrameBox, frameRatioOf, parseFilmFrame } from './film-frame.ts';

test('every preset is a ratio W:H, cinema ones included', () => {
  for (const id of FILM_FRAME_IDS) if (id !== 'native') assert.ok(frameRatioOf(id), id);
  assert.ok(Math.abs(frameRatioOf('2.39:1')! - 2.39) < 1e-9);
});

test('a custom ratio is kept between 1:4 and 4:1; anything else is not a frame', () => {
  assert.equal(customFilmFrame(2.39, 1), '2.39:1');
  assert.equal(customFilmFrame(5, 4), '5:4');
  assert.equal(customFilmFrame(9, 1), null);
  assert.equal(customFilmFrame(0, 1), null);
  assert.equal(parseFilmFrame('7:5'), '7:5');
  assert.equal(parseFilmFrame('1:9'), 'native');
  assert.equal(parseFilmFrame('wide'), 'native');
});

test('a 16:9 film framed 2.39:1 keeps its height, the frame wider for bars at its sides', () => {
  const box = filmFrameBox({ w: 1920, h: 1080 }, '2.39:1');
  assert.equal(box.h, 1080);
  assert.equal(box.w, 2582);
});

