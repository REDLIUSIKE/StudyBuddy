import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THINKING, contextUsed, effortOption, modelEfforts, modelOption, modelsJson, outOfBalance, stopReason, toolCall, toolContent } from './pi-config.mjs';

test('the person\'s own key is one provider in Pi\'s models.json, with the one model they named', () => {
  const p = modelsJson({ id: 'byok', api: 'openai-completions', baseUrl: 'https://api.deepseek.com/v1', apiKeyEnv: 'K' }, 'vision').providers.byok;
  assert.equal(p.apiKey, '$K', 'the key from its variable, never written down');
  assert.equal(p.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(p.api, 'openai-completions');
  const [model] = p.models;
  assert.equal(p.models.length, 1);
  assert.equal(model.id, 'vision');
  assert.deepEqual(model.input, ['text', 'image']);
  assert.equal(model.contextWindow, 128_000, 'a length when the service gives none');
  assert.equal(model.reasoning, false);
});

test('several models are each one of the provider\'s, and the chat\'s menu reads them as the model option', () => {
  const p = modelsJson({ id: 'byok', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'K' }, ['gpt-a', 'gpt-b']).providers.byok;
  assert.deepEqual(p.models.map((m) => m.id), ['gpt-a', 'gpt-b']);
  assert.deepEqual(modelOption(['gpt-a', 'gpt-b'], 'gpt-b'), {
    id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'gpt-b',
    options: [{ value: 'gpt-a', name: 'gpt-a' }, { value: 'gpt-b', name: 'gpt-b' }],
  });
});

test('what Pi does reads in the chat as Codex\'s did: a command\'s kind and title, a file\'s path, the result\'s text and pictures', () => {
  assert.deepEqual(toolCall('bash', { command: 'openfilm look' }), { kind: 'execute', title: 'openfilm look', rawInput: { command: 'openfilm look' } });
  assert.deepEqual(toolCall('read', { path: 'film.html' }), { kind: 'read', title: 'Read film.html', rawInput: { path: 'film.html' } });
  assert.equal(toolCall('write', { path: 'a.html' }).kind, 'edit');
  assert.deepEqual(toolContent({ content: [{ type: 'text', text: 'ok' }, { type: 'image', data: 'AA', mimeType: 'image/png' }] }), [
    { type: 'content', content: { type: 'text', text: 'ok' } },
    { type: 'content', content: { type: 'image', data: 'AA', mimeType: 'image/png' } },
  ]);
  assert.equal(stopReason({ stopReason: 'toolUse' }), 'end_turn');
  assert.equal(stopReason({ stopReason: 'aborted' }), 'cancelled');
  assert.throws(() => stopReason({ stopReason: 'error', errorMessage: '400 bad' }), /400 bad/);
  assert.deepEqual(contextUsed({ usage: { input: 100, cacheRead: 900, cacheWrite: 0, output: 50 } }, { contextWindow: 10_000 }), { used: 1050, size: 10_000 });
});

test('no balance left, as each service says it, is one outcome with the service\'s own page; a rate limit or another error is not', () => {
  const own = (baseUrl) => ({ id: 'byok', baseUrl });
  const balance = (provider, message) => outOfBalance(provider, new Error(message))?.balance ?? null;
  assert.deepEqual(balance(own('https://api.openai.com/v1'), '429 You exceeded your current quota, please check your plan and billing details. (insufficient_quota)'),
    { provider: 'OpenAI', url: 'https://platform.openai.com/settings/organization/billing' });
  assert.deepEqual(balance(own('https://api.anthropic.com/v1'), '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
    { provider: 'Anthropic', url: 'https://console.anthropic.com/settings/billing' });
  assert.deepEqual(balance(own('https://openrouter.ai/api/v1'), '402 This request requires more credits, or fewer max_tokens.'), { provider: 'OpenRouter', url: 'https://openrouter.ai/settings/credits' });
  assert.deepEqual(balance(own('https://llm.example.com:8443/v1'), '402 Payment Required'), { provider: 'llm.example.com:8443', url: null }, 'a service not known here: named, no page');
  /* the reason can come as the error's data (ACP's internal error) */
  assert.equal(outOfBalance(own('https://api.deepseek.com/v1'), { message: 'Internal error', data: { details: '402 Insufficient Balance' } })?.code, 'balance');
  assert.equal(balance(own('https://api.openai.com/v1'), '429 Rate limit reached for gpt-6 in organization org-1 on tokens per min'), null);
  assert.equal(balance(own('https://api.anthropic.com/v1'), '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), null);
  assert.equal(balance(own('https://api.openai.com/v1'), 'Internal error: 401 key revoked'), null);
  assert.equal(outOfBalance(own('https://api.deepseek.com/v1'), new Error('402 Payment Required')).message,
    "DeepSeek doesn't have enough balance for this. Top it up there, or switch to another service, then try again.");
});

test('the service twice: as itself (no reasoning setting) and thinking, each model told only the levels it was given', () => {
  const efforts = modelEfforts({ a: { levels: ['auto', 'off', 'low', 'max'], effort: 'low' } }, ['a', 'b']);
  assert.deepEqual(efforts.b, { levels: ['auto'], effort: 'auto' });
  const json = modelsJson({ id: 'byok', api: 'openai-responses', baseUrl: 'https://x/v1', apiKeyEnv: 'K' }, ['a', 'b'], efforts);
  assert.deepEqual(json.providers.byok.models.map((m) => [m.id, m.reasoning]), [['a', false], ['b', false]]);
  const thinking = json.providers[THINKING('byok')].models;
  assert.deepEqual(thinking.map((m) => m.id), ['a'], 'only a model given levels thinks');
  assert.deepEqual(thinking[0].thinkingLevelMap, { off: 'none', minimal: null, low: 'low', medium: null, high: null, xhigh: null, max: 'max' });
  /* Anthropic's API is told off as off */
  const claude = modelsJson({ id: 'byok', api: 'anthropic-messages', baseUrl: 'https://x', apiKeyEnv: 'K' }, ['a'], efforts);
  assert.equal(claude.providers[THINKING('byok')].models[0].thinkingLevelMap.off, 'off');
  /* nobody thinks: no thinking service */
  assert.equal(modelsJson({ id: 'byok', api: 'openai-responses', baseUrl: 'https://x/v1', apiKeyEnv: 'K' }, ['b'], efforts).providers[THINKING('byok')], undefined);
});

test('the effort option: for a model offering more than one, its levels named', () => {
  assert.equal(effortOption(['auto'], 'auto'), null);
  assert.deepEqual(effortOption(['auto', 'xhigh'], 'xhigh'), { id: 'effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'xhigh',
    options: [{ value: 'auto', name: 'Auto' }, { value: 'xhigh', name: 'Extra high' }] });
});
