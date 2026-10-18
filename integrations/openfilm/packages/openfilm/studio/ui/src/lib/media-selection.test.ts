import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxBetween, boxHits, boxPick, moveTargets, pickItem } from './media-selection.ts';

const order = ['assets/a', 'assets/b.png', 'assets/c.mp4', 'assets/d.pdf', 'scenes/e.html'];
const plain = { toggle: false, range: false };

test('a click picks one; ⌘ adds or takes away; ⇧ picks the run from the last one clicked', () => {
  assert.deepEqual(pickItem(['assets/b.png', 'assets/c.mp4'], 'assets/d.pdf', order, 'assets/b.png', plain), ['assets/d.pdf']);
  assert.deepEqual(pickItem(['assets/b.png'], 'assets/d.pdf', order, 'assets/b.png', { toggle: true, range: false }), ['assets/b.png', 'assets/d.pdf']);
  assert.deepEqual(pickItem(['assets/b.png', 'assets/d.pdf'], 'assets/b.png', order, 'assets/d.pdf', { toggle: true, range: false }), ['assets/d.pdf']);
  /* either way from the anchor; with ⌘ too, the run is added to what was picked */
  assert.deepEqual(pickItem(['assets/d.pdf'], 'assets/b.png', order, 'assets/d.pdf', { toggle: false, range: true }), ['assets/b.png', 'assets/c.mp4', 'assets/d.pdf']);
  assert.deepEqual(pickItem(['assets/a'], 'assets/d.pdf', order, 'assets/c.mp4', { toggle: true, range: true }), ['assets/a', 'assets/c.mp4', 'assets/d.pdf']);
  /* no anchor shown (it was in another folder): ⇧ picks just that one */
  assert.deepEqual(pickItem([], 'assets/c.mp4', order, 'assets/x', { toggle: false, range: true }), ['assets/c.mp4']);
});

test('a dragged box picks what it touches, whichever way it was dragged; with ⌘ or ⇧, on top of what was picked', () => {
  const tile = (key: string, left: number, top: number) => ({ key, box: { left, top, right: left + 100, bottom: top + 80 } });
  const items = [tile('a', 0, 0), tile('b', 110, 0), tile('c', 0, 90), tile('d', 110, 90)];
  const box = boxBetween({ x: 150, y: 120 }, { x: 50, y: 40 });
  assert.deepEqual(box, { left: 50, top: 40, right: 150, bottom: 120 });
  assert.deepEqual(boxHits(items, box), ['a', 'b', 'c', 'd']);
  /* touching an edge is not touching */
  assert.deepEqual(boxHits(items, { left: 100, top: 0, right: 110, bottom: 200 }), []);
  assert.deepEqual(boxHits(items, boxBetween({ x: 120, y: 85 }, { x: 300, y: 300 })), ['d']);
  assert.deepEqual(boxPick(['a'], ['d'], false), ['d']);
  assert.deepEqual(boxPick(['a', 'd'], ['d', 'c'], true), ['a', 'd', 'c']);
});

test('things can move to the top or any folder, never into a folder being moved or one inside it', () => {
  const folders = ['footage/b-roll', 'footage', 'music', 'footage10', 'footage2'];
  assert.deepEqual(moveTargets(folders, []), ['', 'footage', 'footage/b-roll', 'footage2', 'footage10', 'music']);
  assert.deepEqual(moveTargets(folders, ['footage']), ['', 'footage2', 'footage10', 'music']);
});
