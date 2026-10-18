/** Native-owned loopback admission; no standalone environment, Pi agent or provider is initialized. */
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { EmbeddedProjectStorage } from "./runtime/project-storage.ts";
import { withActiveProject } from "./scope.ts";
import type { AssistRequest } from "./latex/assist.ts";
import type { ResearchRuntime, RuntimeContext } from "./runtime/contracts.ts";

export interface EmbeddedBootstrap {
  projectsRoot: string;
  guestAuthorization: string;
  /** Exact local workbench origin, assigned by the private process owner. */
  origin(): string | undefined;
  isCurrent(): boolean;
  context?(projectId: string): Promise<RuntimeContext | undefined>;
  runtime?: ResearchRuntime;
  beforeDelete?(projectId: string): Promise<void>;
  /** Adapter preserves reviewed LaTeX replacement/needs-context behavior. */
  latexAssist?(request: AssistRequest, projectId: string): Promise<unknown>;
  archive?(projectId: string): Promise<Pick<import('./project-archive.ts').ProjectArchiveOptions, 'sessions' | 'nativeSessions'>>;
  registerFeatures?(app: FastifyInstance): Promise<void>;
}

const projectless = (url: string) => /^\/(health|research\/profile|credentials|research\/services|mcp\/paperclip|projects(?:\/[^/]+)?)(?:\?|$)/.test(url);

/** Build only after the private owner admits the root and process generation. */
export async function buildEmbeddedApp(options: EmbeddedBootstrap): Promise<FastifyInstance> {
  if (!options.isCurrent() || !/^[a-f0-9]{64}$/.test(options.guestAuthorization)) throw Error("RESEARCH_HOST_REQUIRED");
  const storage = new EmbeddedProjectStorage(options.projectsRoot);
  const app = Fastify({ logger: false, bodyLimit: 96 * 1024 * 1024 });
  app.addHook("onRequest", (req, reply, done) => {
    const origin = options.origin();
    const supplied = req.headers["x-studybuddy-research-guest"];
    const expected = Buffer.from(options.guestAuthorization);
    if (!origin || !options.isCurrent() || req.headers.host !== new URL(origin).host ||
        (req.headers.origin !== undefined && req.headers.origin !== origin) ||
        typeof supplied !== "string" || Buffer.byteLength(supplied) !== expected.length || !timingSafeEqual(Buffer.from(supplied), expected)) {
      reply.code(403).send({ detail: "RESEARCH_GUEST_REVOKED" }); return;
    }
    if (projectless(req.url)) { done(); return; }
    const query = req.query as Record<string, unknown> | undefined;
    const candidates = [req.headers["x-project-id"], query?.project].filter(value => value !== undefined);
    if (candidates.length > 1 && candidates.some(value => value !== candidates[0])) {
      reply.code(400).send({ detail: "RESEARCH_PROJECT_CONFLICT" }); return;
    }
    if (candidates.length === 0) {
      if (projectless(req.url)) done();
      else reply.code(400).send({ detail: "RESEARCH_PROJECT_REQUIRED" });
      return;
    }
    try { const id = storage.requireId(candidates[0]); withActiveProject(id, () => done()); }
    catch (error) { reply.code((error as { statusCode?: number }).statusCode ?? 403).send({ detail: (error as Error).message }); }
  });
  app.addHook("preHandler", async (_req, reply) => {
    if (!options.isCurrent()) await reply.code(403).send({ detail: "RESEARCH_GUEST_REVOKED" });
  });
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.get("/health", async () => ({ status: "ok", runtimeProfile: "studybuddy" }));
  app.get("/research/profile", async () => ({ runtimeProfile: "studybuddy", brand: "StudyBuddy", modelControls: "native", accounting: "gateway-cny" }));
  app.get("/projects", async () => storage.list());
  app.post("/projects", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body.name !== "string" || !body.name.trim()) return reply.code(400).send({ detail: "Project name is required" });
    // The native CNY cap has its own exact ledger adapter; never interpret a USD cap as CNY.
    if (body.spendLimitUsd !== undefined && body.spendLimitUsd !== null) return reply.code(422).send({ detail: "Use the native project budget control" });
    const meta = storage.create({ name: body.name, ...(typeof body.id === "string" ? { projectId: body.id } : {}),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(Array.isArray(body.tags) && body.tags.every(tag => typeof tag === "string") ? { tags: body.tags } : {}) });
    return reply.code(201).send(meta);
  });
  app.get<{ Params: { projectId: string } }>("/projects/:projectId", async req => storage.get(req.params.projectId));
  app.patch<{ Params: { projectId: string } }>("/projects/:projectId", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body || Object.keys(body).some(key => !["name", "description", "tags", "archived"].includes(key))) return reply.code(422).send({ detail: "Unsupported project edit" });
    if ((body.name !== undefined && typeof body.name !== "string") || (body.description !== undefined && typeof body.description !== "string") ||
      (body.archived !== undefined && typeof body.archived !== "boolean") || (body.tags !== undefined && (!Array.isArray(body.tags) || !body.tags.every(tag => typeof tag === "string"))))
      return reply.code(400).send({ detail: "Invalid project edit" });
    return storage.update(req.params.projectId, body);
  });
  app.delete<{ Params: { projectId: string } }>("/projects/:projectId", async (req, reply) => {
    storage.requireId(req.params.projectId);
    if (!options.beforeDelete) return reply.code(503).send({ detail: "Native session teardown is unavailable" });
    await options.beforeDelete(req.params.projectId);
    if (!options.isCurrent()) return reply.code(403).send({ detail: "RESEARCH_GUEST_REVOKED" });
    storage.delete(req.params.projectId); return { status: "deleted" };
  });
  const [{ registerSandboxRoutes }, { registerOfficeRoutes }] = await Promise.all([import("./api/sandbox.ts"), import("./api/office.ts")]);
  await registerSandboxRoutes(app, { latexAssist: options.latexAssist, archive: options.archive });
  await registerOfficeRoutes(app);
  await options.registerFeatures?.(app);
  return app;
}
