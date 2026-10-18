import { expect, it } from "vitest";
import { parseAdminSkillQuery, parseAdminSkillIntroductionUpdate, parseAdminSkillCreate, parseAdminSkillMutationResult, parseAdminSkillStatus, parseAdminSkillEntry } from "./admin-skill-center.js";
import { githubEntry, githubPublication, skillIntroduction } from "./skill-center.fixtures.js";
it("bounds admin catalog searches and pagination", () => {
  expect(parseAdminSkillQuery({}).limit).toBe(50);
  expect(() => parseAdminSkillQuery({ limit: 101 })).toThrow();
  expect(() => parseAdminSkillQuery({ query: "x".repeat(121) })).toThrow();
});
it.each(["authorUserId", "currentPackageId", "verifiedTools", "deploymentPrompt"])("rejects editor authority field %s", (key) => {
  expect(() => parseAdminSkillIntroductionUpdate({ introduction: skillIntroduction, expectedRevision: 1, reason: "补充说明", [key]: "forged" })).toThrow();
});
it("keeps platform create GitHub-only and uses positive CAS revisions", () => {
  expect(parseAdminSkillCreate(githubPublication).sourceKind).toBe("github_project");
  expect(() => parseAdminSkillCreate({ sourceKind: "hosted_package", uploadId: githubEntry.id, introduction: skillIntroduction, updateNotes: null })).toThrow();
  expect(() => parseAdminSkillIntroductionUpdate({ introduction: skillIntroduction, expectedRevision: 0, reason: null })).toThrow();
  expect(() => parseAdminSkillStatus({ expectedRevision: 1, reason: "" })).toThrow();
});
it("parses stable mutation receipts without private or temporary data", () => {
  const receipt = { id: githubEntry.id, revision: 2, status: "REJECTED", isCurated: false };
  expect(parseAdminSkillMutationResult(receipt)).toEqual(receipt);
  expect(() => parseAdminSkillMutationResult({ ...receipt, coverUrl: "https://example.com" })).toThrow();
  expect(() => parseAdminSkillEntry({ entry: githubEntry, favoriteCount: -1, rejectionReason: null, allowedActions: [], actions: [] })).toThrow();
});
