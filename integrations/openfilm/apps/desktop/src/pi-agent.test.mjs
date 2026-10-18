import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSession } from './agents.mjs';

/** A service on the Chat Completions API that answers "ok" and notes the model each request named (and each request). */
async function service() {
  const asked = [];
  const bodies = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const { model } = JSON.parse(body || '{}');
      asked.push(model);
      bodies.push(JSON.parse(body || '{}'));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (choice, extra = {}) => `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [choice], ...extra })}\n\n`;
      res.end(chunk({ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null })
        + chunk({ index: 0, delta: {}, finish_reason: 'stop' }, { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
        + 'data: [DONE]\n\n');
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { asked, bodies, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
}

test('the own key\'s agent offers its models as the session\'s model option, and a turn after a switch goes to that model', { timeout: 60_000 }, async () => {
  const svc = await service();
  const session = new AgentSession({
    agent: 'byok',
    cwd: mkdtempSync(join(tmpdir(), 'of-pi-')),
    harness: {
      home: mkdtempSync(join(tmpdir(), 'of-pi-home-')),
      provider: { id: 'byok', api: 'openai-completions', baseUrl: svc.url, apiKeyEnv: 'OPENFILM_BYOK_KEY' },
      model: 'vision', models: ['vision', 'big'],
      env: { OPENFILM_BYOK_KEY: 'sk-test' },
    },
  });
  try {
    const info = await session.start();
    const option = info.configOptions.find((o) => o.id === 'model');
    assert.equal(option.category, 'model');
    assert.equal(option.currentValue, 'vision', 'the first model to begin with');
    assert.deepEqual(option.options.map((o) => o.value), ['vision', 'big']);
    await session.prompt([{ type: 'text', text: 'hi' }]);
    const switched = await session.setConfigOption('model', 'big');
    assert.equal(switched.configOptions[0].currentValue, 'big');
    await session.prompt([{ type: 'text', text: 'again' }]);
    assert.deepEqual(svc.asked, ['vision', 'big']);
    await assert.rejects(session.setConfigOption('model', 'other'), 'a model the key does not name is refused');
  } finally {
    session.close();
    svc.close();
  }
});

test('a model\'s efforts are the session\'s effort option: Auto sends no reasoning setting, a level sends that level', { timeout: 60_000 }, async () => {
  const svc = await service();
  const session = new AgentSession({
    agent: 'byok',
    cwd: mkdtempSync(join(tmpdir(), 'of-pi-')),
    harness: {
      home: mkdtempSync(join(tmpdir(), 'of-pi-home-')),
      provider: { id: 'byok', api: 'openai-completions', baseUrl: svc.url, apiKeyEnv: 'OPENFILM_BYOK_KEY' },
      model: 'thinker', models: ['thinker', 'plain'],
      efforts: { thinker: { levels: ['auto', 'off', 'low', 'high'], effort: 'low' } },
      env: { OPENFILM_BYOK_KEY: 'sk-test' },
    },
  });
  const effortOf = (options) => options.find((o) => o.id === 'effort');
  try {
    const info = await session.start();
    const effort = effortOf(info.configOptions);
    assert.equal(effort.category, 'thought_level');
    assert.deepEqual(effort.options.map((o) => o.value), ['auto', 'off', 'low', 'high'], 'only the efforts it was given');
    assert.equal(effort.currentValue, 'low', 'the one it starts on');
    await session.prompt([{ type: 'text', text: 'one' }]);
    assert.equal(svc.bodies.at(-1).reasoning_effort, 'low');

    await session.setConfigOption('effort', 'high');
    await session.prompt([{ type: 'text', text: 'two' }]);
    assert.equal(svc.bodies.at(-1).reasoning_effort, 'high');

    await session.setConfigOption('effort', 'auto');
    await session.prompt([{ type: 'text', text: 'three' }]);
    assert.equal(svc.bodies.at(-1).reasoning_effort, undefined, 'Auto: nothing about reasoning');
    await assert.rejects(session.setConfigOption('effort', 'max'), 'an effort it was not given is refused');

    /* a model given no efforts offers none, and is asked with none */
    const plain = await session.setConfigOption('model', 'plain');
    assert.equal(effortOf(plain.configOptions), undefined);
    await session.prompt([{ type: 'text', text: 'four' }]);
    assert.equal(svc.bodies.at(-1).model, 'plain');
    assert.equal(svc.bodies.at(-1).reasoning_effort, undefined);
  } finally {
    session.close();
    svc.close();
  }
});
