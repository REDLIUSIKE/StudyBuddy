import { describe, expect, it } from "vitest";

import {
  parseCampusOrganizerAdminView,
  parseCampusOrganizerGrantInput,
  parseCampusOrganizerGrantProjection,
  parseCampusOrganizerListPage,
  parseCampusOrganizerListQuery,
  parseCampusOrganizerRevokeInput,
  parseCampusPlaybookAssetMetadata,
  parseCampusPlaybookDocument,
} from "./campus-organizer-access.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SCHOOL_ID = "00000000-0000-4000-8000-000000000002";
const GRANT_ID = "00000000-0000-4000-8000-000000000003";
const ADMIN_ID = "00000000-0000-4000-8000-000000000004";

const projection = {
  grantId: GRANT_ID,
  school: { id: SCHOOL_ID, name: "测试大学" },
  revision: 1,
  effectiveFrom: "2026-09-02T08:00:00.000Z",
  effectiveTo: null,
};

describe("campus organizer access contracts", () => {
  it("preserves bounded plain-text knowledge prompts in the guarded document", () => {
    const document = (prompt: unknown) => ({
      version: "2026-08-31.v4", access: projection,
      groups: [{ id: "promotion", title: "推广方案" }],
      entries: [{ id: "campus-knowledge", groupId: "promotion", navTitle: "校园知识库制作",
        eyebrow: "推广方案", summary: "制作知识库", sections: [{ id: "first-package", title: "制作", prompt }] }],
    });
    expect(parseCampusPlaybookDocument(document("请输出 knowledge.json\n保留官方引用"))
      .entries[0]?.sections[0]?.prompt).toBe("请输出 knowledge.json\n保留官方引用");
    for (const invalid of ["", "x".repeat(20_001), { html: "<script>" }]) {
      expect(() => parseCampusPlaybookDocument(document(invalid))).toThrow();
    }
  });
  it("normalizes strict grant and revoke commands", () => {
    expect(parseCampusOrganizerGrantInput({
      schoolId: SCHOOL_ID,
      effectiveFrom: "2026-09-02T08:00:00.000Z",
      reason: "  首批 校园主理人  ",
    })).toEqual({
      schoolId: SCHOOL_ID,
      effectiveFrom: "2026-09-02T08:00:00.000Z",
      reason: "首批 校园主理人",
    });

    expect(parseCampusOrganizerRevokeInput({
      grantId: GRANT_ID,
      revision: 1,
      reason: "职责交接",
    })).toEqual({
      grantId: GRANT_ID,
      revision: 1,
      reason: "职责交接",
    });
  });

  it("rejects unknown keys, invalid identifiers, time, revision, and reasons", () => {
    expect(() => parseCampusOrganizerGrantInput({
      schoolId: SCHOOL_ID,
      effectiveFrom: "2026-09-02",
      reason: "x",
    })).toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
    expect(() => parseCampusOrganizerGrantInput({
      schoolId: SCHOOL_ID,
      effectiveFrom: "2026-09-02T08:00:00.000Z",
      reason: "x".repeat(501),
    })).toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
    expect(() => parseCampusOrganizerRevokeInput({
      grantId: GRANT_ID,
      revision: 0,
      reason: "x",
      status: "REVOKED",
    })).toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });

  it("strictly parses the minimal current projection", () => {
    expect(parseCampusOrganizerGrantProjection(projection)).toEqual(projection);
    expect(() => parseCampusOrganizerGrantProjection({ ...projection, userId: USER_ID }))
      .toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
    expect(() => parseCampusOrganizerGrantProjection({ ...projection, revision: Number.NaN }))
      .toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });

  it("strictly parses admin state separately from commission assignment", () => {
    const value = {
      studyBuddyUserId: USER_ID,
      accountMasked: "o***r@example.com",
      userStatus: "ACTIVE",
      state: "ACTIVE",
      grant: {
        ...projection,
        grantReason: "首批主理人",
        revokeReason: null,
        grantedByAdminUserId: ADMIN_ID,
        revokedByAdminUserId: null,
        createdAt: "2026-09-02T07:59:00.000Z",
        updatedAt: "2026-09-02T07:59:00.000Z",
      },
      commissionAssignment: {
        id: "00000000-0000-4000-8000-000000000006",
        schoolId: SCHOOL_ID,
        status: "ACTIVE",
        effectiveFrom: "2026-09-02T08:00:00.000Z",
        effectiveTo: null,
      },
    };

    expect(parseCampusOrganizerAdminView(value)).toEqual(value);
    expect(() => parseCampusOrganizerAdminView({ ...value, serviceBackendUserId: "secret" }))
      .toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });

  it("parses canonical list filters and bounded pages", () => {
    expect(parseCampusOrganizerListQuery({ state: "ACTIVE", schoolId: SCHOOL_ID, limit: "25" }))
      .toEqual({ state: "ACTIVE", schoolId: SCHOOL_ID, limit: 25 });
    expect(parseCampusOrganizerListPage({
      items: [{
        studyBuddyUserId: USER_ID,
        accountMasked: "o***r@example.com",
        userStatus: "ACTIVE",
        state: "ACTIVE",
        grant: {
          ...projection,
          grantReason: "首批主理人",
          revokeReason: null,
          grantedByAdminUserId: ADMIN_ID,
          revokedByAdminUserId: null,
          createdAt: "2026-09-02T07:59:00.000Z",
          updatedAt: "2026-09-02T07:59:00.000Z",
        },
        commissionAssignment: null,
      }],
      nextCursor: null,
    }).items).toHaveLength(1);
    expect(() => parseCampusOrganizerListQuery({ limit: "01" }))
      .toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });

  it("strictly parses a protected document and rejects malformed links or duplicates", () => {
    const document = {
      version: "2026-08-30.v3",
      access: projection,
      groups: [{ id: "welcome", title: "欢迎成为校园主理人" }],
      entries: [{
        id: "welcome",
        groupId: "welcome",
        navTitle: "认识 StudyBuddy",
        eyebrow: "从这里开始",
        summary: "先看懂这个项目为什么值得做。",
        sections: [{
          id: "project-value",
          title: "项目优势",
          body: "正文",
          links: [{ label: "官方资料", href: "https://example.com/source" }],
          media: [{
            id: "YZB-001",
            title: "校园 AI 学习咨询台",
            assetId: "stall-yzb-001",
            alt: "易拉宝",
            scene: "咨询台",
            size: "80×200cm",
            version: "V1",
            updatedAt: "2026-08-30",
            source: "总部通用版",
          }],
        }],
      }],
    };

    expect(parseCampusPlaybookDocument(document)).toEqual(document);
    expect(() => parseCampusPlaybookDocument({
      ...document,
      entries: [...document.entries, document.entries[0]],
    })).toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
    expect(() => parseCampusPlaybookDocument({
      ...document,
      entries: [{
        ...document.entries[0]!,
        sections: [{
          ...document.entries[0]!.sections[0]!,
          links: [{ label: "bad", href: "javascript:alert(1)" }],
        }],
      }],
    })).toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });

  it("parses only allowlisted private asset metadata", () => {
    const metadata = {
      assetId: "stall-yzb-001",
      url: "/v1/campus-playbook/assets/stall-yzb-001",
      mediaType: "image/png",
      contentLength: 12345,
      sha256: "91f56118af6f5c6755c60fc7cc538ab93ce6dbd5c3292fa10ca0e1f3e03e265b",
    };
    expect(parseCampusPlaybookAssetMetadata(metadata)).toEqual(metadata);
    expect(() => parseCampusPlaybookAssetMetadata({ ...metadata, url: "https://evil.example/x" }))
      .toThrow("CAMPUS_ORGANIZER_ACCESS_INVALID");
  });
});
