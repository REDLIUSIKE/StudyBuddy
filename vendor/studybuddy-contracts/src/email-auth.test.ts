import { describe, expect, it, vi } from "vitest";

import {
  EMAIL_CHALLENGE_TTL_SECONDS,
  EMAIL_RESEND_SECONDS,
  normalizeEmailAddress,
  parseBrowserUserView,
  parseEmailChallengeResponse,
  type BrowserUserView,
} from "./index.js";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("email authentication contracts", () => {
  it.each([
    ["Owner+tag@Example.COM", "Owner+tag@example.com"],
    ["  owner@example.com  ", "owner@example.com"],
    [
      `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
      `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
    ],
  ])("normalizes a valid ASCII mailbox: %s", (input, expected) => {
    expect(normalizeEmailAddress(input)).toBe(expected);
  });

  it("normalizes without Node or DOM byte-encoding globals", async () => {
    vi.resetModules();
    vi.stubGlobal("Buffer", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    try {
      const runtimeNeutralContracts = await import("./email-auth.js");
      expect(runtimeNeutralContracts.normalizeEmailAddress("owner@example.com")).toBe(
        "owner@example.com",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    "硅宝 <owner@example.com>",
    "owner@example.com,other@example.com",
    "owner(comment)@example.com",
    "   ",
    "\u00a0owner@example.com\u00a0",
    "owner@exa\u0000mple.com",
    "owner@exam\u212Ale.com",
    `${"a".repeat(65)}@example.com`,
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.com`,
    "owner@[127.0.0.1]",
    "owner@-example.com",
    "owner@example-.com",
    `owner@${"a".repeat(64)}.com`,
    "owner@example",
    ".owner@example.com",
    "owner.@example.com",
    "owner..dot@example.com",
  ])("rejects an invalid mailbox: %s", (input) => {
    expect(() => normalizeEmailAddress(input)).toThrow("email");
  });

  it("accepts only the fixed challenge lifetime response", () => {
    expect(EMAIL_CHALLENGE_TTL_SECONDS).toBe(300);
    expect(EMAIL_RESEND_SECONDS).toBe(60);
    expect(parseEmailChallengeResponse({
      challengeExpiresInSeconds: 300,
      resendAfterSeconds: 60,
    })).toEqual({
      challengeExpiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
  });

  it.each([
    { challengeExpiresInSeconds: 300, resendAfterSeconds: 59 },
    { challengeExpiresInSeconds: 301, resendAfterSeconds: 60 },
    {
      challengeExpiresInSeconds: 300,
      resendAfterSeconds: 60,
      accessToken: "not-a-credential",
    },
  ])("rejects a malformed or expanded challenge response", (response) => {
    expect(() => parseEmailChallengeResponse(response)).toThrow();
  });

  it.each([
    {
      id: USER_ID,
      emailMasked: "o***r@example.com",
      serviceBackendStatus: "ready",
    },
    {
      id: USER_ID,
      phoneMasked: "138****8000",
      serviceBackendStatus: "pending",
    },
    {
      id: USER_ID,
      emailMasked: "o***r@example.com",
      phoneMasked: "138****8000",
      serviceBackendStatus: "failed",
    },
  ] satisfies BrowserUserView[])(
    "parses a browser user with a permitted identity shape",
    (user) => {
      expect(parseBrowserUserView(user)).toEqual(user);
    },
  );

  it.each([
    {
      id: USER_ID,
      emailMasked: "owner@example.com",
      serviceBackendStatus: "ready",
    },
    {
      id: USER_ID,
      emailMasked: "o***r@Example.com",
      serviceBackendStatus: "ready",
    },
    {
      id: USER_ID,
      phoneMasked: "13812348000",
      serviceBackendStatus: "ready",
    },
    { id: USER_ID, serviceBackendStatus: "ready" },
    {
      id: USER_ID,
      emailMasked: "o***r@example.com",
      serviceBackendStatus: "ready",
      role: "admin",
    },
    {
      id: USER_ID.toUpperCase(),
      emailMasked: "o***r@example.com",
      serviceBackendStatus: "ready",
    },
  ])("rejects a malformed or expanded browser user view", (user) => {
    expect(() => parseBrowserUserView(user)).toThrow();
  });
});
