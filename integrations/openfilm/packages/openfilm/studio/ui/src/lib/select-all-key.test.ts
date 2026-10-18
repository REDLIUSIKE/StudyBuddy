import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSelectAll } from './select-all-key.ts';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => (
  { key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods }
);

test('select all is ⌘A on a Mac and Ctrl+A elsewhere; with Shift or Alt it is another shortcut', () => {
  assert.equal(isSelectAll(key('a', { metaKey: true }), true), true);
  assert.equal(isSelectAll(key('A', { metaKey: true }), true), true);
  assert.equal(isSelectAll(key('a', { ctrlKey: true }), true), false, 'Ctrl+A on a Mac moves the caret');
  assert.equal(isSelectAll(key('a', { ctrlKey: true }), false), true);
  assert.equal(isSelectAll(key('a', { metaKey: true, shiftKey: true }), true), false);
  assert.equal(isSelectAll(key('a', { metaKey: true, altKey: true }), true), false);
  assert.equal(isSelectAll(key('a'), true), false);
});
