import { describe, expect, it } from "vitest";

import {
  parseDynamicUpdateResponse,
  parsePersistedUpdateNotice,
  parseReleaseTarget,
  parseUpdateStateView,
} from "./client-update.js";

const publishedAt = "2026-08-21T08:00:00.000Z";
const confirmedAt = "2026-08-21T08:01:00.000Z";
const releaseId = "123e4567-e89b-42d3-a456-426614174000";

describe("client update contracts", () => {
  it.each([
    ["windows", "x64", "nsis"],
    ["macos", "x64", "app_tar_gz"],
    ["macos", "aarch64", "app_tar_gz"],
  ] as const)("accepts %s/%s/%s", (platform, architecture, artifactKind) => {
    expect(parseReleaseTarget({ platform, architecture, artifactKind })).toEqual({
      platform,
      architecture,
      artifactKind,
    });
  });

  it.each([
    ["windows", "aarch64", "nsis"],
    ["windows", "x64", "app_tar_gz"],
    ["macos", "aarch64", "nsis"],
  ] as const)("rejects unsupported %s/%s/%s", (platform, architecture, artifactKind) => {
    expect(() => parseReleaseTarget({ platform, architecture, artifactKind }))
      .toThrow("release target");
  });

  it("accepts exact Tauri update metadata without exposing storage authority", () => {
    const response = dynamicResponse();

    expect(parseDynamicUpdateResponse(response)).toEqual(response);
    expect(() => parseDynamicUpdateResponse({
      ...response,
      storageKey: "releases/private.exe",
    })).toThrow("dynamic update response");
  });

  it.each([
    { version: "01.2.3" },
    { version: "1.2" },
    { pub_date: "2026-08-21 08:00:00" },
    { url: "https://attacker.invalid/update" },
    { url: "http://guijitongzhuo.com/studybuddy-releases/releases/windows/x64/update.nsis.zip" },
    { url: "https://user:password@guijitongzhuo.com/studybuddy-releases/releases/windows/x64/update.nsis.zip" },
    { url: "https://guijitongzhuo.com/studybuddy-releases/releases/windows/x64/update.nsis.zip#fragment" },
    { url: "https://guijitongzhuo.com/studybuddy-releases/releases/windows/x64/../update.nsis.zip" },
    { url: "https://guijitongzhuo.com/another-bucket/releases/windows/x64/update.nsis.zip" },
    { signature: "" },
    { notes: "x".repeat(4_001) },
    { release_id: "not-a-uuid" },
    { sha256: "A".repeat(64) },
    { file_size_bytes: "0" },
  ])("rejects malformed dynamic update metadata %#", (replacement) => {
    expect(() => parseDynamicUpdateResponse({
      ...dynamicResponse(),
      ...replacement,
    })).toThrow("dynamic update response");
  });

  it("parses the bounded durable notice contract", () => {
    const notice = persistedNotice();
    expect(parsePersistedUpdateNotice(notice)).toEqual(notice);
    expect(() => parsePersistedUpdateNotice({ ...notice, url: dynamicResponse().url }))
      .toThrow("persisted update notice");
  });

  it.each([
    { status: "checking", currentVersion: "0.1.1" },
    { status: "current", currentVersion: "0.1.1", checkedAt: confirmedAt },
    {
      status: "available",
      currentVersion: "0.1.1",
      targetVersion: "0.2.0",
      notes: "稳定性更新",
      publishedAt,
    },
    {
      status: "downloading",
      currentVersion: "0.1.1",
      targetVersion: "0.2.0",
      downloadedBytes: "512",
      totalBytes: "1024",
    },
    { status: "verifying", currentVersion: "0.1.1", targetVersion: "0.2.0" },
    { status: "installing", currentVersion: "0.1.1", targetVersion: "0.2.0" },
    {
      status: "failed",
      currentVersion: "0.1.1",
      targetVersion: "0.2.0",
      errorCode: "UPDATE_DOWNLOAD_FAILED",
      retryable: true,
    },
    {
      status: "unavailable",
      currentVersion: "0.1.1",
      lastKnownUpdate: persistedNotice(),
    },
  ] as const)("parses the $status state", (state) => {
    expect(parseUpdateStateView(state)).toEqual(state);
  });

  it("rejects state variants with unknown authority-bearing fields", () => {
    expect(() => parseUpdateStateView({
      status: "available",
      currentVersion: "0.1.1",
      targetVersion: "0.2.0",
      notes: "稳定性更新",
      publishedAt,
      url: dynamicResponse().url,
    })).toThrow("update state");
  });
});

function dynamicResponse() {
  return {
    version: "0.2.0",
    pub_date: publishedAt,
    url: "https://guijitongzhuo.com/studybuddy-releases/releases/windows/x64/0.2.0/StudyBuddy_0.2.0_x64-setup.nsis.zip?X-Amz-Expires=1800&X-Amz-Signature=abc",
    signature: "tauri-signature",
    notes: "稳定性更新",
    release_id: releaseId,
    sha256: "a".repeat(64),
    file_size_bytes: "1048576",
  };
}

function persistedNotice() {
  return {
    targetVersion: "0.2.0",
    notes: "稳定性更新",
    publishedAt,
    confirmedAt,
    releaseId,
  };
}
