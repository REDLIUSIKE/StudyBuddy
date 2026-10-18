import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doubleClickAim, keepPress, type Press } from './double-press.ts';

const press = (x: number, at: number): Press => ({ x, y: 0, at });

test('a double-click is aimed by its first press, even where the picture moved before the second', () => {
  const presses = [press(100, 1000), press(140, 1150)];
  assert.deepEqual(doubleClickAim(presses, 1160), press(100, 1000));
});

test('a click elsewhere just before a double-click does not aim it', () => {
  let presses: Press[] = [];
  presses = keepPress(presses, press(10, 1000));
  presses = keepPress(presses, press(300, 1180));
  presses = keepPress(presses, press(300, 1260));
  assert.equal(presses.length, 2);
  assert.deepEqual(doubleClickAim(presses, 1270), press(300, 1180));
});

test('presses too far apart, or long before, are not a double-click', () => {
  assert.equal(doubleClickAim([press(100, 1000), press(100, 1600)], 1610), null);
  assert.equal(doubleClickAim([press(100, 1000), press(100, 1100)], 1700), null);
  assert.equal(doubleClickAim([press(100, 1000)], 1010), null);
  assert.equal(doubleClickAim([], 1010), null);
});
