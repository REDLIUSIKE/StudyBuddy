import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { afterEach, expect, test, vi } from 'vitest';

const temporary: string[] = [], domains: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(domains.splice(0).map(domain => domain.close()));
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.resetModules();
}, 15_000);

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-project-notebook-')); temporary.push(directory);
  const staticDirectory = path.join(directory, 'web'); fs.mkdirSync(staticDirectory); fs.writeFileSync(path.join(staticDirectory, 'index.html'), '<p>Fixture</p>');
  const sessionId = 'session-11111111-1111-4111-8111-111111111111', projectsRoot = path.join(directory, 'projects');
  let live = true;
  const channel = { current: () => live, request: async (projectId: string, operation: string, input: unknown) => {
    if (operation === 'bind') return { projectId, sessionId };
    if (operation === 'journal') return { projectId, nativeSessionId: sessionId, records: (input as { afterSeq: number }).afterSeq >= 0 ? [] : [{ eventId: `${sessionId}:0`, nativeSessionId: sessionId, seq: 0, time: 3000, kind: 'tool/result', payloadSample: 'Observed journal fixture', payloadSha256: createHash('sha256').update('Observed journal fixture').digest('hex'), truncated: false }] };
    throw Error(`Unexpected native request: ${operation}`);
  }, async *events() {} };
  const { createEmbeddedResearchDomain } = await import('../src/research-domain.ts');
  const options = { projectsRoot, staticDirectory, guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64), channel };
  const domain = await createEmbeddedResearchDomain(options); domains.push(domain);
  const { origin } = await domain.start(), headers = { 'x-studybuddy-research-guest': options.guestAuthorization, 'x-project-id': 'study' };
  for (const id of ['study', 'other']) {
    const created = await fetch(origin + '/api/projects', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ id, name: id === 'study' ? 'Stored project' : 'Other project' }) });
    expect(created.status).toBe(201);
  }
  const sandbox = path.join(projectsRoot, 'study', 'sandbox'), notebookDir = path.join(sandbox, '.kady', 'notebook'); fs.mkdirSync(notebookDir, { recursive: true });
  const storedFile = path.join(notebookDir, 'legacy-chat.jsonl');
  const storedBytes = [{ id: 'early', type: 'note', title: 'Stored research note', body: 'Real JSONL body', timestamp: 1000, role: 'agent', artifacts: ['result.txt'] }, { id: 'late', type: 'decision', title: 'Later decision', timestamp: 4000, role: 'agent' }].map(JSON.stringify).join('\n') + '\n{truncated';
  fs.writeFileSync(storedFile, storedBytes); fs.writeFileSync(path.join(sandbox, 'result.txt'), 'Stored artifact bytes');
  fs.writeFileSync(path.join(notebookDir, 'legacy-chat.annotations.json'), JSON.stringify({ version: 1, annotations: [{ id: 'user-comment', kind: 'comment', entryId: 'early', body: 'User annotation', createdAt: 2000 }] }));
  const sessionsDir = path.join(sandbox, '.pi', 'sessions'); fs.mkdirSync(sessionsDir, { recursive: true });
  const metadataFile = path.join(sessionsDir, 'legacy.jsonl'), metadataBytes = [{ type: 'session', version: 3, id: 'legacy-chat', cwd: sandbox, timestamp: '2026-10-15T00:00:00Z' }, { type: 'session_info', name: 'Stored chat title' }].map(JSON.stringify).join('\n') + '\n';
  fs.writeFileSync(metadataFile, metadataBytes);
  const otherNotebook = path.join(projectsRoot, 'other', 'sandbox', '.kady', 'notebook'); fs.mkdirSync(otherNotebook, { recursive: true });
  fs.writeFileSync(path.join(otherNotebook, 'other-chat.jsonl'), JSON.stringify({ id: 'foreign', type: 'note', title: 'Other project private note', timestamp: 1, role: 'agent' }) + '\n');
  return { domain, origin, headers, projectsRoot, notebookDir, sessionsDir, sessionId, storedFile, storedBytes, metadataFile, metadataBytes, revoke: () => { live = false; } };
}

test('the embedded project notebook merges persisted legacy and imported journal rows without losing export annotations or artifacts', async () => {
  const f = await fixture();
  const imported = await fetch(`${f.origin}/api/sessions/${f.sessionId}/notebook`, { headers: f.headers }); expect(imported.status).toBe(200);
  expect((await imported.json()).entries[0].id).toBe(`native:${f.sessionId}:0`);
  const response = await fetch(`${f.origin}/api/projects/study/notebook`, { headers: f.headers });
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body.entries.map((entry: { id: string; sessionId: string }) => [entry.id, entry.sessionId])).toEqual([['early', 'legacy-chat'], [`native:${f.sessionId}:0`, f.sessionId], ['late', 'legacy-chat']]);
  expect(body.sessions).toEqual([{ sessionId: 'legacy-chat', entryCount: 2, firstTimestamp: 1000, lastTimestamp: 4000 }, { sessionId: f.sessionId, entryCount: 1, firstTimestamp: 3000, lastTimestamp: 3000 }]);
  const exported = await fetch(`${f.origin}/api/projects/study/notebook/export?format=json`, { headers: f.headers }); expect(exported.status).toBe(200);
  expect(exported.headers.get('content-disposition')).toBe('attachment; filename="lab-notebook-study.json"');
  const json = await exported.json(); expect(json.projectName).toBe('Stored project');
  expect(json.entries.map((entry: { id: string }) => entry.id)).toEqual(['early', `native:${f.sessionId}:0`, 'late']);
  expect(json.entries[0]).toMatchObject({ title: 'Stored research note', body: 'Real JSONL body', sessionId: 'legacy-chat', artifacts: ['result.txt'], artifactHealth: [{ path: 'result.txt', status: 'unverified' }] });
  expect(json.sessions).toContainEqual({ id: 'legacy-chat', label: 'Stored chat title' });
  expect(json.annotations).toEqual([{ id: 'user-comment', kind: 'comment', entryId: 'early', body: 'User annotation', createdAt: 2000, sessionId: 'legacy-chat' }]);
  const markdown = await fetch(`${f.origin}/api/projects/study/notebook/export?format=md`, { headers: f.headers }); expect(markdown.status).toBe(200);
  const md = await markdown.text(); for (const text of ['Stored research note', 'Stored chat title', 'User annotation', 'Observed journal fixture']) expect(md).toContain(text);
  const zipped = await fetch(`${f.origin}/api/projects/study/notebook/export?format=zip`, { headers: f.headers }); expect(zipped.status).toBe(200);
  const zip = new AdmZip(Buffer.from(await zipped.arrayBuffer())); expect(zip.readAsText('artifacts/result.txt')).toBe('Stored artifact bytes'); expect(zip.readAsText('lab-notebook.md')).toContain('User annotation');
  expect((await fetch(`${f.origin}/api/projects/study/notebook/export?format=pdf`, { headers: f.headers })).status).toBe(400);
  expect(fs.readFileSync(f.storedFile, 'utf8')).toBe(f.storedBytes); expect(fs.readFileSync(f.metadataFile, 'utf8')).toBe(f.metadataBytes);
}, 15_000);

test('project notebook reads and exports retain guest, project and filesystem admission boundaries', async () => {
  const f = await fixture();
  for (const suffix of ['', '/export?format=json']) {
    const url = `${f.origin}/api/projects/study/notebook${suffix}`;
    expect((await fetch(url)).status).toBe(403);
    expect((await fetch(url, { headers: { 'x-studybuddy-research-guest': f.headers['x-studybuddy-research-guest'] } })).status).toBe(400);
    expect((await fetch(url, { headers: { ...f.headers, 'x-project-id': 'missing' } })).status).toBe(404);
    const crossed = await fetch(`${f.origin}/api/projects/other/notebook${suffix}`, { headers: f.headers }); expect(crossed.status).toBe(403); expect(await crossed.text()).not.toContain('Other project private note');
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'research-notebook-outside-')); temporary.push(outside);
  fs.writeFileSync(path.join(outside, 'secret.jsonl'), JSON.stringify({ id: 'outside', title: 'Outside account private note', timestamp: 1 }) + '\n');
  const junction = path.join(f.notebookDir, 'escape'); fs.symlinkSync(outside, junction, 'junction');
  // An unrelated non-notebook directory does not enter the aggregate.
  expect((await fetch(`${f.origin}/api/projects/study/notebook`, { headers: f.headers })).status).toBe(200);
  fs.rmSync(f.notebookDir, { recursive: true, force: true }); fs.symlinkSync(outside, f.notebookDir, 'junction');
  for (const suffix of ['', '/export?format=json']) {
    const denied = await fetch(`${f.origin}/api/projects/study/notebook${suffix}`, { headers: f.headers }); expect(denied.status).toBe(403); expect(await denied.text()).not.toContain('Outside account private note');
  }
  f.revoke(); expect((await fetch(`${f.origin}/api/projects/study/notebook`, { headers: f.headers })).status).toBe(403);
}, 15_000);
