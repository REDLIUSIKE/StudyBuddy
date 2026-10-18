/** Original specialist panel paths backed by owned native operations. */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { NativeAdvancedWorkflows } from '../runtime/native-advanced.ts';
import { currentProjectId } from '../scope.ts';
function failure(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'RESEARCH_SPECIALIST_INPUT_INVALID') return reply.code(400).send({ detail: code });
  if (['RESEARCH_SPECIALIST_SESSION_DENIED', 'RESEARCH_SPECIALIST_RUN_DENIED', 'RESEARCH_CONTEXT_REVOKED'].includes(code)) return reply.code(403).send({ detail: code });
  return reply.code(502).send({ detail: 'RESEARCH_SPECIALIST_CONTROL_UNAVAILABLE' });
}
export async function registerNativeFleetRoutes(app: FastifyInstance, advanced: NativeAdvancedWorkflows) {
  app.get('/subagents/sessions', async (_request, reply) => {
    try { return await advanced.fleetSessions(currentProjectId()); } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string } }>('/sessions/:id/subagents', async (request, reply) => {
    try { return await advanced.fleet(currentProjectId(), request.params.id); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string; action: string }; Body: unknown }>('/sessions/:id/subagents/:action', async (request, reply) => {
    try { return await advanced.fleetControl(currentProjectId(), request.params.id, randomUUID(), request.params.action, request.body); } catch (error) { return failure(reply, error); }
  });
}
