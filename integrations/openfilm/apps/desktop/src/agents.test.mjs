import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_CAPABILITIES, agentShell, allowOption, codexDeveloperInstructions, legacyOptions, powerShellScript, readAgentStatus } from './agents.mjs';

test('an agent that asks: yes for good where it offers that, else yes this once; nothing to say yes with is null', () => {
  const options = [
    { optionId: 'no', kind: 'reject_once' },
    { optionId: 'once', kind: 'allow_once' },
    { optionId: 'always', kind: 'allow_always' },
  ];
  assert.equal(allowOption({ options }), 'always');
  assert.equal(allowOption({ options: options.slice(0, 2) }), 'once');
  assert.equal(allowOption({ options: options.slice(0, 1) }), null);
  assert.equal(allowOption({}), null);
});

test("the older model and mode lists (Gemini CLI's) read as the config options the chat's menu has", () => {
  const options = legacyOptions({
    models: { currentModelId: 'auto', availableModels: [{ modelId: 'auto', name: 'Auto' }, { modelId: 'pro', name: 'Pro', description: 'slow' }] },
    modes: { currentModeId: 'yolo', availableModes: [{ id: 'default', name: 'Default' }, { id: 'yolo', name: 'YOLO' }] },
  });
  assert.deepEqual(options.map((o) => [o.id, o.category, o.currentValue]), [['model', 'model', 'auto'], ['mode', 'mode', 'yolo']]);
  assert.deepEqual(options[0].options[1], { value: 'pro', name: 'Pro', description: 'slow' });
  assert.deepEqual(legacyOptions({}), []);
});

test('whose sign-in it is, as each program says it, never a key', () => {
  const claude = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'a@b.test', orgName: 'Studio', subscriptionType: 'max' });
  assert.deepEqual(readAgentStatus('claude', claude, claude), { signedIn: true, account: { method: 'claude.ai', email: 'a@b.test', org: 'Studio', plan: 'max' } });
  const out = JSON.stringify({ loggedIn: false, authMethod: 'none' });
  assert.deepEqual(readAgentStatus('claude', out, out), { signedIn: false, account: null });
  assert.deepEqual(readAgentStatus('codex', 'Logged in using ChatGPT\n', 'Logged in using ChatGPT\n'), { signedIn: true, account: { method: 'chatgpt' } });
  const key = 'Logged in using an API key - sk-proj-***ABCD\n';
  const read = readAgentStatus('codex', key, key);
  assert.deepEqual(read, { signedIn: true, account: { method: 'api-key' } });
  assert.ok(!JSON.stringify(read).includes('sk-'), 'no part of a key');
  assert.deepEqual(readAgentStatus('codex', 'Not logged in\n', 'Not logged in\n'), { signedIn: false, account: null });
});

test("the person's own developer_instructions in Codex's config, read as TOML writes them; a profile's is not theirs at the top", () => {
  assert.equal(codexDeveloperInstructions('model = "gpt"\ndeveloper_instructions = "Be brief.\\nSay \\"why\\"."\n'), 'Be brief.\nSay "why".');
  assert.equal(codexDeveloperInstructions("developer_instructions = 'C:\\no\\escapes'"), 'C:\\no\\escapes');
  assert.equal(codexDeveloperInstructions('developer_instructions = """\nLine one.\nLine two.\n"""\n[profiles.x]\n'), 'Line one.\nLine two.');
  assert.equal(codexDeveloperInstructions("developer_instructions = '''\nAs is: \\n\n'''"), 'As is: \\n');
  assert.equal(codexDeveloperInstructions('[profiles.work]\ndeveloper_instructions = "not at the top"\n'), null);
  assert.equal(codexDeveloperInstructions('model = "gpt"\n'), null);
  assert.equal(codexDeveloperInstructions(''), null);
});

test('the chat says it shows notices, so an agent sends its warnings as notices and not as words in its reply', async () => {
  /* the SDK's own parser, which drops a malformed capability without a word */
  const { zClientCapabilities } = await import(new URL('../node_modules/@agentclientprotocol/sdk/dist/schema/zod.gen.js', import.meta.url).href);
  const parsed = zClientCapabilities.parse(CLIENT_CAPABILITIES);
  /* the check Codex's adapter makes (codex-acp: clientSupportsNotices) */
  const notices = parsed.session?.notices;
  assert.ok(typeof notices === 'object' && notices !== null && !Array.isArray(notices));
  assert.deepEqual(parsed.elicitation, { form: {} });
});

test('Claude Code is given of the shell only its PATH and the like: a key or gateway there never stands in for the subscription', () => {
  const shell = { PATH: '/bin', HTTPS_PROXY: 'http://proxy', CLAUDE_CONFIG_DIR: '/c', LANG: 'zh_CN.UTF-8',
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'http://relay', OPENAI_API_KEY: 'o' };
  const given = agentShell('claude', shell);
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY']) assert.equal(given[key], undefined, key);
  assert.equal(given.HTTPS_PROXY, 'http://proxy');
  assert.equal(given.CLAUDE_CONFIG_DIR, '/c', 'where its own sign-in is kept');
  assert.equal(given.LANG, 'zh_CN.UTF-8');
  assert.equal(agentShell('codex', shell), shell, 'the others have the shell as it is');
});

test('the chat says it signs in in Terminal, so Claude Code offers its subscription sign-in (ACP terminal auth)', async () => {
  const { zClientCapabilities } = await import(new URL('../node_modules/@agentclientprotocol/sdk/dist/schema/zod.gen.js', import.meta.url).href);
  /* the check Claude Code's adapter makes before it offers its terminal sign-ins */
  assert.equal(zClientCapabilities.parse(CLIENT_CAPABILITIES).auth?.terminal, true);
});

test('a Windows sign-in is a PowerShell script: each path whole however it is spelled, read as UTF-8', () => {
  const script = powerShellScript('Claude Code sign-in', 'C:\\Program Files\\OpenFilm\\OpenFilm.exe',
    ['C:\\Program Files\\OpenFilm\\app.asar\\src\\as-node.mjs', 'D:\\用户\\it\'s\\index.js', '--cli', 'auth', 'login', '--claudeai']);
  assert.ok(script.startsWith('\ufeff'), 'a BOM: Windows PowerShell reads it as UTF-8');
  const lines = script.slice(1).split('\r\n');
  assert.equal(lines[0], "$Host.UI.RawUI.WindowTitle = 'Claude Code sign-in'");
  assert.equal(lines[1], "& 'C:\\Program Files\\OpenFilm\\OpenFilm.exe' 'C:\\Program Files\\OpenFilm\\app.asar\\src\\as-node.mjs' "
    + "'D:\\用户\\it''s\\index.js' '--cli' 'auth' 'login' '--claudeai'");
});
