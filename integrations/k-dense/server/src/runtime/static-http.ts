/** Static isolated React document and the original SHA-pinned Office cache. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OFFICE_ASSETS, OFFICE_BUILD } from '../../../web/src/lib/office-assets.ts';
import { isWithin } from '../sandbox-fs.ts';

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.dic': 'text/plain; charset=utf-8', '.aff': 'text/plain; charset=utf-8', '.bcif': 'application/octet-stream' };
function plain(response: ServerResponse, status: number, message: string) { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); response.end(message); }
function assertLocal(file: string) {
  for (let current = path.resolve(file);;) {
    const info = fs.lstatSync(current); if (info.isSymbolicLink()) throw Error('RESEARCH_STATIC_PATH_DENIED');
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
export function createStaticResearchHandler(staticDirectory: string) {
  const root = path.resolve(staticDirectory), controller = new AbortController();
  assertLocal(root); assertLocal(path.join(root, 'index.html'));
  const pending = new Map<string, Promise<string>>(), verified = new Map<string, string>();
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  async function officeAsset(name: string): Promise<string> {
    const cache = process.env.KADY_OFFICE_ASSETS_DIR || path.join(os.homedir(), '.kady', 'office-assets', OFFICE_BUILD);
    const file = path.join(cache, name), spec = OFFICE_ASSETS[name];
    await fs.promises.mkdir(cache, { recursive: true }); assertLocal(cache);
    try {
      assertLocal(file); const stat = await fs.promises.stat(file);
      const version = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (verified.get(file) === version) return file;
      if (hash(await fs.promises.readFile(file)) === spec.sha256) { verified.set(file, version); return file; }
    } catch (error) { if ((error as Error).message === 'RESEARCH_STATIC_PATH_DENIED') throw error; }
    const response = await fetch(`https://cdn.zetaoffice.net/zetaoffice_latest/${name}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]) });
    if (!response.ok || !response.body) throw Error('Could not download the Office editor. Check your connection and retry.');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length; if (size > (spec.size || 1_000_000) + 1024) throw Error('Unexpected Office runtime size'); chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks); if (hash(bytes) !== spec.sha256) throw Error('The Office runtime download differs from the tested version. Update Kady or retry later.');
    controller.signal.throwIfAborted(); const staging = `${file}.${randomUUID()}.tmp`;
    try { await fs.promises.writeFile(staging, bytes, { flag: 'wx' }); assertLocal(cache); await fs.promises.rename(staging, file); }
    finally { await fs.promises.rm(staging, { force: true }); }
    return file;
  }
  async function serveFile(request: IncomingMessage, response: ServerResponse, file: string, headers: Record<string, string> = {}) {
    assertLocal(file); const stat = await fs.promises.stat(file); if (!stat.isFile()) { plain(response, 404, 'Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': String(stat.size), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', ...headers });
    if (request.method === 'HEAD') response.end(); else await pipeline(fs.createReadStream(file), response);
  }
  return {
    async serve(request: IncomingMessage, response: ServerResponse) {
      if (request.method !== 'GET' && request.method !== 'HEAD') { plain(response, 405, 'Method not allowed'); return; }
      let pathname: string;
      try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://research.invalid').pathname); }
      catch { plain(response, 400, 'Invalid path'); return; }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '.' || part === '..')) { plain(response, 403, 'Path denied'); return; }
      if (pathname.startsWith('/office-assets/')) {
        const parts = pathname.split('/'); const name = parts[3];
        if (parts.length !== 4 || parts[2] !== OFFICE_BUILD || !Object.hasOwn(OFFICE_ASSETS, name)) { plain(response, 404, 'Not found'); return; }
        let job = pending.get(name); if (!job) { job = officeAsset(name); pending.set(name, job); void job.finally(() => pending.delete(name)).catch(() => {}); }
        try { await serveFile(request, response, await job, { 'Content-Type': OFFICE_ASSETS[name].type, 'Cache-Control': 'public, max-age=31536000, immutable' }); }
        catch (error) { if (!response.headersSent) plain(response, 503, error instanceof Error ? error.message : 'Office runtime unavailable'); }
        return;
      }
      const index = pathname === '/' || pathname === '/office';
      if (!index && !/^\/(assets|brand|dict|office|licenses)\/.+/.test(pathname)) { plain(response, 404, 'Not found'); return; }
      const file = index ? path.join(root, 'index.html') : path.resolve(root, '.' + pathname);
      if (!isWithin(root, file)) { plain(response, 403, 'Path denied'); return; }
      const headers: Record<string, string> = { 'Cache-Control': index ? 'no-store' : 'public, max-age=31536000, immutable' };
      if (pathname === '/office' || pathname.startsWith('/office/')) { headers['Cross-Origin-Opener-Policy'] = 'same-origin'; headers['Cross-Origin-Embedder-Policy'] = 'require-corp'; }
      try { await serveFile(request, response, file, headers); }
      catch (error) { if (!response.headersSent) plain(response, (error as Error).message === 'RESEARCH_STATIC_PATH_DENIED' ? 403 : 404, 'Not found'); }
    },
    async close() { controller.abort(); await Promise.allSettled(pending.values()); },
  };
}
