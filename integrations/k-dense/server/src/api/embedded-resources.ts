/** Preserve upstream resource editors and scientific records; model execution remains native. */
import type { FastifyInstance } from 'fastify';
import type { RuntimeContext } from '../runtime/contracts.ts';
import { registerPromptRoutes } from './prompts.ts';
import { registerSkillRoutes } from './skills.ts';
import { registerEvidencePackageRoutes } from './evidence-packages.ts';
import { registerNotebookRobustnessRoutes } from './notebook-robustness.ts';
import { registerModalRoutes } from './modal.ts';
import { currentProjectId } from '../scope.ts';
interface Owner { context(projectId: string): Promise<RuntimeContext>; current(): boolean }
/** Register non-model source modules; compute callers are stamped from private native ownership. */
export async function registerEmbeddedResourceRoutes(app: FastifyInstance, owner?: Owner): Promise<void> {
  await registerPromptRoutes(app); await registerSkillRoutes(app);
  await registerEvidencePackageRoutes(app); await registerNotebookRobustnessRoutes(app);
  await registerModalRoutes(app, { owner: async body => {
    if (!owner?.current()) throw Error('RESEARCH_COMPUTE_ADMISSION_UNAVAILABLE');
    const context = await owner.context(currentProjectId());
    if (!owner.current() || context.projectId !== currentProjectId()) throw Error('RESEARCH_CONTEXT_REVOKED');
    if (body.subagentRunId !== undefined || body.subagent_run_id !== undefined || body.subagentSessionFile !== undefined || body.subagent_session_file !== undefined ||
      ((body.sessionId ?? body.session_id) !== undefined && (body.sessionId ?? body.session_id) !== context.sessionRef)) throw Error('RESEARCH_COMPUTE_OWNER_INVALID');
    return { sessionId: context.sessionRef, submittedBy: 'api' };
  } });
}
