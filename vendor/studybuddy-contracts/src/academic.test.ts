import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseAcademicProfileCorrectionRequest,
  parseAcademicProfileLockRequest,
  parseAcademicDirectoryUpdateRequest,
  type AcademicProfileView,
} from "./academic.js";

const SCHOOL_ID = "10000000-0000-4000-8000-000000000001";
const COLLEGE_ID = "10000000-0000-4000-8000-000000000002";
const MAJOR_ID = "10000000-0000-4000-8000-000000000003";

const valid = {
  realName: "刘横",
  school: { id: SCHOOL_ID },
  college: { candidateName: "资源与环境学院" },
  program: { candidateName: "环境工程", majorCatalogId: MAJOR_ID },
  grade: "2024级",
};

describe("academic contracts", () => {
  it("limits self-service updates to the college, program and current profile revision", () => {
    expect(parseAcademicDirectoryUpdateRequest({
      college: { candidateName: "　信息工程学院　" }, program: { candidateName: "软件工程" }, expectedRevision: 2,
    })).toEqual({ college: { candidateName: "信息工程学院" }, program: { candidateName: "软件工程" }, expectedRevision: 2 });
    for (const forbidden of ["school", "realName", "grade", "userId"]) {
      expect(() => parseAcademicDirectoryUpdateRequest({
        college: {id: COLLEGE_ID}, program: {candidateName: "软件工程"}, expectedRevision: 1, [forbidden]: "spoof",
      })).toThrow("ACADEMIC_DIRECTORY_UPDATE_INVALID");
    }
    expect(() => parseAcademicDirectoryUpdateRequest({
      college: {id: COLLEGE_ID}, program: {candidateName: ""}, expectedRevision: 1,
    })).toThrow("ACADEMIC_DIRECTORY_UPDATE_INVALID");
  });
  it("accepts selected or candidate academic entities and canonicalizes text", () => {
    expect(parseAcademicProfileLockRequest({
      ...valid,
      realName: "　刘横　",
      college: { id: COLLEGE_ID },
    })).toEqual({
      ...valid,
      realName: "刘横",
      college: { id: COLLEGE_ID },
    });
  });

  it("accepts a candidate school without creating a confirmed identity", () => {
    expect(parseAcademicProfileLockRequest({
      ...valid,
      school: { candidateName: "　测试   大学　" },
    })).toEqual({
      ...valid,
      school: { candidateName: "测试 大学" },
    });
  });

  it("rejects identity hiding and every unknown field", () => {
    expect(() => parseAcademicProfileLockRequest({ ...valid, hidden: true }))
      .toThrow("ACADEMIC_PROFILE_INVALID");
    expect(() => parseAcademicProfileLockRequest({ ...valid, canEdit: true }))
      .toThrow("ACADEMIC_PROFILE_INVALID");
    expect(() => parseAcademicProfileLockRequest({
      ...valid,
      college: { id: COLLEGE_ID, candidateName: "另一个学院" },
    })).toThrow("ACADEMIC_PROFILE_INVALID");
  });

  it("requires a real name, canonical UUIDs, and an enrollment-year grade", () => {
    expect(() => parseAcademicProfileLockRequest({ ...valid, realName: "" }))
      .toThrow("ACADEMIC_PROFILE_INVALID");
    expect(() => parseAcademicProfileLockRequest({ ...valid, school: { id: "school" } }))
      .toThrow("ACADEMIC_PROFILE_INVALID");
    expect(() => parseAcademicProfileLockRequest({ ...valid, grade: "大一" }))
      .toThrow("ACADEMIC_PROFILE_INVALID");
  });

  it("does not accept the storage column name as academic request semantics", () => {
    const { realName: _realName, ...withoutRealName } = valid;
    expect(() => parseAcademicProfileLockRequest({
      ...withoutRealName,
      displayName: "刘横",
    })).toThrow("ACADEMIC_PROFILE_INVALID");
  });

  it("parses one closed correction request with an optimistic profile revision", () => {
    expect(parseAcademicProfileCorrectionRequest({
      ...valid,
      reason: "学院名称需要更正",
      expectedRevision: 3,
    })).toEqual({
      ...valid,
      reason: "学院名称需要更正",
      expectedRevision: 3,
    });
    expect(() => parseAcademicProfileCorrectionRequest({
      ...valid,
      reason: "学院名称需要更正",
      expectedRevision: 3,
      adminNotes: "不应由用户填写",
    })).toThrow("ACADEMIC_CORRECTION_INVALID");
  });

  it("does not expose hide or edit capability in the profile view contract", () => {
    expectTypeOf<AcademicProfileView>().not.toHaveProperty("canHide");
    expectTypeOf<AcademicProfileView>().not.toHaveProperty("canEdit");
    expectTypeOf<AcademicProfileView>().not.toHaveProperty("hidden");
  });
});
