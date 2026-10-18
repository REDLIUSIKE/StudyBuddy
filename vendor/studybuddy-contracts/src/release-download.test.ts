import { describe, expect, it } from "vitest";

import {
  parseDownloadRedeemRequest,
  parseDownloadTicketRequest,
  parsePublicWindowsReleaseResponse,
} from "./release-download.js";

const proof = {
  challengeId: "ac67d629-7f1f-4381-a453-009f48252332",
  publicKeyBase64url: "A".repeat(59),
  signatureBase64url: "A".repeat(86),
};

describe("release download request contracts", () => {
  it("parses the exact public Windows installer response", () => {
    const response = publicRelease();

    expect(parsePublicWindowsReleaseResponse(response)).toEqual(response);
    expect(() => parsePublicWindowsReleaseResponse({
      ...response,
      internalStorageKey: "releases/windows/x64/private.exe",
    })).toThrow("public Windows installer response");
  });

  it.each([
    { artifacts: [] },
    { artifacts: [publicRelease().artifacts[0], publicRelease().artifacts[0]] },
    {
      artifacts: [
        legacyPublicRelease().artifacts[0],
        { ...legacyPublicRelease().artifacts[1], kind: "installer_exe" },
        legacyPublicRelease().artifacts[2],
      ],
    },
    {
      artifacts: [
        ...legacyPublicRelease().artifacts,
        legacyPublicRelease().artifacts[1],
      ],
    },
    {
      artifacts: [
        { ...publicRelease().artifacts[0], fileName: "../StudyBuddy.exe" },
        legacyPublicRelease().artifacts[1],
        legacyPublicRelease().artifacts[2],
      ],
    },
    {
      artifacts: [
        { ...publicRelease().artifacts[0], fileSizeBytes: "0" },
        legacyPublicRelease().artifacts[1],
        legacyPublicRelease().artifacts[2],
      ],
    },
    {
      artifacts: [
        { ...publicRelease().artifacts[0], sha256: "A".repeat(64) },
        legacyPublicRelease().artifacts[1],
        legacyPublicRelease().artifacts[2],
      ],
    },
    {
      artifacts: [
        {
          ...publicRelease().artifacts[0],
          downloadUrl: "https://attacker.invalid/file.exe",
        },
        legacyPublicRelease().artifacts[1],
        legacyPublicRelease().artifacts[2],
      ],
    },
    { publishedAt: "2026-08-20 00:00:00" },
  ])("rejects an incomplete or unsafe public release %#", (replacement) => {
    expect(() => parsePublicWindowsReleaseResponse({
      ...publicRelease(),
      ...replacement,
    })).toThrow();
  });

  it("accepts the legacy ordered three-artifact response during the website cutover", () => {
    const response = legacyPublicRelease();

    expect(parsePublicWindowsReleaseResponse(response)).toEqual(response);
  });

  it("accepts a verified Authenticode-signed public release", () => {
    expect(parsePublicWindowsReleaseResponse({
      ...publicRelease(),
      unsignedEarlyTest: false,
    }).unsignedEarlyTest).toBe(false);
  });

  it("parses an exact download-ticket request", () => {
    const request = {
      packageCode: "studybuddy.windows-x64_stable",
      proof,
    };

    expect(parseDownloadTicketRequest(request)).toEqual(request);
    expect(() =>
      parseDownloadTicketRequest({ ...request, userId: "other-user" }),
    ).toThrow("download ticket request");
  });

  it("restricts package codes to bounded URL-safe identifiers", () => {
    expect(() =>
      parseDownloadTicketRequest({
        packageCode: "",
        proof,
      }),
    ).toThrow("packageCode");
    expect(() =>
      parseDownloadTicketRequest({
        packageCode: "StudyBuddy Windows",
        proof,
      }),
    ).toThrow("packageCode");
    expect(() =>
      parseDownloadTicketRequest({
        packageCode: "a".repeat(101),
        proof,
      }),
    ).toThrow("packageCode");
  });

  it("requires an exact canonical 32-byte redeem ticket", () => {
    const request = { ticket: "A".repeat(43) };

    expect(parseDownloadRedeemRequest(request)).toEqual(request);
    expect(() =>
      parseDownloadRedeemRequest({
        ...request,
        packageCode: "must-not-select-another-package",
      }),
    ).toThrow("download redeem request");
    expect(() =>
      parseDownloadRedeemRequest({ ticket: "A".repeat(42) }),
    ).toThrow("ticket");
    expect(() =>
      parseDownloadRedeemRequest({ ticket: "A".repeat(44) }),
    ).toThrow("ticket");
    expect(() =>
      parseDownloadRedeemRequest({
        ticket: `${"A".repeat(42)}B`,
      }),
    ).toThrow("ticket");
  });
});

function publicRelease() {
  return {
    packageCode: "studybuddy-windows-x64",
    version: "1.0.0",
    platform: "windows",
    architecture: "x64",
    channel: "stable",
    publishedAt: "2026-08-20T00:00:00.000Z",
    unsignedEarlyTest: false,
    artifacts: [
      {
        kind: "installer_exe",
        fileName: "StudyBuddy-Windows-x64-1.0.0.exe",
        fileSizeBytes: "4500000",
        sha256: "a".repeat(64),
        downloadUrl:
          "https://guijitongzhuo.com/studybuddy-releases/dsh-desk/bin/win-x64/StudyBuddy-Windows-x64-1.0.0.exe",
      },
    ],
  } as const;
}

function legacyPublicRelease() {
  const current = publicRelease();
  return {
    ...current,
    artifacts: [
      { ...current.artifacts[0], expiresInSeconds: 1800 },
      {
        kind: "portable_zip",
        fileName: "StudyBuddy-1.0.0-windows-x64.zip",
        fileSizeBytes: "4600000",
        sha256: "b".repeat(64),
        downloadUrl:
          "https://guijitongzhuo.com/studybuddy-releases/StudyBuddy-1.0.0-windows-x64.zip?signature=test",
        expiresInSeconds: 1800,
      },
      {
        kind: "updater_nsis",
        fileName: "StudyBuddy_1.0.0_x64-setup.nsis.zip",
        fileSizeBytes: "4550000",
        sha256: "c".repeat(64),
        downloadUrl:
          "https://guijitongzhuo.com/studybuddy-releases/StudyBuddy_1.0.0_x64-setup.nsis.zip?signature=test",
        expiresInSeconds: 1800,
      },
    ],
  } as const;
}
