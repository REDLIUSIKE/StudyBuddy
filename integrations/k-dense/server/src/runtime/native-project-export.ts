/** Private, read-only export of complete native journals under a fixed watermark. */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import type { NativeChannel } from './native-channel.ts';
import type { NativeArchiveSession } from '../project-archive.ts';
interface Cursor { seq: number; offset: number }
interface Page { endSeq: number; bytes: Buffer; next?: Cursor }
const invalid = (): never => { throw Error('NATIVE_EXPORT_INVALID'); };
export class NativeProjectExporter {
  constructor(private readonly channel: Pick<NativeChannel, 'request' | 'current'>) {}
  private assert(): void { if (!this.channel.current()) throw Error('RESEARCH_CONTEXT_REVOKED'); }
  private async page(projectId: string, sessionId: string, cursor: Cursor, endSeq: number | null, signal: AbortSignal): Promise<Page> {
    this.assert(); const data = await this.channel.request(projectId, 'journal-export', { cursor, endSeq }, signal, sessionId); this.assert();
    if (!data || typeof data !== 'object' || !('nativeSessionId' in data) || data.nativeSessionId !== sessionId || !('endSeq' in data) || !Number.isSafeInteger(data.endSeq) || Number(data.endSeq) < -1 || (endSeq !== null && data.endSeq !== endSeq) ||
      !('dataBase64' in data) || typeof data.dataBase64 !== 'string' || data.dataBase64.length > 262144 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.dataBase64) || !('sha256' in data) || typeof data.sha256 !== 'string') return invalid();
    const bytes = Buffer.from(data.dataBase64, 'base64'); if (createHash('sha256').update(bytes).digest('hex') !== data.sha256) return invalid();
    const next = 'next' in data ? data.next : undefined;
    if (next !== undefined && (!next || typeof next !== 'object' || Object.keys(next).length !== 2 || !('seq' in next) || !Number.isSafeInteger(next.seq) || !('offset' in next) || !Number.isSafeInteger(next.offset) || Number(next.offset) < 0 || Number(next.seq) < cursor.seq || Number(next.seq) > Number(data.endSeq) || (Number(next.seq) === cursor.seq && Number(next.offset) <= cursor.offset) || bytes.length === 0)) return invalid();
    return { endSeq: Number(data.endSeq), bytes, ...(next ? { next: next as Cursor } : {}) };
  }
  private async *bytes(projectId: string, sessionId: string, first: Page): AsyncGenerator<Buffer> {
    const controller = new AbortController(); let page = first;
    try { for (;;) { this.assert(); yield page.bytes; if (!page.next) return; page = await this.page(projectId, sessionId, page.next, first.endSeq, controller.signal); } }
    finally { controller.abort(); }
  }
  private async *markdown(projectId: string, sessionId: string, label: string, first: Page): AsyncGenerator<string> {
    yield `# ${label}\n\nNative Session: ${sessionId}\n\nThese are recorded events, not independent scientific verification. Tool arguments describe attempted actions; outcomes are recorded separately.\n\n`;
    const decoder = new StringDecoder('utf8'); let pending = '';
    for await (const bytes of this.bytes(projectId, sessionId, first)) {
      pending += decoder.write(bytes); let at: number;
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at); pending = pending.slice(at + 1); if (!line) continue;
        const event = JSON.parse(line) as { type: string; seq?: number; data?: unknown };
        if (event.type === 'native-session/header') continue;
        yield `## ${event.seq}: ${event.type}\n\n\`\`\`json\n${JSON.stringify(event.data, null, 2)}\n\`\`\`\n\n`;
      }
    }
    pending += decoder.end(); if (pending.trim()) return invalid();
  }
  async sessions(projectId: string): Promise<NativeArchiveSession[]> {
    this.assert(); const controller = new AbortController();
    const result = await this.channel.request(projectId, 'journal-sessions', null, controller.signal); this.assert();
    if (!result || typeof result !== 'object' || !('projectId' in result) || result.projectId !== projectId || !('sessions' in result) || !Array.isArray(result.sessions) || result.sessions.length > 1024) return invalid();
    const output: NativeArchiveSession[] = [], seen = new Set<string>();
    for (const row of result.sessions) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^session-[a-f0-9-]{36}$/.test(row.id) || seen.has(row.id) || typeof row.label !== 'string' || row.label.length > 120) return invalid(); seen.add(row.id);
      if(row.parentSessionId!==undefined&&row.parentSessionId!==null&&(typeof row.parentSessionId!=='string'||!/^session-[a-f0-9-]{36}$/.test(row.parentSessionId))||row.rootSessionId!==undefined&&(typeof row.rootSessionId!=='string'||!/^session-[a-f0-9-]{36}$/.test(row.rootSessionId)))return invalid();
      const first = await this.page(projectId, row.id, { seq: -1, offset: 0 }, null, controller.signal);
      output.push({ id: row.id, label: row.label, endSeq: first.endSeq,...(row.parentSessionId===undefined?{}:{parentSessionId:row.parentSessionId}),...(row.rootSessionId===undefined?{}:{rootSessionId:row.rootSessionId}), raw: Readable.from(this.bytes(projectId, row.id, first)), markdown: Readable.from(this.markdown(projectId, row.id, row.label, first)) });
    }
    return output;
  }
}
