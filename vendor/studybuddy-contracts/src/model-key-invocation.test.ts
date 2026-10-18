import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const request = {
  schemaVersion: 1,
  requestId: '8b1dc3c0-1cc7-4d15-80d5-239d53441888',
  exactModelId: 'deepseek-v4-flash',
  protocol: 'openai_chat_completions',
  purpose: 'chat',
};
const parse = (input: unknown): unknown => {
  const parser = (contracts as unknown as Record<string, unknown>).parseModelKeyInvocationV1;
  return typeof parser === 'function' ? parser(input) : { missing: 'model-key-invocation' };
};

describe('Key-only model invocation', () => {
  it('needs no StudyBuddy account, device, caller or connection grant', () => {
    expect(parse(request)).toEqual(request);
  });
  it.each(['accountId', 'userId', 'deviceId', 'toolId', 'grantId', 'authSession', 'accessToken', 'apiKey'])
    ('rejects an added identity or secret field: %s', field => {
      expect(() => parse({ ...request, [field]: 'must-not-enter-the-contract' })).toThrow();
    });
  it.each([
    { protocol: 'openai_responses', purpose: 'chat' },
    { protocol: 'anthropic_messages', purpose: 'chat' },
    { protocol: 'openai_image.generate', purpose: 'image' },
    { protocol: 'openai_video.create', purpose: 'video' },
    { protocol: 'minimax_speech.generate', purpose: 'audio' },
    { protocol: 'minimax_speech.transcribe', purpose: 'transcription' },
    { protocol: 'openai_chat_completions', purpose: 'diagnostic' },
  ])('keeps an exact existing wire protocol and purpose', fields => {
    const input = { ...request, ...fields };
    expect(parse(input)).toEqual(input);
  });
  it.each([
    { ...request, schemaVersion: 2 }, { ...request, requestId: '' },
    { ...request, protocol: 'automatically-detected' }, { ...request, purpose: 'grant-refresh' },
    { ...request, exactModelId: 'display name instead of exact ID' },
    { ...request, protocol: 'openai_image.generate', purpose: 'chat' },
    { ...request, protocol: 'openai_video.create', purpose: 'image' },
    { ...request, protocol: 'minimax_speech.generate', purpose: 'chat' },
    { ...request, protocol: 'minimax_speech.transcribe', purpose: 'audio' },
    { ...request, fundingSource: 'platform' },
  ])('rejects unknown, inconsistent and client-claimed authority', input => {
    expect(() => parse(input)).toThrow();
  });
});
