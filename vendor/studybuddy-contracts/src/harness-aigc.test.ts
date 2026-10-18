import { describe, expect, it } from 'vitest';
import { parseHarnessAigcContextV1, parseHarnessAigcToolInvocationV1 } from './harness-aigc.js';

const context = { scope: { accountId: 'account-a', generation: 1 }, hostGeneration: '00000000-0000-4000-8000-000000000004',
  projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'workspace-a', sessionId: 'session-00000000-0000-4000-8000-000000000001', lease: '00000000-0000-4000-8000-000000000002' };
describe('private AIGC binding', () => {
  it('accepts only complete native identity and never page-supplied roots or credentials', () => {
    expect(parseHarnessAigcContextV1(context)).toEqual(context);
    expect(() => parseHarnessAigcContextV1({ ...context, root: 'C:/foreign' })).toThrow();
    expect(() => parseHarnessAigcContextV1({ ...context, scope: { ...context.scope, generation: -1 } })).toThrow();
    expect(() => parseHarnessAigcContextV1({ ...context, sessionId: 'pi-old' })).toThrow();
    expect(() => parseHarnessAigcContextV1({ ...context, apiKey: 'forbidden' })).toThrow();
  });
  it('closes the tool operation set and freezes the actual native caller', () => {
    const request = { schemaVersion: 1, rpcId: '00000000-0000-4000-8000-000000000003', context,
      callerSessionId: context.sessionId, toolCallId: 'call-a', operation: 'execute', input: { name: 'getCanvas', arguments: {} } };
    expect(parseHarnessAigcToolInvocationV1(request)).toEqual(request);
    expect(parseHarnessAigcToolInvocationV1({ ...request, callerSessionId: '00000000-0000-4000-8000-000000000005', operation: 'resources' }).callerSessionId).toBe('00000000-0000-4000-8000-000000000005');
    expect(() => parseHarnessAigcToolInvocationV1({ ...request, callerSessionId: '../foreign' })).toThrow();
    expect(() => parseHarnessAigcToolInvocationV1({ ...request, operation: 'shell' })).toThrow();
    expect(() => parseHarnessAigcToolInvocationV1({ ...request, input: { value: NaN } })).toThrow();
  });
});
