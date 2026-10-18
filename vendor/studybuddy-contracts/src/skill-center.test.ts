import { describe, expect, it } from "vitest";
import { parseSkillEntry, parseSkillPublication, parseSkillPublicationUpdate, parseSkillPackageUploadV2 } from "./skill-center.js";


import { githubEntry, githubPublication, skillIntroduction } from "./skill-center.fixtures.js";

describe("Skill Center source contracts", () => {
  it("defaults an omitted cover to keep and accepts an empty cover on entries", () => {
    expect(parseSkillPublication(githubPublication).cover).toEqual({ action: "keep" });
    expect(parseSkillEntry(githubEntry).coverUrl).toBeNull();
  });
  it("rejects hosted packages on a GitHub introduction", () => {
    expect(() => parseSkillEntry({ ...githubEntry, package: { publicationId: githubEntry.id, sha256: "a".repeat(64), canonicalName: "notes", declaredVersion: null, updateNotes: null } })).toThrow();
    expect(() => parseSkillPublication({ ...githubPublication, uploadId: githubEntry.id })).toThrow();
  });
  it.each(["publisherId", "authorUserId", "createdByAdminUserId", "isCurated", "verifiedTools"])("rejects submitted authority %s", (key) => {
    expect(() => parseSkillPublication({ ...githubPublication, [key]: "forged" })).toThrow();
  });
  it("separates package upload from optional image upload", () => {
    expect(parseSkillPackageUploadV2({ packageSha256: "a".repeat(64), packageBytes: "4096" }).packageBytes).toBe("4096");
    expect(() => parseSkillPackageUploadV2({ packageSha256: "a".repeat(64), packageBytes: "4096", coverBytes: "1" })).toThrow();
    expect(() => parseSkillPublication({ ...githubPublication, cover: { action: "replace" } })).toThrow();
  });
  it("requires a positive revision only for updates", () => {
    expect(() => parseSkillPublicationUpdate(githubPublication)).toThrow();
    expect(parseSkillPublicationUpdate({ ...githubPublication, expectedRevision: 2 }).expectedRevision).toBe(2);
  });
  it("checks source attribution and platform ownership invariants", () => {
    expect(() => parseSkillEntry({ ...githubEntry, attribution: { role: "creator", displayName: "小林" } })).toThrow();
    expect(() => parseSkillEntry({ ...githubEntry, publisherKind: "platform_admin" })).toThrow();
    expect(parseSkillEntry({ ...githubEntry, publisherKind: "platform_admin", attribution: { role: "platform", displayName: "StudyBuddy 精选" } }).publisherKind).toBe("platform_admin");
  });
  it("keeps legacy examples but does not require an input or example from every new Skill", () => {
    expect(parseSkillEntry({ ...githubEntry, metadataState: "legacy_incomplete", introduction: { ...skillIntroduction, example: "" } }).metadataState).toBe("legacy_incomplete");
    const publication = parseSkillPublication({ ...githubPublication, introduction: { ...skillIntroduction, inputDescription: "", example: "", features: ["按章节核对出处", "可以反复调用"] } });
    expect(publication.introduction.features).toEqual(["按章节核对出处", "可以反复调用"]);
    expect(publication.introduction.inputDescription).toBe("");
    expect(() => parseSkillPublication({ ...githubPublication, introduction: { ...skillIntroduction, features: [" "] } })).toThrow();
    expect(() => parseSkillPublication({ ...githubPublication, introduction: { ...skillIntroduction, features: Array(9).fill("特点") } })).toThrow();
  });
});
