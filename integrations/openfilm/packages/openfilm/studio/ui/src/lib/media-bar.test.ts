import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_BUTTON, MIN_FIELD, TYPING_FIELD, barLayout, rest } from './media-bar.ts';

/* about what the English words measure at 12.5px */
const words = { hint: 41, upload: 42 };
/* the width at which Upload keeps its word: the field shows its whole hint beside it */
const wordWidth = 20 + 39 + 42 + 4 * BAR_BUTTON + 5 * 4 + 39 + 41;

test('narrowing, Upload loses its word first, then the field gets shorter, then the search is a button', () => {
  assert.deepEqual(barLayout(500, words, 4, false), { field: true, uploadWord: true, tight: false, cramped: false });
  assert.deepEqual(barLayout(wordWidth, words, 4, false), { field: true, uploadWord: true, tight: false, cramped: false });
  assert.deepEqual(barLayout(wordWidth - 1, words, 4, false), { field: true, uploadWord: false, tight: false, cramped: false });
  /* the field stays down to its icon, its hint cut or gone; too short to type in, it opens over the bar */
  const fieldAt = (room: number) => 20 + BAR_BUTTON + 4 * BAR_BUTTON + 5 * 4 + room;
  assert.equal(rest(fieldAt(MIN_FIELD), false, BAR_BUTTON, 4), MIN_FIELD);
  assert.deepEqual(barLayout(fieldAt(TYPING_FIELD), words, 4, false), { field: true, uploadWord: false, tight: false, cramped: false });
  assert.deepEqual(barLayout(fieldAt(TYPING_FIELD) - 1, words, 4, false), { field: true, uploadWord: false, tight: false, cramped: true });
  assert.deepEqual(barLayout(fieldAt(MIN_FIELD), words, 4, false), { field: true, uploadWord: false, tight: false, cramped: true });
  assert.deepEqual(barLayout(fieldAt(MIN_FIELD) - 1, words, 4, false), { field: false, uploadWord: false, tight: true, cramped: true });
  /* the narrowest pane (200 px): every button whole */
  assert.ok(rest(200, true, BAR_BUTTON, 4) >= BAR_BUTTON);
});

test('a search typed keeps room for its clear button; a close button is one more square', () => {
  assert.equal(barLayout(wordWidth, words, 4, true).uploadWord, false);
  assert.equal(barLayout(wordWidth + 32, words, 5, false).uploadWord, true);
  assert.equal(barLayout(wordWidth + 31, words, 5, false).uploadWord, false);
});
