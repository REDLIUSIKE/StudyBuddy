import { describe, expect, it } from "vitest";

import {
  DeviceMutationRequestParseError,
  parseDeviceChallengeRequest,
  parseDeviceChallengePurpose,
  parseCurrentDeviceResponse,
  parseDeviceDisplayName,
  parseDeviceMutationRequest,
  parseDeviceProofInput,
  parseIdempotencyKeyValue,
  parseSupportResetRequest,
} from "./device-authorization.js";

describe("device authorization contracts", () => {
  it("accepts only supported challenge purposes", () => {
    expect(parseDeviceChallengePurpose("bind")).toBe("bind");
    expect(parseDeviceChallengePurpose("transfer")).toBe("transfer");
    expect(parseDeviceChallengePurpose("download")).toBe("download");
    expect(() => parseDeviceChallengePurpose("other")).toThrow("purpose");
  });

  it("parses exact challenge request bodies at the shared wire boundary", () => {
    expect(
      parseDeviceChallengeRequest({ purpose: "bind" }),
    ).toEqual({ purpose: "bind" });
    expect(() =>
      parseDeviceChallengeRequest({
        purpose: "bind",
        userId: "must-not-cross-wire",
      }),
    ).toThrow("device challenge request");
    expect(() => parseDeviceChallengeRequest({})).toThrow(
      "device challenge request",
    );
  });

  it("parses an exact device proof and rejects unknown fields", () => {
    const proof = {
      challengeId: "ac67d629-7f1f-4381-a453-009f48252332",
      publicKeyBase64url: "A".repeat(59),
      signatureBase64url: "A".repeat(86),
    };

    expect(parseDeviceProofInput(proof)).toEqual(proof);
    expect(() =>
      parseDeviceProofInput({ ...proof, privateKey: "must-not-pass" }),
    ).toThrow("device proof");
  });

  it("rejects non-canonical challenge IDs, oversized keys, and non-64-byte signatures", () => {
    const proof = {
      challengeId: "ac67d629-7f1f-4381-a453-009f48252332",
      publicKeyBase64url: "A".repeat(59),
      signatureBase64url: "A".repeat(86),
    };

    expect(() =>
      parseDeviceProofInput({
        ...proof,
        challengeId: proof.challengeId.toUpperCase(),
      }),
    ).toThrow("challengeId");
    expect(() =>
      parseDeviceProofInput({
        ...proof,
        publicKeyBase64url: "A".repeat(172),
      }),
    ).toThrow("publicKeyBase64url");
    expect(() =>
      parseDeviceProofInput({
        ...proof,
        signatureBase64url: "A".repeat(84),
      }),
    ).toThrow("signatureBase64url");
    expect(() =>
      parseDeviceProofInput({
        ...proof,
        signatureBase64url: "A".repeat(87),
      }),
    ).toThrow("signatureBase64url");
  });

  it("trims device names and counts Unicode code points", () => {
    expect(parseDeviceDisplayName("  刘同学的电脑  ")).toBe("刘同学的电脑");
    expect(parseDeviceDisplayName("😀".repeat(80))).toBe("😀".repeat(80));
    expect(() => parseDeviceDisplayName("😀".repeat(81))).toThrow(
      "displayName",
    );
    expect(() => parseDeviceDisplayName("   ")).toThrow("displayName");
  });

  it("parses an exact mutation body with normalized display name and proof", () => {
    const proof = {
      challengeId: "ac67d629-7f1f-4381-a453-009f48252332",
      publicKeyBase64url: "A".repeat(59),
      signatureBase64url: "A".repeat(86),
    };
    expect(
      parseDeviceMutationRequest({
        displayName: "  刘同学的电脑  ",
        proof,
      }),
    ).toEqual({
      displayName: "刘同学的电脑",
      proof,
    });
    expect(() =>
      parseDeviceMutationRequest({
        displayName: "刘同学的电脑",
        proof,
        privateKey: "must-not-cross-wire",
      }),
    ).toThrow("device mutation request");

    try {
      parseDeviceMutationRequest({
        displayName: "刘同学的电脑",
        proof: { ...proof, signatureBase64url: "invalid" },
      });
      throw new Error("expected parser to reject malformed proof");
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceMutationRequestParseError);
      expect(error).toMatchObject({ kind: "proof" });
    }
  });

  it("accepts only 16-128 visible ASCII characters for idempotency", () => {
    expect(parseIdempotencyKeyValue("install-request-0001")).toBe(
      "install-request-0001",
    );
    expect(() => parseIdempotencyKeyValue("short")).toThrow(
      "Idempotency-Key",
    );
    expect(() =>
      parseIdempotencyKeyValue(`valid-prefix-${String.fromCharCode(10)}`),
    ).toThrow("Idempotency-Key");
    expect(() => parseIdempotencyKeyValue("a".repeat(129))).toThrow(
      "Idempotency-Key",
    );
  });

  it("parses the exact internal support reset wire body", () => {
    expect(
      parseSupportResetRequest({
        operatorId: "support-1",
        reason: "  用户已通过人工身份复核  ",
      }),
    ).toEqual({
      operatorId: "support-1",
      reason: "用户已通过人工身份复核",
    });
    expect(() =>
      parseSupportResetRequest({
        operatorId: "ab",
        reason: "用户已通过人工身份复核",
      }),
    ).toThrow("operatorId");
    expect(() =>
      parseSupportResetRequest({
        operatorId: "support-1",
        reason: "太短",
      }),
    ).toThrow("reason");
    expect(() =>
      parseSupportResetRequest({
        operatorId: "support-1",
        reason: "用户已通过人工身份复核",
        userId: "must-come-from-path",
      }),
    ).toThrow("support reset request");
  });

  it.each([
    [
      "no device",
      {
        device: null,
        selfTransfer: { allowed: false, availableAt: null },
      },
    ],
    [
      "an immediately transferable device",
      {
        device: {
          id: "20000000-0000-4000-8000-000000000001",
          displayName: "My PC",
          publicKeyFingerprint: "a".repeat(64),
          boundAt: "2026-08-31T08:30:00.000Z",
        },
        selfTransfer: { allowed: true, availableAt: null },
      },
    ],
    [
      "a device in the transfer cooldown",
      {
        device: {
          id: "20000000-0000-4000-8000-000000000001",
          displayName: "My PC",
          publicKeyFingerprint: "a".repeat(64),
          boundAt: "2026-08-31T08:30:00.000Z",
        },
        selfTransfer: {
          allowed: false,
          availableAt: "2026-09-30T08:30:00.000Z",
        },
      },
    ],
  ])("parses the current-device transfer preview for %s", (_name, response) => {
    expect(parseCurrentDeviceResponse(response)).toEqual(response);
  });

  it("rejects malformed or contradictory current-device transfer previews", () => {
    const device = {
      id: "20000000-0000-4000-8000-000000000001",
      displayName: "My PC",
      publicKeyFingerprint: "a".repeat(64),
      boundAt: "2026-08-31T08:30:00.000Z",
    };
    expect(() =>
      parseCurrentDeviceResponse({
        device,
        selfTransfer: {
          allowed: false,
          availableAt: "2026-09-30T08:30:00Z",
        },
      }),
    ).toThrow("availableAt");
    expect(() =>
      parseCurrentDeviceResponse({
        device,
        selfTransfer: { allowed: true, availableAt: "2026-09-30T08:30:00.000Z" },
      }),
    ).toThrow("availableAt");
    expect(() =>
      parseCurrentDeviceResponse({
        device: null,
        selfTransfer: { allowed: true, availableAt: null },
      }),
    ).toThrow("selfTransfer");
  });
});
