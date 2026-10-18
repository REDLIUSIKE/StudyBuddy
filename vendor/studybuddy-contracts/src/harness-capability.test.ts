import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const api = contracts as unknown as {
  parseHarnessCapabilityInvocationV1(value: unknown): unknown;
  parseHarnessCapabilityResultV1(value: unknown): unknown;
};
const caller = {
  scope: { accountId: 'account-a', generation: 1 },
  hostGeneration: '00000000-0000-4000-8000-000000000004',
  callerSessionId: 'session-video-00000000-0000-4000-8000-000000000001',
  workspaceId: null,
  toolCallId: 'call-original',
};
const request = {
  schemaVersion: 1,
  rpcId: '00000000-0000-4000-8000-000000000003',
  caller,
  operation: 'execute',
  target: { moduleId: 'aigc', projectRef: 'project-one' },
  input: { name: 'getCanvas', arguments: {} },
};
const artifact = {
  artifactRef: 'artifact-one', moduleId: 'aigc', schemaRef: 'aigc.image.v1',
  originSessionId: caller.callerSessionId, mime: 'image/png', bytes: 123, sha256: 'a'.repeat(64),
};

describe('private cross-module capability contract', () => {
  it('acceptsVideoCallerAndNullWorkspace', () => {
    expect(api.parseHarnessCapabilityInvocationV1(request)).toEqual(request);
    for (const id of ['session-00000000-0000-4000-8000-000000000002', 'ordinary', '00000000-0000-4000-8000-000000000002']) {
      const value = { ...request, caller: { ...caller, callerSessionId: id, workspaceId: 'workspace-one' } };
      expect(api.parseHarnessCapabilityInvocationV1(value)).toEqual(value);
    }
  });
  it('rejectsRawPathAndCredentialOverrides', () => {
    for (const patch of [{ root: 'C:/foreign' }, { apiKey: 'forbidden' }, { fundingSource: 'platform' }]) {
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, ...patch })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, caller: { ...caller, ...patch } })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    }
    for (const projectRef of ['../foreign', 'C:/foreign', 'https://foreign.invalid/file', 'with space']) {
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, target: { moduleId: 'video', projectRef } })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    }
  });
  it('rejectsInvalidJsonAndNonfiniteBytes', () => {
    for (const input of [{ bad: NaN }, { bad: Infinity }, { bad: undefined }, { bad: new Date() }]) {
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, input })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    }
    for (const bytes of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => api.parseHarnessCapabilityResultV1({ data: null, artifacts: [{ ...artifact, bytes }], operationRef: null })).toThrow('HARNESS_CAPABILITY_RESULT_INVALID');
    }
  });
  it('rejectsUnknownVersionAndOperation', () => {
    for (const patch of [{ schemaVersion: 2 }, { operation: 'shell' }, { rpcId: 'foreign' }, { caller: { ...caller, callerSessionId: '../escape' } }, { caller: { ...caller, scope: { ...caller.scope, generation: -1 } } }]) {
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, ...patch })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    }
  });
  it('roundTripsTypedArtifactAndFutureModule', () => {
    const result = { data: { complete: true }, artifacts: [artifact], operationRef: 'operation-one' };
    expect(api.parseHarnessCapabilityResultV1(result)).toEqual(result);
    const future = { ...request, operation: 'bind', target: { moduleId: 'novel', projectRef: 'novel-one' }, input: { action: 'attach' } };
    expect(api.parseHarnessCapabilityInvocationV1(future)).toEqual(future);
    expect(() => api.parseHarnessCapabilityResultV1({ ...result, artifacts: [{ ...artifact, sha256: 'BAD' }] })).toThrow('HARNESS_CAPABILITY_RESULT_INVALID');
  });
  it('requiresTargetsForDomainActionsAndBoundsWholePayload', () => {
    for (const operation of ['execute', 'import', 'status', 'cancel']) {
      expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, operation, target: null })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    }
    expect(api.parseHarnessCapabilityInvocationV1({ ...request, operation: 'catalog', target: null, input: null })).toMatchObject({ target: null });
    expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, input: { values: Array(10001).fill(null) } })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    const nested: Record<string, unknown> = {}; let next = nested;
    for (let i = 0; i < 34; i++) next = next.child = {};
    expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, input: nested })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
  });
  it('rejectsSparseArraysInsteadOfChangingTheirMeaning', () => {
    expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, input: new Array(1) })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
    expect(() => api.parseHarnessCapabilityResultV1({ data: null, artifacts: new Array(1), operationRef: null })).toThrow('HARNESS_CAPABILITY_RESULT_INVALID');
  });
  it('boundsUtf8EnvelopeIncludingMetadataAndSnapshotsInput', () => {
    const input = { text: '字'.repeat(2000) };
    const parsed = api.parseHarnessCapabilityInvocationV1({ ...request, input });
    input.text = 'changed';
    expect(parsed).toMatchObject({ input: { text: '字'.repeat(2000) } });
    const nearLimit = '字'.repeat(Math.floor(32 * 1024 * 1024 / 3));
    expect(() => api.parseHarnessCapabilityInvocationV1({ ...request, input: nearLimit })).toThrow('HARNESS_CAPABILITY_REQUEST_INVALID');
  });
});
