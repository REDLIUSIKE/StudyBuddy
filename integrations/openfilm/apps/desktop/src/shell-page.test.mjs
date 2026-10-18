import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../shell/index.html', import.meta.url), 'utf8');

test('the chat\'s column and its layer are Studio\'s host panel and take focus, so its keys stay in the chat', () => {
  for (const id of ['of-chat', 'of-chat-layer']) {
    const tag = new RegExp(`<div id="${id}"[^>]*>`).exec(page)?.[0] ?? '';
    assert.match(tag, /\sdata-studio-host-panel[\s>]/, `${id} is the host panel`);
    assert.match(tag, /\stabindex="-1"/, `${id} takes focus when clicked`);
  }
});
