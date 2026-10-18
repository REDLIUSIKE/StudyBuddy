import { describe, expect, it } from "vitest";

import {
  parseCampusCollaboratorIdentityView,
  parseOwnerPersonalProfileView,
  parsePersonalProfileAvatarPresetUpdate,
  parsePersonalProfileUpdate,
  parsePublicProfileView,
} from "./personal-profile.js";

const SCHOOL_ID = "10000000-0000-4000-8000-000000000001";
const COLLEGE_ID = "10000000-0000-4000-8000-000000000002";
const PROGRAM_ID = "10000000-0000-4000-8000-000000000003";
const PUBLIC_ID = "10000000-0000-4000-8000-000000000004";

const campus = {
  status: "confirmed" as const,
  realName: "刘横",
  school: { id: SCHOOL_ID, name: "云杉大学", status: "verified" as const },
  college: { id: COLLEGE_ID, name: "资源与环境学院", status: "verified" as const },
  program: { id: PROGRAM_ID, name: "环境工程", status: "verified" as const },
  grade: "2024级",
  revision: 3,
};

const publicProfile = {
  avatarUrl: "/v1/my-ai/personal-profile/avatar?v=8",
  nickname: "云杉同学",
  publicId: PUBLIC_ID,
  membership: "lifetime" as const,
};

describe("personal profile contracts", () => {
  it("parses the exact owner view with private account and campus identity", () => {
    const owner = {
      schemaVersion: 1 as const,
      profileVersion: 8,
      ...publicProfile,
      campus,
      account: {
        email: "liuheng@example.com",
        currentDeviceDisplayName: "刘横的电脑",
      },
    };

    expect(parseOwnerPersonalProfileView(owner)).toEqual(owner);
    expect(() => parseOwnerPersonalProfileView({ ...owner, userId: PUBLIC_ID }))
      .toThrow("PERSONAL_PROFILE_INVALID");
  });

  it("parses only the public-purpose profile fields", () => {
    expect(parsePublicProfileView(publicProfile)).toEqual(publicProfile);

    for (const privateField of [
      { realName: "刘横" },
      { email: "liuheng@example.com" },
      { campus },
      { userId: PUBLIC_ID },
      { displayName: "刘横" },
    ]) {
      expect(() => parsePublicProfileView({ ...publicProfile, ...privateField }))
        .toThrow("PUBLIC_PROFILE_INVALID");
    }
  });

  it("parses a campus collaborator identity without account or public identifiers", () => {
    const collaborator = {
      avatarUrl: publicProfile.avatarUrl,
      nickname: publicProfile.nickname,
      realName: campus.realName,
      school: campus.school,
      college: campus.college,
      program: campus.program,
      grade: campus.grade,
    };

    expect(parseCampusCollaboratorIdentityView(collaborator)).toEqual(collaborator);
    expect(() => parseCampusCollaboratorIdentityView({
      ...collaborator,
      email: "liuheng@example.com",
    })).toThrow("CAMPUS_IDENTITY_INVALID");
    expect(() => parseCampusCollaboratorIdentityView({ ...collaborator, userId: PUBLIC_ID }))
      .toThrow("CAMPUS_IDENTITY_INVALID");
  });

  it("normalizes a nickname update and accepts only optimistic-version input", () => {
    expect(parsePersonalProfileUpdate({
      nickname: "　云杉   同学　",
      expectedVersion: 8,
    })).toEqual({ nickname: "云杉 同学", expectedVersion: 8 });

    for (const invalid of [
      { nickname: "云杉同学", expectedVersion: 8, displayName: "刘横" },
      { nickname: "云杉同学", expectedVersion: 8, realName: "刘横" },
      { nickname: "云杉同学", expectedVersion: 8, userId: PUBLIC_ID },
      { nickname: "StudyBuddy 官方", expectedVersion: 8 },
      { nickname: "a", expectedVersion: 8 },
      { nickname: "有效\u0000昵称", expectedVersion: 8 },
      { nickname: "云杉同学", expectedVersion: 0 },
    ]) {
      expect(() => parsePersonalProfileUpdate(invalid))
        .toThrow("PERSONAL_PROFILE_UPDATE_INVALID");
    }
  });

  it("accepts only the two approved default-avatar presets with an optimistic version", () => {
    expect(parsePersonalProfileAvatarPresetUpdate({
      preset: "male",
      expectedVersion: 8,
    })).toEqual({ preset: "male", expectedVersion: 8 });
    expect(parsePersonalProfileAvatarPresetUpdate({
      preset: "female",
      expectedVersion: 8,
    })).toEqual({ preset: "female", expectedVersion: 8 });

    for (const invalid of [
      { preset: "neutral", expectedVersion: 8 },
      { preset: "female", expectedVersion: 0 },
      { preset: "female", expectedVersion: 8, userId: PUBLIC_ID },
    ]) {
      expect(() => parsePersonalProfileAvatarPresetUpdate(invalid))
        .toThrow("PERSONAL_PROFILE_AVATAR_PRESET_INVALID");
    }
  });

  it("rejects avatar URLs that could leave the controlled HTTPS or same-origin boundary", () => {
    for (const avatarUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "http://cdn.example.com/avatar.png",
      "//cdn.example.com/avatar.png",
    ]) {
      expect(() => parsePublicProfileView({ ...publicProfile, avatarUrl }))
        .toThrow("PUBLIC_PROFILE_INVALID");
    }
  });

  it("rejects external HTTPS avatars in every personal-profile view", () => {
    const avatarUrl = "https://evil.example/avatar.png";
    const owner = {
      schemaVersion: 1 as const,
      profileVersion: 8,
      ...publicProfile,
      avatarUrl,
      campus,
      account: {
        email: "liuheng@example.com",
        currentDeviceDisplayName: "刘横的电脑",
      },
    };
    const collaborator = {
      avatarUrl,
      nickname: publicProfile.nickname,
      realName: campus.realName,
      school: campus.school,
      college: campus.college,
      program: campus.program,
      grade: campus.grade,
    };

    expect(() => parseOwnerPersonalProfileView(owner))
      .toThrow("OWNER_PERSONAL_PROFILE_INVALID");
    expect(() => parsePublicProfileView({ ...publicProfile, avatarUrl }))
      .toThrow("PUBLIC_PROFILE_INVALID");
    expect(() => parseCampusCollaboratorIdentityView(collaborator))
      .toThrow("CAMPUS_IDENTITY_INVALID");
  });
});
