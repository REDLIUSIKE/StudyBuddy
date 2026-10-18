/** Read-only legacy Pi metadata; never constructs a model runtime or live agent. */
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { SessionInfo } from '@earendil-works/pi-coding-agent';
import type { ProjectPaths } from '../projects.ts';
export async function listStoredPiSessions(paths: ProjectPaths): Promise<SessionInfo[]> {
  // Pi 1.0.0 discovery metadata, including old headers, explicit title clears,
  // malformed trailing lines and message-time sorting. Never opens/writes a
  // SessionManager or manufactures a new conversation from the archive.
  let files: string[];
  try { files = fs.readdirSync(paths.sessionsDir).filter(file => file.endsWith('.jsonl')).sort((a, b) => b.localeCompare(a)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const sessions: SessionInfo[] = [];
  for (const file of files) {
    const full = path.join(paths.sessionsDir, file);
    const stat = fs.lstatSync(full); if (!stat.isFile() || stat.isSymbolicLink()) continue;
    let header: Record<string, any> | undefined, name: string | undefined, lastTime: number | undefined, count = 0, first = '';
    const all: string[] = [];
    const lines = createInterface({ input: fs.createReadStream(full, { encoding: 'utf8' }), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        let row: Record<string, any>; try { row = JSON.parse(line); } catch { continue; }
        if (!row || typeof row !== 'object') continue;
        if (!header) { if (row.type !== 'session') break; header = row; continue; }
        if (row.type === 'session_info') name = typeof row.name === 'string' ? row.name.trim() || undefined : undefined;
        if (row.type !== 'message') continue; count++;
        const message = row.message; if (!message || !['user', 'assistant'].includes(message.role) || !('content' in message)) continue;
        const time = typeof message.timestamp === 'number' ? message.timestamp : new Date(row.timestamp).getTime();
        if (!Number.isNaN(time)) lastTime = Math.max(lastTime ?? 0, time);
        const text = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text).join(' ') : '';
        if (text) { all.push(text); if (!first && message.role === 'user') first = text; }
      }
    } finally { lines.close(); }
    if (!header || typeof header.id !== 'string') continue;
    const headerTime = new Date(header.timestamp).getTime();
    sessions.push({ path: full, id: header.id, cwd: typeof header.cwd === 'string' ? header.cwd : '', name, parentSessionPath: header.parentSession,
      created: new Date(header.timestamp), modified: lastTime && lastTime > 0 ? new Date(lastTime) : !Number.isNaN(headerTime) ? new Date(headerTime) : stat.mtime,
      messageCount: count, firstMessage: first || '(no messages)', allMessagesText: all.join(' ') });
  }
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
