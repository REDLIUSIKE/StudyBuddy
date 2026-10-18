/** The original Automation panel controls account-owned native Schedule targets. */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { currentProjectId } from '../scope.ts';
import type { RuntimeContext } from '../runtime/contracts.ts';
import type { NativeResearchSchedules } from '../runtime/native-schedules.ts';
interface Owner { schedules: NativeResearchSchedules; current(): boolean; context(projectId: string): Promise<RuntimeContext> }
function status(error: unknown): number { const code = error instanceof Error ? error.message : String(error); return /BUDGET_REACHED/.test(code) ? 402 : /NOT_FOUND/.test(code) ? 404 : /REVOKED|OWNER_DENIED/.test(code) ? 403 : /INPUT_INVALID/.test(code) ? 400 : /UNCONFIRMED|ACTIVE_RUN/.test(code) ? 409 : 502; }
/** @param app - Admitted embedded server. @param owner - Private project binder and native relay. @returns Registered original panel routes. */
export async function registerNativeScheduleRoutes(app: FastifyInstance, owner: Owner): Promise<void> {
  const context = async () => { const projectId = currentProjectId(), binding = await owner.context(projectId); if (!owner.current() || binding.projectId !== projectId) throw Error('RESEARCH_CONTEXT_REVOKED'); return binding; };
  app.get('/schedules', async (_request, reply) => { try { const binding = await context(); return await owner.schedules.list(binding.projectId, binding.sessionRef); } catch (error) { return reply.code(status(error)).send({ detail: error instanceof Error ? error.message : String(error) }); } });
  app.post('/schedules/ensure-host', async (_request, reply) => { try { const binding = await context(); return await owner.schedules.ensureHost(binding.projectId, binding.sessionRef); } catch (error) { return reply.code(status(error)).send({ detail: error instanceof Error ? error.message : String(error) }); } });
  app.get<{ Params: { id: string } }>('/schedules/:id/history', async (request, reply) => { try { const binding = await context(); return await owner.schedules.control(binding.projectId, binding.sessionRef, randomUUID(), 'history', request.params.id); } catch (error) { return reply.code(status(error)).send({ detail: error instanceof Error ? error.message : String(error) }); } });
  app.post<{ Params: { id: string; action: string } }>('/schedules/:id/:action', async (request, reply) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(request.params.id) || !['pause', 'resume', 'run', 'delete'].includes(request.params.action) || request.body !== undefined && (request.body === null || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length)) return reply.code(400).send({ detail: 'RESEARCH_SCHEDULE_INPUT_INVALID' });
    try { const binding = await context(); await owner.schedules.control(binding.projectId, binding.sessionRef, randomUUID(), request.params.action, request.params.id); return { ok: true, message: `Schedule ${request.params.action} accepted.`, ...(await owner.schedules.list(binding.projectId, binding.sessionRef)) }; }
    catch (error) { return reply.code(status(error)).send({ detail: error instanceof Error ? error.message : String(error) }); }
  });
}
