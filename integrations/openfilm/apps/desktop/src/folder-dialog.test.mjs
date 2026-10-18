import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderDialogOptions, programDialogOptions } from './folder-dialog.mjs';

test('with no options the dialog opens a project', () => {
  const o = folderDialogOptions(undefined);
  assert.equal(o.title, 'Open Project');
  assert.equal(o.buttonLabel, 'Open');
  assert.equal(o.defaultPath, undefined);
  assert.deepEqual(o.properties, ['openDirectory', 'createDirectory']);
});

test("Studio's words and starting folder are used", () => {
  const o = folderDialogOptions({ title: 'Export to', button: 'Choose', at: '/Users/me/Movies' });
  assert.equal(o.title, 'Export to');
  assert.equal(o.message, 'Export to');
  assert.equal(o.buttonLabel, 'Choose');
  assert.equal(o.defaultPath, '/Users/me/Movies');
});

test('a starting folder that is not a full path, and text that is not text, are left out', () => {
  const o = folderDialogOptions({ title: 42, button: '  ', at: 'Movies' });
  assert.equal(o.title, 'Open Project');
  assert.equal(o.buttonLabel, 'Open');
  assert.equal(o.defaultPath, undefined);
});

test("an agent's program: Studio's words; on Windows only programs and shims are offered", () => {
  const win = programDialogOptions({ title: 'Choose the Codex program', button: 'Use this' }, 'win32');
  assert.equal(win.title, 'Choose the Codex program');
  assert.equal(win.buttonLabel, 'Use this');
  assert.deepEqual(win.filters?.[0].extensions, ['exe', 'cmd', 'bat', 'ps1', 'js']);
  assert.ok(win.properties?.includes('openFile'));
  assert.equal(programDialogOptions(null, 'darwin').filters, undefined, 'on a Mac an app can be chosen too');
});
