/** Browser mission controls reuse the same project-owned records as native tools. */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RuntimeContext } from '../runtime/contracts.ts';
import type { NativeResearchMissions } from '../runtime/native-missions.ts';
import { currentProjectId } from '../scope.ts';
interface Owner { missions: NativeResearchMissions; current(): boolean; context(projectId: string): Promise<RuntimeContext> }
export async function registerNativeMissionRoutes(app: FastifyInstance, owner: Owner) {
  app.get('/missions', async () => ({ missions: await owner.missions.refresh(currentProjectId()) }));
  app.post<{ Params: { id: string }; Body: { status?: unknown; summary?: unknown } }>('/missions/:id/close', async (request, reply) => {
    const body = request.body ?? {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(request.params.id) || Object.keys(body).some(key => !['status', 'summary'].includes(key)) || body.status !== undefined && !['completed', 'failed', 'cancelled'].includes(String(body.status)) || body.summary !== undefined && (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 2000)) return reply.code(400).send({ detail: 'RESEARCH_MISSION_INPUT_INVALID' });
    const projectId = currentProjectId();
    const mission=owner.missions.list(projectId).find(row=>row.id===request.params.id);
    if (!mission) return reply.code(404).send({ detail: 'RESEARCH_MISSION_NOT_FOUND' });
    const context = await owner.context(projectId);
    if (!owner.current() || context.projectId !== projectId) return reply.code(403).send({ detail: 'RESEARCH_CONTEXT_REVOKED' });
    await owner.missions.close(projectId, mission.ownerSessionId??context.sessionRef, randomUUID(), request.params.id, String(body.status ?? 'cancelled'), String(body.summary ?? 'Closed from the Automation panel.'));
    return { ok: true, missions: owner.missions.list(projectId) };
  });
}
