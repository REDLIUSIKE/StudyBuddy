import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FilmDoc } from './film.ts';
import { pageMayHave, similarClasses, similarEdits } from './similar-layers.ts';

const doc = (tracks: unknown): FilmDoc => ({ stage: { w: 1920, h: 1080 }, tracks } as unknown as FilmDoc);

test('the classes of a selector, each a whole name in a page\'s source', () => {
  assert.deepEqual(similarClasses('h2.title.big'), ['title', 'big']);
  assert.deepEqual(similarClasses('p.a\\:b'), ['a:b']);
  assert.equal(pageMayHave('<h2 class="title big">Shanghai</h2>', 'h2.title.big'), true);
  assert.equal(pageMayHave('<h2 class="subtitle big">', 'h2.title.big'), false, 'subtitle is not title');
  assert.equal(pageMayHave("el.className = 'title'; el.classList.add('big')", 'h2.title.big'), true, 'classes made in code are named there');
  assert.equal(pageMayHave('<h2>', 'h2'), false, 'no class, nothing to go by');
  assert.equal(pageMayHave('<style>.title { color: red }</style><p class="note">My title</p>', 'h2.title'), false, 'a rule or a word is not a layer');
});

test('the style goes to every page clip that may have layers like it, the picked one\'s always, the rest untouched', () => {
  const film = doc([
    { clips: [
      { src: 'hook.html', overrides: [{ at: 'body > h2.title', t: [10, 0] }] },
      { src: 'weights.html' },
      { src: 'assets/clip.mp4' },
    ] },
    { clips: [{ src: 'ending.html', overrides: [{ at: 'h2.title', style: { color: '#fff' } }] }] },
  ]);
  const pages: Record<string, string> = { 'hook.html': '<h2 class="title">', 'weights.html': '<p>no titles</p>', 'ending.html': '<h2 class="title">' };
  const edits = similarEdits(film, 'h2.title', { color: '#ffd447', fontSize: 64 }, (src) => pageMayHave(pages[src] ?? '', 'h2.title'), 'film.html#1.0');
  assert.deepEqual(edits.map((e) => e.loc), ['film.html#0.0', 'film.html#1.0']);
  /* its own tweak stays; the look for all like it goes after it */
  assert.deepEqual(edits[0]!.value, [{ at: 'body > h2.title', t: [10, 0] }, { at: 'h2.title', style: { color: '#ffd447', fontSize: 64 } }]);
  /* one already for all like it: changed, not doubled */
  assert.deepEqual(edits[1]!.value, [{ at: 'h2.title', style: { color: '#ffd447', fontSize: 64 } }]);
});
