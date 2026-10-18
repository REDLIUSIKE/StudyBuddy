import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const issueId = '33333333-3333-4333-8333-333333333333';
const preview = { range: 'last_24_hours', fileCount: 1, eventCount: 1, compressedBytes: '1024',
  firstOccurredAt: '2026-10-12T00:00:00.000Z', lastOccurredAt: '2026-10-12T00:00:00.000Z' };
const log = { uploadId, publicCode: 'LOG-ABCD1234', status: 'AVAILABLE' };
const issue = { issueId, publicCode: 'ISSUE-ABCD1234', logUploadId: uploadId,
  logPublicCode: 'LOG-ABCD1234', status: 'OPEN' };
const report = { title: '连接失败', description: '点击配置后没有完成。', range: 'last_24_hours', screenshotSelectionIds: [] };
it('carries only a confirmed LOG while a report remains in upload or submission', () => {
  const value = { state:'running', requestId, flow:'issue', phase:'submitting', log };
  expect(contracts.parseHarnessSupportResult('getSupportOperation', value)).toEqual(value);
  expect(() => contracts.parseHarnessSupportResult('getSupportOperation', { ...value, log: { ...log, status:'CREATED' } })).toThrow();
  expect(() => contracts.parseHarnessSupportResult('getSupportOperation', { ...value, phase:'preparing' })).toThrow();
});

it('validates preview coverage separately from unchanged native archive fields', () => {
  const candidate: unknown = Reflect.get(contracts, 'parseHarnessSupportPreviewReceipt');
  expect(candidate).toBeTypeOf('function'); if (typeof candidate !== 'function') throw new Error('missing preview receipt parser');
  const sources = ['desktop_main', 'host', 'renderer', 'tool_center', 'community', 'skills', 'personal_ai', 'labs', 'aigc']
    .map(source => ({ source, state: 'unavailable' }));
  expect(candidate({ ...preview, sources })).toEqual({ ...preview, sources });
  expect(() => candidate({ ...preview, sources: [] })).toThrow();
  expect(() => candidate({ ...preview, sources: sources.map(() => sources[0]) })).toThrow();
  expect(() => candidate({ ...preview, sources, owner: 'other' })).toThrow();
  expect(() => candidate({ ...preview, sources: [{ source: 'chat_transcript', state: 'present' }, ...sources.slice(1)] })).toThrow();
});

// New public exports are accessed through the actual root entry; absent parsers fail assertions,
// not negative tests that could accidentally accept an undefined-function error.
function parser(name: string): (method: string, value: unknown) => unknown {
  const candidate: unknown = Reflect.get(contracts, name);
  expect(candidate).toBeTypeOf('function');
  if (typeof candidate !== 'function') throw new Error('support parser missing');
  return (method, value) => candidate(method, value);
}

describe('closed Harness support requests', () => {
  it('exposes support separately without granting support methods to a tool page', () => {
    const methods: unknown = Reflect.get(contracts, 'HARNESS_SUPPORT_METHODS');
    expect(methods).toEqual(['previewSupportLogs', 'uploadSupportLogs', 'stageSupportScreenshots',
      'submitSupportIssue', 'getSupportOperation', 'readSupportPreviousExit', 'recordHarnessDiagnostics']);
    expect(contracts.HARNESS_TOOL_METHODS).not.toContain('uploadSupportLogs');
    expect(contracts.HARNESS_TOOL_METHODS).not.toContain('stageSupportScreenshots');
  });

  it('retains the original range choices and parameter-free previous-exit read', () => {
    const parse = parser('parseHarnessSupportRequest');
    for (const range of ['last_24_hours', 'last_3_days', 'all_30_days']) {
      expect(parse('previewSupportLogs', [range])).toEqual([range]);
      expect(parse('uploadSupportLogs', [requestId, range])).toEqual([requestId, range]);
    }
    expect(parse('readSupportPreviousExit', [])).toEqual([]);
  });

  it.each(['owner', 'accountId', 'accessToken', 'path', 'logUploadId'])('rejects renderer report field %s', field => {
    const parse = parser('parseHarnessSupportRequest');
    expect(() => parse('submitSupportIssue', [requestId, { ...report, [field]: 'injected' }])).toThrow();
  });

  it('rejects arbitrary commands, invalid request IDs and extra tuple arguments', () => {
    const parse = parser('parseHarnessSupportRequest');
    expect(() => parse('invoke', ['readFile', 'C:/private.txt'])).toThrow();
    expect(() => parse('uploadSupportLogs', ['not-a-request-id', 'last_24_hours'])).toThrow();
    expect(() => parse('previewSupportLogs', ['last_24_hours', { accountId: 'other' }])).toThrow();
    expect(() => parse('previewSupportLogs', ['last_year'])).toThrow();
  });

  it('keeps report bounds and opaque screenshot selection IDs', () => {
    const parse = parser('parseHarnessSupportRequest');
    expect(parse('submitSupportIssue', [requestId, report])).toEqual([requestId, report]);
    for (const invalid of [{ ...report, title: 'x'.repeat(81) }, { ...report, title: '  ' },
      { ...report, description: 'x'.repeat(2001) }, { ...report, screenshotSelectionIds: [requestId, uploadId, issueId, requestId] },
      { ...report, screenshotSelectionIds: ['C:/private.png'] }]) {
      expect(() => parse('submitSupportIssue', [requestId, invalid])).toThrow();
    }
  });
});

describe('Harness support native result validation', () => {
  it('accepts native preview fields without exposing archive paths or an account override', () => {
    const parse = parser('parseHarnessSupportResult');
    expect(parse('previewSupportLogs', preview)).toEqual(preview);
    for (const field of ['accountId', 'path', 'key', 'body']) {
      expect(() => parse('previewSupportLogs', { ...preview, [field]: 'injected' })).toThrow();
    }
    expect(() => parse('previewSupportLogs', { ...preview, compressedBytes: '52428801' })).toThrow();
    expect(() => parse('previewSupportLogs', { ...preview, fileCount: 65 })).toThrow();
    expect(() => parse('previewSupportLogs', { ...preview, eventCount: 250001 })).toThrow();
  });

  it('requires an AVAILABLE object before presenting a usable log reference', () => {
    const parse = parser('parseHarnessSupportResult');
    const view = { state: 'available', requestId, flow: 'logs', log };
    expect(parse('uploadSupportLogs', view)).toEqual(view);
    for (const status of ['CREATED', 'UPLOADED', 'EXPIRED', 'REJECTED']) {
      expect(() => parse('uploadSupportLogs', { ...view, log: { ...log, status } })).toThrow();
    }
    expect(() => parse('uploadSupportLogs', { ...view, log: { ...log, publicCode: 'fake' } })).toThrow();
  });

  it('requires the confirmed issue to reference the same confirmed log', () => {
    const parse = parser('parseHarnessSupportResult');
    const view = { state: 'available', requestId, flow: 'issue', log, issue };
    expect(parse('submitSupportIssue', view)).toEqual(view);
    expect(() => parse('submitSupportIssue', { ...view, issue: { ...issue, logUploadId: requestId } })).toThrow();
    expect(() => parse('submitSupportIssue', { ...view, issue: { ...issue, logPublicCode: 'LOG-OTHER123' } })).toThrow();
  });

  it('preserves a confirmed log after an ambiguous report without inventing an ISSUE reference', () => {
    const parse = parser('parseHarnessSupportResult');
    const view = { state: 'submission_unconfirmed', requestId, flow: 'issue', log,
      error: { code: 'LOG_UPLOAD_TIMEOUT' } };
    expect(parse('submitSupportIssue', view)).toEqual(view);
    expect(() => parse('submitSupportIssue', { ...view, issue })).toThrow();
    expect(() => parse('submitSupportIssue', { ...view, error: { code: 'TIMEOUT', message: 'raw server body' } })).toThrow();
  });

  it('returns safe screenshot metadata only and retains original attachment limits', () => {
    const parse = parser('parseHarnessSupportResult');
    const selected = { selectionId: requestId, name: '截图.png', mediaType: 'image/png', bytes: '5242880' };
    expect(parse('stageSupportScreenshots', [selected])).toEqual([selected]);
    expect(() => parse('stageSupportScreenshots', [{ ...selected, bytes: '5242881' }])).toThrow();
    expect(() => parse('stageSupportScreenshots', [{ ...selected, path: 'C:/private.png' }])).toThrow();
    expect(() => parse('stageSupportScreenshots', [{ ...selected, mediaType: 'application/octet-stream' }])).toThrow();
    expect(() => parse('stageSupportScreenshots', [selected, selected, selected, selected])).toThrow();
  });

  it('keeps previous-exit status bounded and excludes raw crash reports', () => {
    const parse = parser('parseHarnessSupportResult');
    expect(parse('readSupportPreviousExit', { detected: true })).toEqual({ detected: true });
    expect(() => parse('readSupportPreviousExit', { detected: true, stack: 'private stack' })).toThrow();
  });

  it('does not acknowledge a new upload or report with an idle operation', () => {
    const parse = parser('parseHarnessSupportResult');
    expect(parse('getSupportOperation', { state: 'idle' })).toEqual({ state: 'idle' });
    expect(() => parse('uploadSupportLogs', { state: 'idle' })).toThrow();
    expect(() => parse('submitSupportIssue', { state: 'idle' })).toThrow();
  });

  it('bounds diagnostic batch counts and rejects unknown import sources', () => {
    const parse = parser('parseHarnessSupportResult'), request = parser('parseHarnessSupportRequest');
    expect(request('recordHarnessDiagnostics', [{ source: 'desktop_main', events: [] }])).toEqual([{ source: 'desktop_main', events: [] }]);
    expect(() => request('recordHarnessDiagnostics', [{ source: 'arbitrary_directory', events: [] }])).toThrow();
    expect(parse('recordHarnessDiagnostics', { recorded: 1, duplicates: 1 })).toEqual({ recorded: 1, duplicates: 1 });
    expect(() => parse('recordHarnessDiagnostics', { recorded: 256, duplicates: 1 })).toThrow();
  });

  it('rejects inconsistent progress and noncanonical sequence values', () => {
    const value: unknown = Reflect.get(contracts, 'parseHarnessSupportEvent');
    expect(value).toBeTypeOf('function');
    if (typeof value !== 'function') throw new Error('support event parser missing');
    const event = { requestId, sequence: 1, phase: 'uploading',
      operation: { state: 'running', requestId, flow: 'logs', phase: 'uploading' } };
    expect(value(event)).toEqual(event);
    expect(() => value({ ...event, sequence: 0 })).toThrow();
    expect(() => value({ ...event, sequence: 1.5 })).toThrow();
    expect(() => value({ ...event, phase: 'completed' })).toThrow();
    expect(() => value({ ...event, percent: 35 })).toThrow();
  });
});
