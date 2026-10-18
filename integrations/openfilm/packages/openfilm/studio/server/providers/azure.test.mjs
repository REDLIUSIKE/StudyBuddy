import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import azure from './azure.mjs';
import { wav } from './common.mjs';

const KEY = 'eastus:azure-test-0123456789abcdef';
/** A fake Azure Speech on 127.0.0.1: `reply` answers each request; `seen` keeps them. */
let server;
let reply = () => [404, {}];
const seen = [];

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const call = { method: req.method, url: new URL(req.url, 'http://x'), headers: req.headers, body: Buffer.concat(chunks) };
    seen.push(call);
    const [status, body] = await reply(call);
    if (body instanceof Uint8Array) res.writeHead(status, { 'content-type': 'audio/wav' }).end(body);
    else res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  process.env.OPENFILM_AZURE_URL = `http://127.0.0.1:${server.address().port}`;
  delete process.env.AZURE_SPEECH_REGION;
});
after(() => server.close());

const ctx = (key = KEY) => ({ key, root: '/project', signal: new AbortController().signal, say: () => {}, read: async () => undefined });

const VOICES = [
  { ShortName: 'en-US-AvaMultilingualNeural', DisplayName: 'Ava Multilingual', LocalName: 'Ava', Gender: 'Female', Locale: 'en-US', LocaleName: 'English (United States)', StyleList: ['cheerful'] },
  { ShortName: 'en-US-AndrewNeural', DisplayName: 'Andrew', LocalName: 'Andrew', Gender: 'Male', Locale: 'en-US', LocaleName: 'English (United States)' },
  { ShortName: 'zh-CN-XiaoxiaoNeural', DisplayName: 'Xiaoxiao', LocalName: '晓晓', Gender: 'Female', Locale: 'zh-CN', LocaleName: 'Chinese (Mainland)', StyleList: ['newscast', 'sad'] },
];

test('voice-over: SSML in the voice\'s locale, as WAV, its length from the file; the key and region split apart', async () => {
  reply = () => [200, wav(new Uint8Array(48000), 24000)];
  const result = await azure.run('tts', { out: 'line', text: "Mix & master, <fast>.", voice: 'zh-CN-XiaoxiaoNeural' }, ctx());
  const call = seen.at(-1);
  assert.equal(call.url.pathname, '/cognitiveservices/v1');
  assert.equal(call.headers['ocp-apim-subscription-key'], 'azure-test-0123456789abcdef');
  assert.equal(call.headers['x-microsoft-outputformat'], 'riff-24khz-16bit-mono-pcm');
  assert.equal(call.headers['content-type'], 'application/ssml+xml');
  assert.equal(call.body.toString(),
    "<speak version='1.0' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'>Mix &amp; master, &lt;fast&gt;.</voice></speak>");
  assert.equal(result.files[0].path, 'assets/audio/vo/line.wav');
  assert.equal(result.index[0].dur, 1);
  assert.equal(result.index[0].words, undefined);
  assert.match(result.receipt.notes[0], /no word timings/);
  assert.equal(result.cost.note, 'billed by Azure Speech to your key');
});

test('a key without a region is refused before anything is sent, unless AZURE_SPEECH_REGION says it', async () => {
  const before = seen.length;
  await assert.rejects(azure.run('tts', { out: 'x', text: 'Hi.', voice: 'en-US-AndrewNeural' }, ctx('azure-test-0123456789abcdef')), /region/);
  assert.equal(seen.length, before);
  reply = () => [200, wav(new Uint8Array(24000), 24000)];
  process.env.AZURE_SPEECH_REGION = 'westus2';
  try {
    const result = await azure.run('tts', { out: 'x', text: 'Hi.', voice: 'en-US-AndrewNeural' }, ctx('azure-test-0123456789abcdef'));
    assert.equal(result.index[0].dur, 0.5);
    assert.equal(seen.at(-1).headers['ocp-apim-subscription-key'], 'azure-test-0123456789abcdef');
  } finally {
    delete process.env.AZURE_SPEECH_REGION;
  }
});

test('a region that could not be a host name is refused before anything is sent', async () => {
  const before = seen.length;
  process.env.AZURE_SPEECH_REGION = 'east us.evil.example';
  try {
    await assert.rejects(azure.run('tts', { out: 'x', text: 'Hi.', voice: 'en-US-AndrewNeural' }, ctx('azure-test-0123456789abcdef')), /AZURE_SPEECH_REGION does not look like an Azure region/);
  } finally {
    delete process.env.AZURE_SPEECH_REGION;
  }
  assert.equal(seen.length, before);
});

test('checkKey holds a pasted key to the same rule, so Settings refuses one that cannot work', () => {
  assert.throws(() => azure.checkKey('azure-test-0123456789abcdef'), /region/);
  azure.checkKey(KEY);
  process.env.AZURE_SPEECH_REGION = 'westus2';
  try {
    azure.checkKey('azure-test-0123456789abcdef');
  } finally {
    delete process.env.AZURE_SPEECH_REGION;
  }
});

test('voices: the service\'s list, searched by the prompt, then by language and gender', async () => {
  reply = () => [200, VOICES];
  const women = await azure.run('voice', { language: 'en', gender: 'f' }, ctx());
  assert.equal(seen.at(-1).url.pathname, '/cognitiveservices/voices/list');
  assert.deepEqual(women.receipt.voices, [{
    voiceId: 'en-US-AvaMultilingualNeural', name: 'Ava Multilingual', language: 'en-US', gender: 'f',
    description: 'English (United States) · styles: cheerful',
  }]);
  const searched = await azure.run('voice', { prompt: '晓晓' }, ctx());
  assert.deepEqual(searched.receipt.voices.map((v) => v.voiceId), ['zh-CN-XiaoxiaoNeural']);
  assert.equal(searched.receipt.notes, undefined);
  const missed = await azure.run('voice', { prompt: 'yodeling', limit: 2 }, ctx());
  assert.deepEqual(missed.receipt.voices.map((v) => v.voiceId), ['en-US-AvaMultilingualNeural', 'en-US-AndrewNeural']);
  assert.match(missed.receipt.notes[0], /no voice matched "yodeling"/);
});
