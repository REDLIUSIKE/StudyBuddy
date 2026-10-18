import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-scope-"));
const token = "a".repeat(64);
const initialization = vi.hoisted(() => ({ pi: vi.fn(() => { throw Error("unexpected Pi initialization"); }) }));
vi.mock("../src/env.ts", () => { throw Error("unexpected standalone environment"); });
vi.mock("../src/agent/session-registry.ts", () => { initialization.pi(); return {}; });
let app: FastifyInstance, live = true;
const headers = { host: "127.0.0.1:42813", origin: "http://127.0.0.1:42813", "x-studybuddy-research-guest": token };
beforeAll(async () => {
  vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy");
  vi.stubEnv("KADY_PROJECTS_ROOT", root);
  const { buildEmbeddedApp } = await import("../src/bootstrap-embedded.ts");
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => live });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

describe("managed research service", () => {
  it("uses original project and sandbox APIs without credential or Pi initialization", async () => {
    const created = await app.inject({ method: "POST", url: "/projects", headers, payload: { name: "研究项目", id: "study" } });
    expect(created.statusCode).toBe(201);
    const editHeaders = { ...headers, "x-project-id": "study", "content-type": "application/octet-stream" };
    const saved = await app.inject({ method: "PUT", url: "/sandbox/file?path=paper.md", headers: editHeaders, payload: Buffer.from("Reviewed scientific text") });
    expect(saved.statusCode).toBe(200);
    const read = await app.inject({ method: "GET", url: "/sandbox/file?path=paper.md", headers: editHeaders });
    expect(read.payload).toBe("Reviewed scientific text");
    expect(initialization.pi).not.toHaveBeenCalled();
  });
  it.each([
    { ...headers, host: "attacker.example" },
    { ...headers, origin: "http://attacker.example" },
    { ...headers, "x-studybuddy-research-guest": "wrong" },
  ])("rejects foreign Host, Origin or guest before handlers", async (foreign) => {
    const res = await app.inject({ method: "GET", url: "/projects", headers: foreign });
    expect(res.statusCode).toBe(403);
  });
  it("never redirects stale project reads or writes to a default project", async () => {
    for (const method of ["GET", "PUT"] as const) {
      const res = await app.inject({ method, url: "/sandbox/file?path=paper.md", headers: { ...headers, "x-project-id": "deleted" }, ...(method === "PUT" ? { payload: "wrong project" } : {}) });
      expect(res.statusCode).toBe(404);
      expect(res.headers["x-project-fallback"]).toBeUndefined();
    }
  });
  it("rejects project junctions and traversal without writing into their targets", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "research-foreign-"));
    const junction = path.join(root, "linked");
    try {
      fs.symlinkSync(other, junction, process.platform === "win32" ? "junction" : "dir");
      for (const id of ["linked", "../foreign"]) {
        const res = await app.inject({ method: "GET", url: "/sandbox/tree", headers: { ...headers, "x-project-id": id } });
        expect([403, 404]).toContain(res.statusCode);
      }
      expect(fs.readdirSync(other)).toEqual([]);
    } finally { fs.unlinkSync(junction); fs.rmSync(other, { recursive: true, force: true }); }
  });
  it("requires explicit project scope and revokes an existing guest immediately", async () => {
    const unscoped = await app.inject({ method: "GET", url: "/sandbox/tree", headers });
    expect(unscoped.statusCode).toBe(400);
    live = false;
    const stale = await app.inject({ method: "GET", url: "/projects", headers });
    expect(stale.statusCode).toBe(403);
    expect(fs.readFileSync(path.join(root, "study/sandbox/paper.md"), "utf8")).toBe("Reviewed scientific text");
  });
});
