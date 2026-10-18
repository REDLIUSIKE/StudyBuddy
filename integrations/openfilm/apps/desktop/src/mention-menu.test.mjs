import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSlashTrigger } from '../chat/src/components/prompt-editor/mention-menu.ts';

test("a `/` at the start of the message opens the agent's commands; anywhere else it is only a slash", () => {
  assert.deepEqual(matchSlashTrigger('/'), { leadOffset: 0, query: '', replaceableString: '/' });
  assert.deepEqual(matchSlashTrigger('  /comp'), { leadOffset: 2, query: 'comp', replaceableString: '/comp' });
  assert.equal(matchSlashTrigger('/compact now'), null, 'a space ends the command');
  assert.equal(matchSlashTrigger('make it 1/2'), null);
  assert.equal(matchSlashTrigger('assets/'), null);
  assert.equal(matchSlashTrigger('//'), null);
});
