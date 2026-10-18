import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attrsOf, groupsOf, pasteAttrs, type AttrClip, type AttrGroup } from './clip-attrs.ts';

const ALL = new Set<AttrGroup>(['place', 'blend', 'volume', 'fade']);
const video = (id: string, more: Partial<AttrClip> = {}): AttrClip => ({ id, src: `${id}.mp4`, ...more } as AttrClip);

test('a clip\'s attributes: its place, its blending, its volume and its fades', () => {
  const red = video('red', { box: { x: 10, y: 20, w: 960, h: 540, r: 5 }, style: 'opacity: 0.5; mix-blend-mode: screen; border-radius: 8px', volume: 0.4, overrides: [{ fade: [0.5, 1] }] as never });
  const attrs = attrsOf(red);
  assert.deepEqual(attrs.place, { x: 10, y: 20, w: 960, h: 540, r: 5 });
  assert.deepEqual(attrs.blend, { opacity: '0.5', mode: 'screen' });
  assert.equal(attrs.volume, 0.4);
  assert.deepEqual(attrs.fade, [0.5, 1]);
  assert.deepEqual(groupsOf(attrs), ['place', 'blend', 'volume', 'fade']);
  assert.deepEqual(groupsOf(attrsOf({ id: 'bed', src: 'bed.wav' } as AttrClip)), ['volume', 'fade'], 'a sound has no picture');
});

test('pasted: the ticked groups, onto clips that can take them; the rest of a style stays; a fade fits the clip', () => {
  const attrs = attrsOf(video('red', { box: { x: 10, y: 20, w: 960, h: 540 }, style: 'opacity: 0.5', volume: 0.4, overrides: [{ fade: [2, 2] }] as never }));
  const blue = { loc: 'film.html#0.2', clip: video('blue', { style: 'filter: blur(2px)' }), lengthS: 6 };
  const bed = { loc: 'film.html#1.0', clip: { id: 'bed', src: 'bed.wav' } as AttrClip, lengthS: 3 };
  assert.deepEqual(pasteAttrs(attrs, ALL, [blue, bed]), [
    { loc: 'film.html#0.2', prop: 'box', value: { x: 10, y: 20, w: 960, h: 540 } },
    { loc: 'film.html#0.2', prop: 'style', value: 'filter: blur(2px); opacity: 0.5' },
    { loc: 'film.html#0.2', prop: 'volume', value: 0.4 },
    { loc: 'film.html#0.2', prop: 'fade', value: [2, 2] },
    { loc: 'film.html#1.0', prop: 'volume', value: 0.4 },
    { loc: 'film.html#1.0', prop: 'fade', value: [1.5, 1.5] },
  ]);
  /* only the place ticked; the clip copied from is left alone */
  assert.deepEqual(pasteAttrs(attrs, new Set(['place']), [blue, { loc: 'film.html#0.0', clip: video('red'), lengthS: 6 }]), [
    { loc: 'film.html#0.2', prop: 'box', value: { x: 10, y: 20, w: 960, h: 540 } },
  ]);
  /* a clip with no place of its own copied: the target's goes too (it is back to its default) */
  assert.deepEqual(pasteAttrs(attrsOf(video('plain')), new Set(['place']), [blue]), [{ loc: 'film.html#0.2', prop: 'box', value: null }]);
});
