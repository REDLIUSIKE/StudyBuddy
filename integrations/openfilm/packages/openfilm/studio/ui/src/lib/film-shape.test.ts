import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filmShape, spanShows, type ClipSpan } from './film-shape.ts';
import { layoutTracks } from './timeline-layout.ts';
import type { FilmDoc } from './film.ts';

/* a clip that plays to its file's end says no length in film.html: the timeline draws it from the file's probed length
   until the preview places it (a split's second half, a drop), so it shows at once */

const doc = (clips: Record<string, unknown>[]) => ({ stage: { w: 1920, h: 1080 }, tracks: [{ clips }] }) as unknown as FilmDoc;
const blocks = (film: FilmDoc, spans: ClipSpan[], media = new Map<string, { audio?: boolean; duration?: number }>()) =>
  layoutTracks(filmShape(film, spans, media)).flatMap((row) => row.blocks.map((b) => [b.clipId, b.startMs, b.endMs, b.sourceDurMs ?? null]));

test('a clip to the end of its file, not placed by the preview yet, is drawn from the file\'s probed length', () => {
  /* ⌘B at 5 s in a clip of a 10 s file: its first half is placed, its second half not yet */
  const film = doc([
    { src: 'assets/a.mp4', id: 'a', time: [2, 5] },
    { src: 'assets/a.mp4', id: 'a-2', at: 3, time: [5] },
    { src: 'assets/a.mp4', id: 'slow', at: 8, speed: 0.5 },
  ]);
  const spans: ClipSpan[] = [{ id: 'a', src: 'assets/a.mp4', at: 0, end: 3, native: 10 }];
  assert.deepEqual(blocks(film, spans), [['a', 0, 3000, 10_000]], 'without a probe the second half waits for the preview');
  const media = new Map([['assets/a.mp4', { audio: false, duration: 10 }]]);
  assert.deepEqual(blocks(film, spans, media), [
    ['a', 0, 3000, 10_000],
    ['a-2', 3000, 8000, 10_000],
    ['slow', 8000, 28_000, 10_000],
  ]);
});

test('where the preview placed a clip, its span stands; a still keeps the length film.html gives it', () => {
  const film = doc([
    { src: 'assets/a.mp4', id: 'a' },
    { src: 'assets/logo.png', id: 'logo', at: 9, time: [0, 2] },
  ]);
  const media = new Map([['assets/a.mp4', { duration: 10 }], ['assets/logo.png', { duration: 40 }]]);
  const spans: ClipSpan[] = [{ id: 'a', src: 'assets/a.mp4', at: 0, end: 9, native: 9 }];
  assert.deepEqual(blocks(film, spans, media).map((b) => b.slice(0, 3)), [['a', 0, 9000], ['logo', 9000, 11_000]]);
});

/* a layer selected on the picture lets go once the playhead leaves its clip (components/FilmStageSelect) */
test('a clip shows from its start up to, not including, its end', () => {
  const span = { at: 2, end: 6 };
  assert.equal(spanShows(span, 1990), false);
  assert.equal(spanShows(span, 2000), true);
  assert.equal(spanShows(span, 5999), true);
  assert.equal(spanShows(span, 6100), false);
  assert.equal(spanShows(span, 5160), true);
});
