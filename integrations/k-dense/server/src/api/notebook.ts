/** Shared notebook reads, conflict-checked user annotations and portable exports. */
import type { FastifyInstance } from "fastify";
import { currentProjectId } from "../scope.ts";
import { activePaths, getProject, touchProject } from "../projects.ts";
import { SandboxError } from "../sandbox-fs.ts";
import { readNotebookEntries } from "../agent/notebook-store.ts";
import { withNotebookArtifactHealth } from "../agent/notebook-artifacts.ts";
import { withNotebookPlanHistory } from "../agent/notebook-research.ts";
import { readNotebookAnnotations, normalizeNotebookAnnotations, writeNotebookAnnotations } from "../agent/notebook-annotations.ts";
import { notebookToMarkdown } from "../agent/notebook-export.ts";
import { buildNotebookZip } from "../agent/notebook-zip.ts";
export interface NotebookRouteOwner { requireSession(id: string): Promise<void>; refresh?(id: string): Promise<void> }
/** Register the original handlers under an optional native owner. */
export async function registerNotebookRoutes(app: FastifyInstance, owner?: NotebookRouteOwner): Promise<void> {
  await app.register(async child => {
    if (owner) child.addHook("preHandler", async request => {
      const params = request.params as { id: string };
      await owner.requireSession(params.id);
      if (request.method === "GET" && (request.url.includes("/notebook?") || request.url.endsWith("/notebook") || request.url.includes("/notebook/export"))) await owner.refresh?.(params.id);
    });
    const app = child;
  app.get<{ Params: { id: string } }>("/sessions/:id/notebook", async (req, reply) => {
    try {
      reply.header("Cache-Control", "no-store");
      const projectId = currentProjectId();
      return { entries: withNotebookPlanHistory(await withNotebookArtifactHealth(readNotebookEntries(req.params.id, projectId), projectId), projectId, req.params.id) };
    } catch (exc) {
      reply.code(400);
      return { detail: (exc as Error).message };
    }
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/sessions/:id/notebook/export",
    async (req, reply) => {
      const format = req.query.format ?? "md";
      if (format !== "md" && format !== "json" && format !== "zip") {
        reply.code(400);
        return { detail: "format must be md, json, or zip (PDF is exported client-side)" };
      }
      try {
        const projectId = currentProjectId();
        const entries = withNotebookPlanHistory(await withNotebookArtifactHealth(readNotebookEntries(req.params.id, projectId), projectId), projectId, req.params.id);
        reply.header("Cache-Control", "no-store");
        const projectName = getProject(projectId)?.name ?? projectId;
        // Pins, comments and standalone notes live in a sidecar. Leaving them
        // out made every export silently drop the user's own layer.
        const { doc: annotationsDoc } = readNotebookAnnotations(req.params.id, projectId);
        const annotations = annotationsDoc.annotations;
        const attachment = (ext: string) =>
          reply.header(
            "Content-Disposition",
            `attachment; filename="lab-notebook-${req.params.id}.${ext}"`,
          );
        if (format === "json") {
          reply.header("Content-Type", "application/json; charset=utf-8");
          attachment("json");
          return { sessionId: req.params.id, projectName, entries, annotations };
        }
        if (format === "zip") {
          const { buffer } = buildNotebookZip(entries, {
            sessionId: req.params.id,
            projectName,
            sandboxRoot: activePaths().sandbox,
            annotations,
          });
          reply.type("application/zip");
          attachment("zip");
          return buffer;
        }
        const md = notebookToMarkdown(entries, {
          sessionId: req.params.id,
          projectName,
          annotations,
        });
        reply.header("Content-Type", "text/markdown; charset=utf-8");
        attachment("md");
        return md;
      } catch (exc) {
        reply.code(400);
        return { detail: (exc as Error).message };
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/notebook/annotations",
    async (req, reply) => {
      try {
        reply.header("Cache-Control", "no-store");
        const { doc, mtime, etag } = readNotebookAnnotations(req.params.id, currentProjectId());
        if (mtime) reply.header("Last-Modified", mtime.toUTCString());
        if (etag) reply.header("ETag", etag);
        return doc;
      } catch (err) {
        if (err instanceof SandboxError) {
          reply.code(err.statusCode);
          return { detail: err.message };
        }
        throw err;
      }
    },
  );

  app.put<{ Params: { id: string }; Body: unknown }>(
    "/sessions/:id/notebook/annotations",
    async (req, reply) => {
      try {
        const projectId = currentProjectId();
        const { mtime, etag } = readNotebookAnnotations(req.params.id, projectId);
        const ifMatch = req.headers["if-match"] ? String(req.headers["if-match"]) : null;
        const ifUnmodifiedSince = req.headers["if-unmodified-since"];
        if (ifMatch) {
          // Exact check. The Last-Modified fallback below can only compare
          // whole seconds, so a same-second edit would slip through it.
          if (ifMatch === "*" ? !etag : ifMatch !== etag) {
            reply.code(412);
            return { detail: "Sidecar modified; re-read and retry" };
          }
        } else if (ifUnmodifiedSince && mtime) {
          const since = new Date(String(ifUnmodifiedSince)).getTime();
          if (
            !Number.isNaN(since) &&
            Math.floor(mtime.getTime() / 1000) > Math.floor(since / 1000)
          ) {
            reply.code(412);
            return { detail: "Sidecar modified; re-read and retry" };
          }
        }
        const doc = normalizeNotebookAnnotations(req.body);
        const saved = writeNotebookAnnotations(req.params.id, doc, projectId);
        touchProject(projectId);
        reply.header("Last-Modified", saved.mtime.toUTCString());
        if (saved.etag) reply.header("ETag", saved.etag);
        return { saved: req.params.id, count: doc.annotations.length };
      } catch (err) {
        if (err instanceof SandboxError) {
          reply.code(err.statusCode);
          return { detail: err.message };
        }
        throw err;
      }
    },
  );


  });
}
