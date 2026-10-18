/** Existing scientific endpoints, with native execution instead of a second Pi agent. */
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { currentProjectId } from "../scope.ts";
import { registerNotebookRoutes } from "./notebook.ts";
import { assertResearchPath } from "../runtime/project-storage.ts";
import { resolvePaths } from "../projects.ts";
import type { NativeScientificHelpers } from "../runtime/native-scientific-helpers.ts";
import type { RuntimeContext } from "../runtime/contracts.ts";
import { registerNextExperimentRoutes } from "./next-experiments.ts";
import { registerNotebookResearchRoutes } from "./notebook-research.ts";
import { registerNotebookMemoryRoutes } from "./notebook-memory.ts";
import { registerProjectNotebookRoutes } from "./project-notebook.ts";
import { listStoredPiSessions } from "../agent/session-files.ts";

/** @param app - Admitted local server. @param helpers - Native scientific execution adapter. @param context - Private native project lookup. */
export async function registerEmbeddedScientificRoutes(app: FastifyInstance, helpers: NativeScientificHelpers, context: (projectId: string) => Promise<RuntimeContext>, refresh?: (context: RuntimeContext) => Promise<void>) {
  const owned = async (id: string) => { if ((await context(currentProjectId())).sessionRef !== id) throw Object.assign(Error("RESEARCH_SESSION_NOT_OWNED"), { statusCode: 404 }); };
  await registerProjectNotebookRoutes(app, { listSessions: listStoredPiSessions, requireProject: projectId => {
    if (projectId !== currentProjectId()) throw Object.assign(Error("RESEARCH_PROJECT_CONFLICT"), { statusCode: 403 });
    const paths = resolvePaths(projectId);
    for (const directory of [paths.notebookDir, paths.sessionsDir]) {
      assertResearchPath(directory);
      let files: string[];
      try { files = fs.readdirSync(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      for (const file of files) if (file.endsWith(".jsonl") || file.endsWith(".annotations.json")) assertResearchPath(path.join(directory, file));
    }
  } });
  await registerNotebookRoutes(app, { requireSession: async id => {
    await owned(id); const paths = resolvePaths(currentProjectId()); assertResearchPath(paths.notebookDir);
    assertResearchPath(`${paths.notebookDir}/${id}.jsonl`); assertResearchPath(`${paths.notebookDir}/${id}.annotations.json`);
  }, refresh: async () => { await refresh?.(await context(currentProjectId())); } });
  app.post<{ Params: { id: string } }>("/sessions/:id/notebook/methods-draft", async (req, reply) => {
    try { await owned(req.params.id); return await helpers.methodsDraft(req.params.id, currentProjectId(), req.body); }
    catch (error) { return reply.code((error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode ?? 422).send({ detail: "methods-draft-failed", message: (error as Error).message }); }
  });
  await registerNextExperimentRoutes(app, { generate: (projectId, source, input) => helpers.nextExperiments(projectId, source, input) });
  await registerNotebookResearchRoutes(app);
  await registerNotebookMemoryRoutes(app);
}
