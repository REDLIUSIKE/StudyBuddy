import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const uuid = '44444444-4444-4444-8444-444444444444';
const context = {
  scope: { accountId: 'owned-account', generation: 3 },
  hostGeneration: '22222222-2222-4222-8222-222222222222',
  projectId: 'project-a', workspaceId: 'workspace-a', sessionId: 'session-a', lease: uuid,
};
const request = { schemaVersion: 1, rpcId: uuid, context, operation: 'submit',
  input: { operationId: uuid, kind: 'conversation', input: { prompt: 'Review the supplied dataset', references: ['user_data/study.csv'] } } };
function parse(value: unknown): unknown {
  const parser = (contracts as unknown as Record<string, unknown>).parseHarnessResearchInvocationV1;
  if (typeof parser !== 'function') throw Error('CONTRACT_NOT_IMPLEMENTED');
  return parser(value);
}

describe('private research operation boundary', () => {
  it('retains captured account, Workspace, Session and operation identity', () => {
    expect(parse(request)).toEqual(request);
  });
  it.each([
    { ...request, apiKey: 'forbidden' },
    { ...request, operation: 'arbitrary-host-method' },
    { ...request, context: { ...context, lease: '' } },
    { ...request, context: { ...context, scope: { ...context.scope, generation: -1 } } },
    { ...request, input: { ...request.input, provider: 'another-provider' } },
    { ...request, input: { ...request.input, kind: 'provider-complete' } },
    { ...request, input: { ...request.input, input: { ...request.input.input, model: 'another-model' } } },
    { ...request, input: { ...request.input, input: { ...request.input.input, baseUrl: 'https://foreign.test' } } },
    { ...request, input: { ...request.input, input: { ...request.input.input, references: ['../outside.txt'] } } },
  ])('rejects unregistered operations, altered authority and escaped references', value => {
    expect(() => parse(value)).toThrow('HARNESS_RESEARCH_REQUEST_INVALID');
  });
  it.each(['methods-draft', 'next-experiments', 'latex-assist', 'compaction'])('admits %s through the same native boundary', kind => {
    const value = { ...request, input: { ...request.input, kind } };
    expect(parse(value)).toEqual(value);
  });
  it('keeps recovery and cancellation separate from submission', () => {
    for (const operation of ['inspect', 'cancel']) {
      const value = { ...request, operation, input: { runId: uuid } };
      expect(parse(value)).toEqual(value);
      expect(() => parse({ ...value, input: { runId: uuid, prompt: 'repeat a paid request' } })).toThrow('HARNESS_RESEARCH_REQUEST_INVALID');
    }
  });
});
