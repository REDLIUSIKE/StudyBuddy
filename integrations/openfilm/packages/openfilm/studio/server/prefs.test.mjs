import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prefsOf, writePrefs } from './prefs.mjs';

test('the version whose notes were last shown: a version, else none', () => {
  assert.equal(prefsOf(null).seenVersion, null, 'a new install has none');
  assert.equal(prefsOf({ seenVersion: '0.1.6' }).seenVersion, '0.1.6');
  assert.equal(prefsOf({ seenVersion: '1.0.0-beta.2' }).seenVersion, '1.0.0-beta.2');
  assert.equal(prefsOf({ seenVersion: '../../etc' }).seenVersion, null);
  assert.equal(prefsOf({ seenVersion: 7 }).seenVersion, null);
  assert.deepEqual(prefsOf({ seenVersion: '0.1.6' }).proxies, { on: true, height: 720 }, 'the rest as before');
});

test('what a newer OpenFilm keeps in prefs.json stays when this one writes it', () => {
  const home = mkdtempSync(join(tmpdir(), 'of-prefs-'));
  const was = process.env.OPENFILM_HOME;
  process.env.OPENFILM_HOME = home;
  try {
    writeFileSync(join(home, 'prefs.json'), JSON.stringify({ proxies: { on: true, height: 720, codec: 'h265' }, seenVersion: null, theme: 'dark' }));
    writePrefs({ proxies: { on: false } });
    const written = JSON.parse(readFileSync(join(home, 'prefs.json'), 'utf8'));
    assert.equal(written.theme, 'dark');
    assert.equal(written.proxies.codec, 'h265');
    assert.equal(written.proxies.on, false);
  } finally {
    if (was === undefined) delete process.env.OPENFILM_HOME; else process.env.OPENFILM_HOME = was;
  }
});
