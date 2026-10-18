import { expect, it } from 'vitest';
import * as contract from './harness-research.js';
const uuid = '44444444-4444-4444-8444-444444444444';
const request = { schemaVersion: 1, rpcId: uuid,
  context: { scope: { accountId: 'test-a', generation: 1 }, hostGeneration: uuid, lease: uuid, projectId: 'study', workspaceId: 'workspace-study', sessionId: 'native-study' },
  toolCallId: 'call-native-one', operation: 'notebook', input: { record: { type: 'hypothesis', title: 'Reviewed question' } } };
function parse(value: unknown) {
  const fn = (contract as unknown as Record<string, unknown>).parseHarnessResearchToolInvocationV1;
  if (typeof fn !== 'function') throw Error('RESEARCH_TOOL_PARSER_MISSING'); return fn(value);
}
it('admits only registered project tools under the exact native context', () => { expect(parse(request)).toEqual(request); });
it.each([
  { ...request, operation: 'raw-provider' },
  { ...request, provider: 'foreign' },
  { ...request, input: { record: {}, model: 'foreign' } },
  { ...request, context: { ...request.context, lease: '' } },
  { ...request, toolCallId: '' },
])('rejects authority overrides and unregistered native tool actions', value => { expect(() => parse(value)).toThrow('HARNESS_RESEARCH_REQUEST_INVALID'); });
