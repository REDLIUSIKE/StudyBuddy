import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-tool-"));
vi.mock("../src/agent/session-registry.ts", () => { throw Error("No Pi initializer for native research tools"); });
let app: FastifyInstance;
const token = "a".repeat(64), tool = "b".repeat(64);
const headers = { host: "127.0.0.1:42813", origin: "http://127.0.0.1:42813", "x-studybuddy-research-guest": token, "x-project-id": "study" };
beforeAll(async () => {
  vi.stubEnv("KADY_PROJECTS_ROOT", root); vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy");
  const { buildEmbeddedApp } = await import("../src/bootstrap-embedded.ts");
  const { registerEmbeddedToolRoutes } = await import("../src/api/embedded-tools.ts");
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: token, origin: () => headers.origin, isCurrent: () => true,
    registerFeatures: app => registerEmbeddedToolRoutes(app, { authorization: tool, current: () => true, context: async () => ({ projectId: "study", sessionRef: "native-session", hostBinding: {} }) }) });
  await app.inject({ method: "POST", url: "/projects", headers, payload: { name: "Study", id: "study" } });
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it("denies a web guest the native model-tool caller role", async () => {
  const result = await app.inject({ method: "POST", url: "/research/tools/notebook", headers, payload: { toolCallId: "call-a", sessionId: "native-session", record: { type: "hypothesis", title: "Question" } } });
  expect(result.statusCode).toBe(403);
});
it("records a native notebook entry through the original validator and stamps actor identity", async () => {
  const result = await app.inject({ method: "POST", url: "/research/tools/notebook", headers: { ...headers, "x-studybuddy-research-tool": tool },
    payload: { toolCallId: "call-a", sessionId: "native-session", record: { type: "hypothesis", title: "Question", body: "Authored hypothesis", timestamp: 1, role: "user", sessionId: "foreign" } } });
  expect(result.statusCode).toBe(200);
  const notebook = fs.readFileSync(path.join(root, "study/sandbox/.kady/notebook/native-session.jsonl"), "utf8");
  expect(JSON.parse(notebook)).toMatchObject({ id: "call-a", role: "agent", title: "Question" });
  expect(JSON.parse(notebook).timestamp).not.toBe(1);
});
it("exposes only the original native-compatible schemas to the private tool owner", async () => {
  const result = await app.inject({ method: "POST", url: "/research/tools/catalog", headers: { ...headers, "x-studybuddy-research-tool": tool }, payload: { toolCallId: "catalog-a", sessionId: "native-session", record: {} } });
  expect(result.statusCode).toBe(200);
  expect(result.json().tools.map((value: any) => value.name)).toEqual(["notebook", "notebook_search", "add_pdf_annotation", "list_pdf_annotations", "remove_pdf_annotation","scientific_result"]);
  expect(result.json().tools[0].parameters.properties.type).toBeDefined();
});
it('executes the original scientific result validator and returns durable native metadata without a Pi runtime',async()=>{
 const result=await app.inject({method:'POST',url:'/research/tools/advanced',headers:{...headers,'x-studybuddy-research-tool':tool},payload:{toolCallId:'scientific-a',sessionId:'native-session',record:{name:'scientific_result',callerSessionId:'native-session',arguments:{kind:'table',title:'Observed table',columns:[{key:'value',label:'Value'}],rows:[[7]]}}}});
 expect(result.statusCode).toBe(200);expect(result.json().details.scientificResult).toMatchObject({kind:'table',title:'Observed table',rows:[[7]]});
 const invalid=await app.inject({method:'POST',url:'/research/tools/advanced',headers:{...headers,'x-studybuddy-research-tool':tool},payload:{toolCallId:'scientific-b',sessionId:'native-session',record:{name:'scientific_result',arguments:{kind:'table',title:'Bad table',columns:[{key:'value',label:'Value'}],rows:[[7,8]]}}}});expect(invalid.statusCode).toBeGreaterThanOrEqual(400);
});
it.each(['.kady/provenance/steps.jsonl','.kady/native-provenance/scope-state.json','.studybuddy/native-advanced/fake.json'])('protects runtime observation authority from ordinary native writes: %s',async file=>{
 const result=await app.inject({method:'POST',url:'/research/tools/guard',headers:{...headers,'x-studybuddy-research-tool':tool},payload:{toolCallId:'guard-authority',sessionId:'native-session',record:{name:'write',path:file}}});expect(result.statusCode).toBe(200);expect(result.json().verdict.kind).toBe('protected');
});
it("uses the original protected-data classifier for native file tools", async () => {
  const result = await app.inject({ method: "POST", url: "/research/tools/guard", headers: { ...headers, "x-studybuddy-research-tool": tool }, payload: { toolCallId: "guard-a", sessionId: "native-session", record: { name: "write_file", path: "user_data/raw.csv" } } });
  expect(result.statusCode).toBe(200);
  expect(result.json().verdict.kind).toBe("protected");
});
