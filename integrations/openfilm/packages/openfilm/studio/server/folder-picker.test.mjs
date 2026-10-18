import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelled, filePickerCommand, folderPickerCommand, startFolder } from './folder-picker.mjs';

test('macOS: the words and the folder are arguments of the script, never inside it', () => {
  const c = folderPickerCommand('darwin', { title: 'Save "here" end tell', at: '/Volumes/Films' });
  assert.equal(c.cmd, 'osascript');
  assert.deepEqual(c.args.slice(-2), ['Save "here" end tell', '/Volumes/Films']);
  assert.ok(c.args.filter((a, i) => c.args[i - 1] === '-e').every((line) => !line.includes('here')));
});

test('a starting folder that is not a full path is left out', () => {
  assert.equal(folderPickerCommand('darwin', { title: 'T', at: 'Desktop' }).args.at(-1), '');
  assert.equal(folderPickerCommand('win32', { title: 'T', at: 'Desktop' }).env.OPENFILM_PICK_AT, '');
});

test('Windows: PowerShell reads the words from its environment', () => {
  const c = folderPickerCommand('win32', { title: "it's mine", at: 'D:\\Films' });
  assert.equal(c.cmd, 'powershell.exe');
  assert.equal(c.env.OPENFILM_PICK_TITLE, "it's mine");
  assert.ok(!c.args.join(' ').includes("it's mine"));
});

test('Linux: zenity, else kdialog, else none', () => {
  assert.equal(folderPickerCommand('linux', { title: 'T', at: '/srv/films' }, (n) => n === 'zenity').cmd, 'zenity');
  assert.equal(folderPickerCommand('linux', { title: 'T' }, (n) => n === 'kdialog').cmd, 'kdialog');
  assert.equal(folderPickerCommand('linux', { title: 'T' }, () => false), null);
});

test('files: several at once, a path a line; the words are arguments, never inside the script', () => {
  const mac = filePickerCommand('darwin', { title: 'Link "media" end tell', at: '/Volumes/NAS' });
  assert.deepEqual(mac.args.slice(-2), ['Link "media" end tell', '/Volumes/NAS']);
  assert.ok(mac.args.some((a) => a.includes('multiple selections allowed')));
  assert.ok(mac.args.filter((a, i) => mac.args[i - 1] === '-e').every((line) => !line.includes('media')));
  const win = filePickerCommand('win32', { title: "it's mine" });
  assert.equal(win.env.OPENFILM_PICK_TITLE, "it's mine");
  assert.match(win.args.at(-1), /Multiselect = \$true/);
  assert.ok(filePickerCommand('linux', { title: 'T' }, (n) => n === 'zenity').args.includes('--multiple'));
  assert.equal(filePickerCommand('linux', { title: 'T' }, () => false), null);
});

test('macOS: Finder opens the dialog, in front, and the app that was in front comes back', () => {
  for (const c of [folderPickerCommand('darwin', { title: 'T' }), filePickerCommand('darwin', { title: 'T' })]) {
    const lines = c.args.filter((a, i) => c.args[i - 1] === '-e');
    assert.ok(lines.indexOf('tell application "Finder"') < lines.indexOf('activate'));
    assert.equal(lines.filter((l) => l === 'tell application frontApp to activate').length, 2, 'after a pick and after a cancel');
  }
});

test('only a real cancel is a cancel: osascript failing (Finder not allowed) is an error the page answers', () => {
  const fail = (/** @type {number} */ code, /** @type {string} */ message) => Object.assign(new Error(message), { code });
  assert.equal(cancelled('osascript', null), true);
  assert.equal(cancelled('osascript', fail(1, 'execution error: User canceled. (-128)')), true);
  assert.equal(cancelled('osascript', fail(1, 'execution error: Not authorized to send Apple events to Finder. (-1743)')), false);
  assert.equal(cancelled('zenity', fail(1, '')), true);
  assert.equal(cancelled('kdialog', fail(2, 'crashed')), false);
});

test('a dialog starts in the folder asked, or the nearest one above it that is there', () => {
  const there = new Set(['/', '/Films', '/Films/Cut']);
  const exists = (/** @type {string} */ p) => there.has(p);
  assert.equal(startFolder('/Films/Cut', exists), '/Films/Cut');
  assert.equal(startFolder('/Films/Cut/exports/not yet', exists), '/Films/Cut');
  assert.equal(startFolder('relative/path', exists), null);
  assert.equal(startFolder(null, exists), null);
});

test('macOS: the starting folder is made before Finder is asked, and one that is gone opens none', () => {
  const lines = folderPickerCommand('darwin', { title: 'T', at: '/Films' }).args.filter((a, i, all) => all[i - 1] === '-e');
  assert.ok(lines.indexOf('set startAt to (POSIX file (item 2 of argv)) as alias') < lines.indexOf('tell application "Finder"'));
  assert.ok(!lines.some((l) => l.includes('default location (POSIX file')), 'Finder never makes a path a folder itself');
});
