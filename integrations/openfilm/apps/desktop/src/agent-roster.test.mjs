import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoster, probeRequest, readChoices } from './agent-roster.mjs';

const roster = (dataDir, fetch, extra = {}) => createRoster({
  dataDir,
  localAgents: async () => [],
  openSignIn: async () => ({ ok: true }),
  closeSessions: () => {},
  seal: (text) => Buffer.from(`sealed:${text}`),
  unseal: (data) => data.toString().replace(/^sealed:/, ''),
  onChange: () => {},
  fetch,
  ...extra,
});

test('each API format is asked in its own shape, with a picture', () => {
  const r = probeRequest('responses', 'https://api.openai.com/v1/', 'k', 'm');
  assert.equal(r.url, 'https://api.openai.com/v1/responses');
  assert.equal(r.body.input[0].content[1].type, 'input_image');
  const c = probeRequest('chat', 'https://api.deepseek.com/v1', 'k', 'm');
  assert.equal(c.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(c.body.messages[0].content[1].type, 'image_url');
  const a = probeRequest('anthropic', 'https://api.anthropic.com', 'k', 'm');
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.headers['x-api-key'], 'k');
  assert.equal(a.body.messages[0].content[0].type, 'image');
});

test('a key is kept only once the service took it with a picture; a model that cannot read one is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  let answer = { status: 400, body: { error: { message: 'This model does not support image input.' } } };
  const fetch = async () => new Response(JSON.stringify(answer.body), { status: answer.status });
  const r = roster(dir, fetch);
  const refused = await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1', model: 'text-only', key: 'sk-1234' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'no-images');
  assert.equal(readChoices(dir).byok, null, 'nothing kept');
  answer = { status: 401, body: {} };
  assert.match((await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1', model: 'm', key: 'bad' })).error, /did not accept/);
  answer = { status: 200, body: { choices: [] } };
  assert.deepEqual(await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1/', model: 'vision', key: 'sk-good-9876' }), { ok: true });
  assert.deepEqual(readChoices(dir).byok, { format: 'chat', baseUrl: 'https://api.deepseek.com/v1', model: 'vision', models: ['vision'], efforts: { vision: { levels: ['auto'], effort: 'auto' } }, last4: '9876' });
  assert.equal(readChoices(dir).shown.byok, true, 'set up: shown in the chat');
  assert.equal(readFileSync(join(dir, 'byok.key'), 'utf8'), 'sealed:sk-good-9876', 'the key sealed');
  assert.equal(JSON.stringify(readChoices(dir)).includes('sk-good'), false, 'never in the choices file');
});

test('each format is Pi\'s provider on that API, the key in its own variable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  const ok = async () => new Response('{}', { status: 200 });
  const r = roster(dir, ok);
  await r.configureByok({ format: 'responses', baseUrl: '', model: 'gpt-x', key: 'sk-a' });
  let h = r.harness('byok');
  assert.deepEqual(h.provider, { id: 'byok', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENFILM_BYOK_KEY' }, 'the official address when none is given');
  assert.equal(h.model, 'gpt-x');
  assert.deepEqual(h.env, { OPENFILM_BYOK_KEY: 'sk-a' });
  assert.equal(h.home, join(dir, 'agents', 'byok', 'pi'), 'its own folder, never the person\'s ~/.pi');

  await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1', model: 'ds', key: '' });
  h = r.harness('byok');
  assert.equal(h.provider.api, 'openai-completions');
  assert.equal(h.provider.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(h.env.OPENFILM_BYOK_KEY, 'sk-a', 'an empty key keeps the one kept');

  await r.configureByok({ format: 'anthropic', baseUrl: '', model: 'claude-x', key: 'sk-ant' });
  h = r.harness('byok');
  assert.equal(h.provider.api, 'anthropic-messages');
  assert.equal(h.provider.baseUrl, 'https://api.anthropic.com');
  assert.equal(h.model, 'claude-x');
});

test('a key may name several models: each is asked with a picture, the first is the one a session starts on', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  const asked = [];
  const fetch = async (_url, init) => {
    const { model } = JSON.parse(init.body);
    asked.push(model);
    return model === 'text-only'
      ? new Response(JSON.stringify({ error: { message: 'This model does not support image input.' } }), { status: 400 })
      : new Response('{}', { status: 200 });
  };
  const r = roster(dir, fetch);
  const refused = await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1', models: 'vision, text-only', key: 'sk-1234' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /^text-only: /, 'says which model');
  assert.equal(readChoices(dir).byok, null, 'nothing kept');
  asked.length = 0;
  assert.deepEqual(await r.configureByok({ format: 'chat', baseUrl: 'https://api.deepseek.com/v1', models: 'vision\n big , vision,', key: 'sk-1234' }), { ok: true });
  assert.deepEqual(asked.sort(), ['big', 'vision']);
  assert.deepEqual(readChoices(dir).byok.models, ['vision', 'big'], 'trimmed, each once, in order');
  const h = r.harness('byok');
  assert.equal(h.model, 'vision');
  assert.deepEqual(h.models, ['vision', 'big']);
  assert.deepEqual(r.list().find((a) => a.id === 'byok').byok.models, ['vision', 'big']);
});

test('each model keeps the efforts the person gave it and the one it starts on; one given none offers Auto alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  const r = roster(dir, async () => new Response('{}', { status: 200 }));
  assert.deepEqual(await r.configureByok({ format: 'responses', models: ['gpt-a', 'mine'], key: 'sk-1234',
    efforts: { 'gpt-a': { levels: ['high', 'auto', 'medium', 'turbo'], effort: 'medium' }, mine: { levels: [], effort: 'high' }, gone: { levels: ['max'] } } }), { ok: true });
  const efforts = { 'gpt-a': { levels: ['auto', 'medium', 'high'], effort: 'medium' }, mine: { levels: ['auto'], effort: 'auto' } };
  assert.deepEqual(readChoices(dir).byok.efforts, efforts, 'known efforts in order; nothing for a model not named');
  assert.deepEqual(r.harness('byok').efforts, efforts);
  assert.deepEqual(r.list().find((a) => a.id === 'byok').byok.efforts, efforts);
});

test('a key kept with one model, before there could be several, reads as that one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  writeFileSync(join(dir, 'agents.json'), JSON.stringify({ byok: { format: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', last4: 'abcd' } }));
  assert.deepEqual(readChoices(dir).byok, { format: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', models: ['gpt-x'], efforts: { 'gpt-x': { levels: ['auto'], effort: 'auto' } }, last4: 'abcd' });
});

test("Codex and Claude Code are shown in the chat from the start, the person's other agents once connected or switched on", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  const found = (id, cli) => ({ id, cli, signedIn: true, install: 'https://example.test', setupRequired: null });
  const r = roster(dir, undefined, { localAgents: async () => [found('codex', null), found('claude', null), found('gemini', { path: '/bin/gemini' }), found('kimi', null)] });
  const list = await r.refresh();
  const of = (id) => list.find((a) => a.id === id);
  assert.equal(of('codex').shown, true, 'not installed, still shown');
  assert.equal(of('gemini').status, 'ready');
  assert.equal(of('gemini').shown, false, 'installed, not chosen yet');
  assert.equal(of('kimi').status, 'missing');
  await r.connect('gemini');
  assert.equal(r.list().find((a) => a.id === 'gemini').shown, true, 'connected: chosen');
  r.setShown('kimi', true);
  assert.equal(readChoices(dir).shown.kimi, true);
});

test('an agent not found can be pointed at: the program is tried first, kept, and used until found automatically again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  let picked = null;
  let check = { ok: true };
  const used = [];
  const asked = [];
  const r = roster(dir, undefined, {
    localAgents: async () => [{ id: 'codex', cli: null, signedIn: null, install: 'https://developers.openai.com/codex', setupRequired: null }],
    pickProgram: async (id, words) => { asked.push([id, words]); return picked; },
    checkProgram: async () => check,
    usePaths: (paths) => used.push(paths),
  });
  assert.deepEqual(used, [{}], 'told at once what was kept');
  await r.refresh();
  assert.deepEqual(await r.locate('codex', { title: 'Choose the Codex program' }), { ok: false }, 'cancelled: nothing said, nothing kept');
  assert.deepEqual(asked, [['codex', { title: 'Choose the Codex program' }]]);
  picked = 'C:\\tools\\notes.txt';
  check = { ok: false, error: '', code: 'not-a-program' };
  assert.deepEqual(await r.locate('codex'), { ok: false, error: '', code: 'not-a-program' });
  assert.deepEqual(readChoices(dir).paths, {}, 'a program that does not start is not kept');
  picked = 'C:\\tools\\codex.exe';
  check = { ok: true, version: 'codex-cli 1.0.0' };
  assert.deepEqual(await r.locate('codex'), { ok: true });
  assert.deepEqual(readChoices(dir).paths, { codex: 'C:\\tools\\codex.exe' });
  assert.deepEqual(used.at(-1), { codex: 'C:\\tools\\codex.exe' });
  assert.equal(r.list().find((a) => a.id === 'codex').chosen, 'C:\\tools\\codex.exe');
  assert.deepEqual(await r.useAutomatic('codex'), { ok: true });
  assert.deepEqual(readChoices(dir).paths, {});
  assert.deepEqual(used.at(-1), {});
  assert.deepEqual(await r.locate('byok'), { ok: false, error: 'No agent byok' }, 'only the person\'s own programs');
});

test('a kept path for something that is not one of the agents is dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  writeFileSync(join(dir, 'agents.json'), JSON.stringify({ paths: { codex: '/opt/codex', byok: '/x', nope: '/y', claude: 3 } }));
  assert.deepEqual(readChoices(dir).paths, { codex: '/opt/codex' });
});

test('disconnecting only stops OpenFilm using an agent; connecting again uses the account signed in then', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  let account = { method: 'claude.ai', email: 'a@b.test' };
  const closed = [];
  const r = roster(dir, undefined, {
    localAgents: async () => [{ id: 'claude', cli: { path: '/bin/claude' }, signedIn: true, account, install: null, setupRequired: null }],
    closeSessions: (id) => closed.push(id),
  });
  await r.refresh();
  assert.equal(r.list().find((a) => a.id === 'claude').status, 'off', 'Claude Code waits for the person to connect it');
  assert.deepEqual(await r.connect('claude'), { ok: true });
  assert.deepEqual(r.list().find((a) => a.id === 'claude').account, { method: 'claude.ai', email: 'a@b.test' });
  r.disconnect('claude');
  assert.equal(r.list().find((a) => a.id === 'claude').status, 'off');
  /* the account switched in Claude Code itself */
  account = { method: 'claude.ai', email: 'c@d.test' };
  assert.deepEqual(await r.connect('claude'), { ok: true });
  const claude = r.list().find((a) => a.id === 'claude');
  assert.equal(claude.status, 'ready');
  assert.equal(claude.account.email, 'c@d.test');
  assert.deepEqual(closed, ['claude', 'claude', 'claude'], 'its sessions closed each time: none goes on with the old account');
});

test('Codex is connected from the start, Claude Code once the person connects it; a choice kept stays as it is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-roster-'));
  assert.deepEqual(readChoices(dir).disconnected, ['claude']);
  writeFileSync(join(dir, 'agents.json'), JSON.stringify({ disconnected: [] }));
  assert.deepEqual(readChoices(dir).disconnected, [], 'connected before: still connected');
});
