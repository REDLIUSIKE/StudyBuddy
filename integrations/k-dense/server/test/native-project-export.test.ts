import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createHash } from 'node:crypto'; import { buffer } from 'node:stream/consumers';
import { afterEach, expect, it, vi } from 'vitest'; import AdmZip from 'adm-zip';
import { NativeProjectExporter } from '../src/runtime/native-project-export.ts';
import { buildProjectArchive } from '../src/project-archive.ts';
const sid = 'session-11111111-1111-4111-8111-111111111111';
const text = JSON.stringify({ type: 'native-session/header', nativeSessionId: sid, schemaVersion: 1 }) + '\n' + JSON.stringify({ seq: 0, type: 'user/message', data: { text: '研究😀' } }) + '\n';
const page = () => ({ nativeSessionId: sid, endSeq: 0, dataBase64: Buffer.from(text).toString('base64'), sha256: createHash('sha256').update(text).digest('hex') });
const roots: string[] = []; afterEach(() => { roots.forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.unstubAllEnvs(); });
function exporter(current = () => true, response: object = page()) {
  const request = vi.fn(async (_id: string, operation: string) => operation === 'journal-sessions' ? { projectId: 'study', sessions: [{ id: sid, label: 'Recorded study', closed: true,parentSessionId:'session-22222222-2222-4222-8222-222222222222',rootSessionId:'session-22222222-2222-4222-8222-222222222222' }] } : response);
  return { request, service: new NativeProjectExporter({ current, request } as never) };
}
it('exports a closed native chat as complete journal and readable records, without legacy agent setup', async () => {
  const f = exporter(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-archive-')); roots.push(root);
  const sandbox = path.join(root, 'sandbox'), sessionsDir = path.join(sandbox, '.pi/sessions'), notebookDir = path.join(sandbox, '.kady/notebook'); fs.mkdirSync(sandbox);
  const nativeSessions = await f.service.sessions('study');
  const { archive } = await buildProjectArchive({ paths: { id: 'study', sandbox, sessionsDir, notebookDir } as never, sessions: [], nativeSessions });
  const consume = buffer(archive); await archive.finalize(); const zip = new AdmZip(await consume);
  expect(zip.getEntry(`native-chat-history/raw/${sid}.jsonl`)?.getData().toString('utf8')).toBe(text);
  expect(zip.getEntry(`native-chat-history/markdown/${sid}.md`)?.getData().toString('utf8')).toContain('研究😀');
  expect(JSON.parse(zip.getEntry('native-chat-history/manifest.json')!.getData().toString('utf8')).sessions[0]).toMatchObject({ id: sid, runtime: 'native', endSeq: 0,parentSessionId:'session-22222222-2222-4222-8222-222222222222',rootSessionId:'session-22222222-2222-4222-8222-222222222222' });
  expect(f.request.mock.calls.every(call => !['submit', 'answer', 'cancel'].includes(call[1]))).toBe(true);
});
it('rejects a changed chunk digest before exposing corrupted export bytes', async () => {
  const f = exporter(() => true, { ...page(), sha256: 'a'.repeat(64) });
  await expect(f.service.sessions('study')).rejects.toThrow('NATIVE_EXPORT_INVALID');
});
it('rejects owner revocation while preparing an export', async () => {
  const f = exporter(() => false); await expect(f.service.sessions('study')).rejects.toThrow('RESEARCH_CONTEXT_REVOKED'); expect(f.request).not.toHaveBeenCalled();
});
