import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { hideChildWindows, withWindowsHide } from './hidden-windows.mjs';

test('every way to call child_process gets windowsHide, unless it says otherwise', () => {
  const cb = () => {};
  assert.deepEqual(withWindowsHide(['claude']), ['claude', { windowsHide: true }]);
  assert.deepEqual(withWindowsHide(['claude', ['auth', 'status']]), ['claude', ['auth', 'status'], { windowsHide: true }]);
  assert.deepEqual(withWindowsHide(['claude', ['auth'], { timeout: 5 }]), ['claude', ['auth'], { windowsHide: true, timeout: 5 }]);
  assert.deepEqual(withWindowsHide(['claude', ['auth'], cb]), ['claude', ['auth'], { windowsHide: true }, cb]);
  assert.deepEqual(withWindowsHide(['codex app-server', { shell: true }]), ['codex app-server', { windowsHide: true, shell: true }]);
  assert.deepEqual(withWindowsHide(['dir', cb]), ['dir', { windowsHide: true }, cb]);
  assert.deepEqual(withWindowsHide(['x', { windowsHide: false }]), ['x', { windowsHide: false }], 'a window asked for is kept');
});

test('once hidden, the functions still work as before: promisify(execFile) still gives stdout and stderr', async () => {
  hideChildWindows(childProcess);
  hideChildWindows(childProcess);
  assert.equal(childProcess.execFile.hidesWindows, true);
  const { execFile, spawnSync } = await import('node:child_process');
  assert.equal(execFile, childProcess.execFile, 'an ES import sees the hidden one');
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err")']);
  assert.deepEqual([stdout, stderr], ['out', 'err']);
  assert.equal(spawnSync(process.execPath, ['-e', 'process.exit(3)']).status, 3);
});
