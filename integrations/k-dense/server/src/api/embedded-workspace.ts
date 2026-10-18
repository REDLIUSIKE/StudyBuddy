/** Strongly versioned local UI state under the already admitted account/project root. */
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { parseNativeWorkspaceState } from '../../../web/src/lib/native-workspace-state.ts';
import { currentProjectId } from '../scope.ts'; import { resolvePaths } from '../projects.ts';
import { assertResearchPath } from '../runtime/project-storage.ts'; import { atomicJson } from '../atomic-json.ts';
/** No model calls or default-project fallback can be requested through this route. */
export async function registerEmbeddedWorkspaceRoutes(app: FastifyInstance, current: () => boolean): Promise<void> {
  const read = () => {
    if (!current()) throw Error('RESEARCH_CONTEXT_REVOKED');
    const file = path.join(resolvePaths(currentProjectId()).kadyDir, 'embedded-workspace.json'); assertResearchPath(file);
    let state: ReturnType<typeof parseNativeWorkspaceState> | null = null;
    try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.size > 64 * 1024) throw Error('RESEARCH_UI_STATE_INVALID'); state = parseNativeWorkspaceState(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const etag = '"' + createHash('sha256').update(JSON.stringify(state)).digest('hex') + '"'; return { file, state, etag };
  };
  app.get('/research/workspace', async (_req, reply) => { const value = read(); reply.header('Cache-Control', 'no-store').header('ETag', value.etag); return { state: value.state }; });
  app.put('/research/workspace', async (req, reply) => {
    let state: ReturnType<typeof parseNativeWorkspaceState>;
    try { state = parseNativeWorkspaceState(req.body); } catch { return reply.code(400).send({ detail: 'RESEARCH_UI_STATE_INVALID' }); }
    const previous = read(); if (req.headers['if-match'] !== previous.etag) return reply.code(412).send({ detail: 'RESEARCH_UI_STATE_CHANGED' });
    if (!current()) return reply.code(403).send({ detail: 'RESEARCH_CONTEXT_REVOKED' });
    assertResearchPath(previous.file); fs.mkdirSync(path.dirname(previous.file), { recursive: true }); atomicJson(previous.file, state);
    const next = read(); reply.header('Cache-Control', 'no-store').header('ETag', next.etag); return { state: next.state };
  });
}
