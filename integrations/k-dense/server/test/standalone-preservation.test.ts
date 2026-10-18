import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/index.ts";

// Real standalone routes/stores in Vitest's isolated project/agent roots.
// No session is prompted and no remote compute is submitted.
vi.stubEnv("KADY_RUNTIME_PROFILE", undefined);
const app = await buildApp();
afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });

describe("standalone compatibility", () => {
  it("missing_profile_preserves_standalone", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    const settings = await app.inject({ method: "GET", url: "/settings/defaults" });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toHaveProperty("defaults");
  });

  it("keeps project creation and sandbox editing on the original routes", async () => {
    const created = await app.inject({ method: "POST", url: "/projects", payload: { name: "Preserved standalone" } });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;
    expect(projectId).toBeTypeOf("string");
    const saved = await app.inject({
      method: "PUT", url: "/sandbox/file?path=profile-check.txt",
      headers: { "x-project-id": projectId, "content-type": "application/octet-stream" },
      payload: Buffer.from("Original standalone editing"),
    });
    expect(saved.statusCode).toBe(200);
    const opened = await app.inject({ method: "GET", url: "/sandbox/file?path=profile-check.txt", headers: { "x-project-id": projectId } });
    expect(opened.statusCode).toBe(200);
    expect(opened.payload).toBe("Original standalone editing");
  });
});
