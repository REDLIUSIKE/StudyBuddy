/**
 * Project CRUD endpoints — TS port of the projects_router in kady_agent/projects.py.
 * Costs and sandbox/init endpoints are added in later phases.
 */
import type { FastifyInstance } from "fastify";
import { registerProjectNotebookRoutes } from "./project-notebook.ts";
import { DEFAULT_PROJECT_ID } from "../config.ts";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  UNSET,
  resolvePaths,
  type UpdateProjectInput,
} from "../projects.ts";
import { projectCostSummary } from "../cost/ledger.ts";
import { seedProjectSkills } from "../agent/skills.ts";
import { runBroker } from "../agent/run-broker.ts";
import {
  abortProjectSessions,
  disposeProjectSessions,
  listSessions,
} from "../agent/session-registry.ts";
import { agentsMdStatus, restoreAgentsMd, syncSandboxVenv } from "../sandbox-seed.ts";
import { listProjectActivities } from "../project-activity.ts";
import { modalJobManager } from "../modal/manager.ts";
import {
  COMPACTION_BOUNDS,
  readCompactionSettings,
  validateCompactionPatch,
  writeCompactionSettings,
} from "../agent/compaction-settings.ts";
import {
  readGuardPolicy,
  validateGuardPolicyPatch,
  writeGuardPolicy,
} from "../agent/guard-policy.ts";

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", async () => listProjects());

  app.get("/projects/activity", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return { activities: await listProjectActivities() };
  });

  app.post("/projects", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const meta = createProject({
        name: String(body.name ?? ""),
        description: body.description ? String(body.description) : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        projectId: body.id ? String(body.id) : undefined,
        spendLimitUsd:
          body.spendLimitUsd === undefined
            ? undefined
            : (body.spendLimitUsd as number | null),
      });
      reply.code(201);
      return meta;
    } catch (err) {
      reply.code(400);
      return { detail: (err as Error).message };
    }
  });

  app.get<{ Params: { projectId: string } }>("/projects/:projectId", async (req, reply) => {
    const meta = getProject(req.params.projectId);
    if (!meta) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    return meta;
  });

  app.patch<{ Params: { projectId: string } }>("/projects/:projectId", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: UpdateProjectInput = {};
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.tags !== undefined) patch.tags = (body.tags as unknown[]).map(String);
    if (body.archived !== undefined) patch.archived = Boolean(body.archived);
    // Distinguish "absent" (leave alone) from "null" (clear the cap).
    patch.spendLimitUsd = "spendLimitUsd" in body
      ? (body.spendLimitUsd as number | null)
      : UNSET;
    try {
      return updateProject(req.params.projectId, patch);
    } catch (err) {
      reply.code(404);
      return { detail: (err as Error).message };
    }
  });

  // Per-project context-compaction knobs (stored in sandbox/.pi/settings.json).
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/compaction", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    return { ...readCompactionSettings(resolvePaths(req.params.projectId)), bounds: COMPACTION_BOUNDS };
  });

  app.put<{ Params: { projectId: string } }>("/projects/:projectId/compaction", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    const error = validateCompactionPatch(req.body);
    if (error) {
      reply.code(400);
      return { detail: error };
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const written = writeCompactionSettings(resolvePaths(req.params.projectId), {
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(typeof body.reserveTokens === "number" ? { reserveTokens: body.reserveTokens } : {}),
      ...(typeof body.keepRecentTokens === "number" ? { keepRecentTokens: body.keepRecentTokens } : {}),
    });
    if (!written) {
      reply.code(409);
      return { detail: "sandbox/.pi/settings.json is not valid JSON; fix it before changing compaction settings" };
    }
    return { ...written, bounds: COMPACTION_BOUNDS };
  });

  // Raw-data guard policy (sandbox/.kady/policy.json; read by lead and children).
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/guard-policy", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    return readGuardPolicy(resolvePaths(req.params.projectId).sandbox);
  });

  app.put<{ Params: { projectId: string } }>("/projects/:projectId/guard-policy", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    const error = validateGuardPolicyPatch(req.body);
    if (error) {
      reply.code(400);
      return { detail: error };
    }
    const body = req.body as { protectedPaths?: string[]; destructiveConfirm?: boolean };
    return writeGuardPolicy(resolvePaths(req.params.projectId).sandbox, body);
  });

  // Sandbox AGENTS.md: is it the shipped text, an older version, or user-edited?
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/instructions", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    return { status: agentsMdStatus(resolvePaths(req.params.projectId)) };
  });

  app.post<{ Params: { projectId: string } }>("/projects/:projectId/instructions/restore", async (req, reply) => {
    if (!getProject(req.params.projectId)) {
      reply.code(404);
      return { detail: "Project not found" };
    }
    const paths = resolvePaths(req.params.projectId);
    restoreAgentsMd(paths);
    return { status: agentsMdStatus(paths) };
  });

  app.get<{ Params: { projectId: string } }>("/projects/:projectId/costs", async (req) => {
    return projectCostSummary(req.params.projectId);
  });

  await registerProjectNotebookRoutes(app, { listSessions });

  // Heavier per-project bootstrap (seed scientific skills). The frontend posts
  // here with the project in the path; also available unprefixed at /sandbox/init.
  app.post<{ Params: { projectId: string }; Body: { sync_venv?: boolean; download_skills?: boolean } }>(
    "/projects/:projectId/sandbox/init",
    async (req) => {
      const body = req.body ?? {};
      const paths = resolvePaths(req.params.projectId);
      const allowRemote = body.download_skills !== false;
      const count = await seedProjectSkills(paths, allowRemote);
      const venvSynced = body.sync_venv ? syncSandboxVenv(paths) : false;
      return { ok: true, skills: count, venvSynced };
    },
  );

  app.delete<{ Params: { projectId: string } }>("/projects/:projectId", async (req, reply) => {
    const projectId = req.params.projectId;
    try {
      if (projectId === DEFAULT_PROJECT_ID) {
        throw new Error("The default project cannot be deleted");
      }
      const activeRuns = runBroker.activeForProject(projectId);
      for (const run of activeRuns) run.requestAbort();
      // Remote jobs are project-owned and their metadata lives under the
      // project sandbox. Terminate/reconcile them before deleting that state.
      await modalJobManager.cancelProject(projectId);
      await abortProjectSessions(projectId);
      await Promise.all(activeRuns.map((run) => run.waitForCompletion()));
      // Releasing a session emits session_shutdown, which closes its MCP connections.
      await disposeProjectSessions(projectId);
      deleteProject(projectId);
      modalJobManager.resumeProject(projectId);
      reply.code(204);
      return null;
    } catch (err) {
      modalJobManager.resumeProject(projectId);
      reply.code(400);
      return { detail: (err as Error).message };
    }
  });
}
