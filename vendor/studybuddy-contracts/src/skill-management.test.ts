import { expect, it } from "vitest";
import { parseSkillCopy, parseSkillSnapshot, parseSkillInstall, parseSkillManage,parseSkillInstance,parseSkillOperationResult } from "./skill-management.js";
it("reports native linked readback without implying tool recognition or runtime evidence",()=>{const result={operationId:"11111111-1111-4111-8111-111111111111",results:[{target:{toolId:"codex_cli",scopeId:"scope_1"},status:"linked",reasonCode:null,instanceId:"linked_1",recognition:"pending",runtime:"unverified"}]};expect(parseSkillOperationResult(result)).toEqual(result);});
it("keeps imported hub content separate from a tool installation",()=>{expect(parseSkillInstance({instanceId:"instance_hub",scopeId:"scope_hub",displayName:"notes",contentSha256:"a".repeat(64),toolId:"codex_cli",scope:"hub",description:null,managed:true,listingId:null,package:null,compatibility:{state:"compatible",reasonCode:null},recognition:"pending",runtime:"unverified"}).scope).toBe("hub");});
const operationId = "eb0afdd6-2013-4ce6-979f-2c4d72e5fba1";
const copy = { operationId, instanceId: "instance_abc", scanRevision: "scan_123", targets: [{ toolId: "workbuddy", scopeId: "scope_abc" }], mode: "copy", conflictPolicy: "keep" };
it("lists authorized empty projects without disclosing a root path or requiring a ready tool",()=>{
 const snapshot={revision:"scan_1",instances:[],tools:[],scanErrors:[],projects:[{scopeId:"project_1",displayName:"课程作业 · 1"}]};expect(parseSkillSnapshot(snapshot)).toHaveProperty("projects",snapshot.projects);
 expect(()=>parseSkillSnapshot({...snapshot,projects:[{scopeId:"project_1",displayName:"C:/private"}]})).toThrow();
 expect(()=>parseSkillSnapshot({...snapshot,projects:[snapshot.projects[0],snapshot.projects[0]]})).toThrow();
});
it("accepts display-only destination labels while keeping path-like labels and request extensions closed",()=>{
 const tool={toolId:"codex_cli",displayName:"Codex",installed:true,adapterState:"verified",reasonCode:null,executorId:"codex",destinations:[{toolId:"codex_cli",scopeId:"scope_project"}],destinationLabels:{scope_project:{scope:"project",displayName:"课程作业 · 123456"}}};
 const snapshot={revision:"scan_123",instances:[],tools:[tool],scanErrors:[]};
 expect(parseSkillSnapshot(snapshot).tools[0]).toHaveProperty("destinationLabels",tool.destinationLabels);
 expect(()=>parseSkillSnapshot({...snapshot,tools:[{...tool,destinationLabels:{scope_project:{scope:"project",displayName:"C:\\private\\project"}}}]})).toThrow();
 expect(()=>parseSkillCopy({...copy,targets:[{...copy.targets[0],displayName:"任意"}]})).toThrow();
});
it("only accepts native opaque instance and destination identities", () => {
  expect(parseSkillCopy(copy)).toEqual(copy);
  expect(() => parseSkillCopy({ ...copy, sourcePath: "C:\\Users" })).toThrow();
  expect(() => parseSkillCopy({ ...copy, targets: [{ toolId: "codex_cli", scopeId: "../.ssh" }] })).toThrow();
  expect(() => parseSkillCopy({ ...copy, mode: "move" })).toThrow();
  expect(() => parseSkillCopy({ ...copy, operationId: "not-uuid" })).toThrow();
});
it("requires fresh publication identity for installs and explicit managed action", () => {
  const install = { operationId, listingId: operationId, expectedPublicationId: operationId, targets: copy.targets, conflictPolicy: "keep" };
  expect(parseSkillInstall(install)).toEqual(install);
  expect(() => parseSkillInstall({ ...install, expectedPublicationId: null })).toThrow();
  const { mode: _mode, ...managed } = copy;
  expect(parseSkillManage({ ...managed, action: "disable", expectedPublicationId: null })).toBeDefined();
});
it("does not turn pending adapters or runtime checks into verified facts", () => {
  const snapshot = { revision: "scan_123", instances: [], tools: [{ toolId: "workbuddy", displayName: "WorkBuddy", installed: true, adapterState: "pending", reasonCode: "ROOT_NOT_VERIFIED", executorId: "workbuddy", destinations: [] }], scanErrors: [] };
  expect(parseSkillSnapshot(snapshot).tools[0]?.adapterState).toBe("pending");
  expect(() => parseSkillSnapshot({ ...snapshot, sourcePath: "C:\\" })).toThrow();
  expect(() => parseSkillSnapshot({ ...snapshot, tools: [{ ...snapshot.tools[0], destinations: copy.targets }] })).toThrow();
});
