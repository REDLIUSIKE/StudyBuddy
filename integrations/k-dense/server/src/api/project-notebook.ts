/** Shared project notebook aggregation and exports; live session discovery is injected. */
import type { FastifyInstance } from "fastify";
import { getProject, resolvePaths, type ProjectPaths } from "../projects.ts";
import { readProjectNotebooks } from "../agent/notebook-store.ts";
import { withNotebookArtifactHealth } from "../agent/notebook-artifacts.ts";
import { withNotebookPlanHistory } from "../agent/notebook-research.ts";
import { readNotebookAnnotations } from "../agent/notebook-annotations.ts";
import { notebookToMarkdown } from "../agent/notebook-export.ts";
import { buildNotebookZip } from "../agent/notebook-zip.ts";

export interface ProjectNotebookOwner {
  listSessions(paths: ProjectPaths): Promise<ReadonlyArray<{ id: string; name?: string; firstMessage?: string }>>;
  requireProject?(projectId: string): void | Promise<void>;
}

/** Preserve stored notebook and annotation semantics under the caller's project admission. */
export async function registerProjectNotebookRoutes(app: FastifyInstance, owner: ProjectNotebookOwner): Promise<void> {
  await app.register(async child => {
    if (owner.requireProject) child.addHook("preHandler", async request => {
      await owner.requireProject!((request.params as { projectId: string }).projectId);
    });
    const app = child;
  // Project-wide lab notebook: every session's entries merged into one
  // chronological list (sessionId stamped per entry so the client can insert
  // session dividers), plus a per-session summary for divider headers.
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/notebook", async (req, reply) => {
    try {
      const notebooks = readProjectNotebooks(req.params.projectId);
      reply.header("Cache-Control", "no-store");
      const entries = withNotebookPlanHistory(await withNotebookArtifactHealth(notebooks
        .flatMap((nb) => nb.entries.map((e) => ({ ...e, sessionId: nb.sessionId })))
        .sort((a, b) => a.timestamp - b.timestamp || a.sessionId.localeCompare(b.sessionId)), req.params.projectId), req.params.projectId);
      const sessions = notebooks
        .filter((nb) => nb.entries.length > 0)
        .map((nb) => ({
          sessionId: nb.sessionId,
          entryCount: nb.entries.length,
          firstTimestamp: nb.entries[0].timestamp,
          lastTimestamp: nb.entries[nb.entries.length - 1].timestamp,
        }));
      return { entries, sessions };
    } catch (err) {
      reply.code(400);
      return { detail: (err as Error).message };
    }
  });

  // Project-scope export, the "All chats" counterpart to
  // /sessions/:id/notebook/export. Same three formats, merged across every
  // session, with each chat's annotation sidecar folded in — the session route
  // would silently export only the active chat's slice of what's on screen.
  app.get<{ Params: { projectId: string }; Querystring: { format?: string } }>(
    "/projects/:projectId/notebook/export",
    async (req, reply) => {
      const format = req.query.format ?? "md";
      if (format !== "md" && format !== "json" && format !== "zip") {
        reply.code(400);
        return { detail: "format must be md, json, or zip (PDF is exported client-side)" };
      }
      const projectId = req.params.projectId;
      try {
        const notebooks = readProjectNotebooks(projectId);
        reply.header("Cache-Control", "no-store");
        const entries = withNotebookPlanHistory(await withNotebookArtifactHealth(notebooks
          .flatMap((nb) => nb.entries.map((e) => ({ ...e, sessionId: nb.sessionId })))
          .sort((a, b) => a.timestamp - b.timestamp || a.sessionId.localeCompare(b.sessionId)), projectId), projectId);
        const annotations = notebooks.flatMap(
          (nb) => readNotebookAnnotations(nb.sessionId, projectId).doc.annotations.map((a) => ({ ...a, sessionId: nb.sessionId })),
        );
        const paths = resolvePaths(projectId);
        const projectName = getProject(projectId)?.name ?? projectId;

        // Label chats the way the UI does: title, else first message, else id.
        const sessionLabels = new Map<string, string>();
        for (const info of await owner.listSessions(paths)) {
          const raw = (info.name ?? info.firstMessage ?? info.id ?? "").trim();
          sessionLabels.set(info.id, raw.length > 60 ? raw.slice(0, 57) + "…" : raw || info.id);
        }
        for (const nb of notebooks) {
          if (!sessionLabels.has(nb.sessionId)) sessionLabels.set(nb.sessionId, nb.sessionId);
        }

        const attachment = (ext: string) =>
          reply.header(
            "Content-Disposition",
            `attachment; filename="lab-notebook-${projectId}.${ext}"`,
          );
        if (format === "json") {
          reply.header("Content-Type", "application/json; charset=utf-8");
          attachment("json");
          return {
            projectId,
            projectName,
            sessions: [...sessionLabels].map(([id, label]) => ({ id, label })),
            entries,
            annotations,
          };
        }
        if (format === "zip") {
          const { buffer } = buildNotebookZip(entries, {
            projectName,
            sandboxRoot: paths.sandbox,
            annotations,
            sessionLabels,
          });
          reply.type("application/zip");
          attachment("zip");
          return buffer;
        }
        const md = notebookToMarkdown(entries, { projectName, annotations, sessionLabels });
        reply.header("Content-Type", "text/markdown; charset=utf-8");
        attachment("md");
        return md;
      } catch (err) {
        reply.code(400);
        return { detail: (err as Error).message };
      }
    },
  );

  });
}
