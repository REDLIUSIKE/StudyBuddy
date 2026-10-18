import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overridesToken } from './thumb-frame.ts';

test('a page clip\'s overrides give its thumbnails a token: none without a layer\'s, another for another change', () => {
  assert.equal(overridesToken(undefined), '');
  assert.equal(overridesToken([]), '');
  assert.equal(overridesToken([{ fade: [0.5, 0.5] }]), '', 'its fades alone change no picture');
  const moved = overridesToken([{ at: '#title', t: [10, 0] }]);
  assert.ok(moved);
  assert.equal(overridesToken([{ at: '#title', t: [10, 0] }]), moved, 'the same changes, the same token');
  assert.notEqual(overridesToken([{ at: '#title', t: [20, 0] }]), moved);
  assert.notEqual(overridesToken([{ at: '#title', t: [10, 0], style: { fontSize: '90px' } }]), moved);
});
