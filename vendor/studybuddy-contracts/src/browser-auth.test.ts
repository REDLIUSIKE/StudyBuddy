import { describe, expect, it } from "vitest";

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  DESKTOP_AUTH_CODE_TTL_SECONDS,
  DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS,
  DESKTOP_AUTH_REQUEST_TTL_SECONDS,
  isDesktopAuthCallback,
  parseDesktopAuthApproveResponse,
  parseDesktopAuthCallback,
  parseDesktopAuthCancelRequest,
  parseDesktopAuthExchangeRequest,
  parseDesktopAuthPollRequest,
  parseDesktopAuthPollResponse,
  parseDesktopAuthRequestView,
  parseDesktopAuthStartRequest,
  parseDesktopAuthStartResponse,
} from "./browser-auth.js";
import {
  isDesktopAuthCallback as isDesktopAuthCallbackFromRoot,
  type DesktopAuthStartRequest,
} from "./index.js";

const REQUEST_ID = "96a9f5cb-16ba-45ca-a296-799c77df280f";
const STATE = "A".repeat(43);
const CHALLENGE = "B".repeat(43);
const VERIFIER = "C".repeat(43);
const CANCEL_TOKEN = "D".repeat(43);
const POLL_TOKEN = "F".repeat(43);
const AUTHORIZATION_CODE = `dc1.${"E".repeat(43)}`;
const CALLBACK =
  `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}`;

describe("desktop browser authorization contracts", () => {
  it("publishes the fixed lifetimes and legal versions from the package root", () => {
    expect(DESKTOP_AUTH_REQUEST_TTL_SECONDS).toBe(300);
    expect(DESKTOP_AUTH_CODE_TTL_SECONDS).toBe(60);
    expect(DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS).toBe(2_000);
    expect(CURRENT_TERMS_VERSION).toBe("2026-08-08");
    expect(CURRENT_PRIVACY_VERSION).toBe("2026-08-08");
    expect(isDesktopAuthCallbackFromRoot(CALLBACK)).toBe(true);
  });

  it("parses the exact S256 desktop start request", () => {
    const request: DesktopAuthStartRequest = {
      state: STATE,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: "S256",
      clientLabel: "StudyBuddy Windows",
    };

    expect(parseDesktopAuthStartRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopAuthStartRequest({
        ...request,
        callbackUrl: "https://attacker.invalid/callback",
      }),
    ).toThrow("desktop auth start request");
    expect(() =>
      parseDesktopAuthStartRequest({ ...request, state: "A".repeat(42) }),
    ).toThrow("state");
    expect(() =>
      parseDesktopAuthStartRequest({
        ...request,
        codeChallenge: `${"B".repeat(42)}+`,
      }),
    ).toThrow("codeChallenge");
    expect(() =>
      parseDesktopAuthStartRequest({
        ...request,
        codeChallengeMethod: "plain",
      }),
    ).toThrow("codeChallengeMethod");
    expect(() =>
      parseDesktopAuthStartRequest({
        ...request,
        clientLabel: "Other client",
      }),
    ).toThrow("clientLabel");
  });

  it("parses the bounded start response without permitting session data", () => {
    const response = {
      requestId: REQUEST_ID,
      authorizationUrl:
        `https://guijitongzhuo.com/login/desktop?request=${REQUEST_ID}`,
      cancelToken: CANCEL_TOKEN,
      pollToken: POLL_TOKEN,
      nextPollAfterMs: 2_000,
      expiresInSeconds: 300,
    };

    expect(parseDesktopAuthStartResponse(response)).toEqual(response);
    expect(() =>
      parseDesktopAuthStartResponse({
        ...response,
        requestId: REQUEST_ID.toUpperCase(),
      }),
    ).toThrow("requestId");
    for (const authorizationUrl of [
      `http://guijitongzhuo.com/login/desktop?request=${REQUEST_ID}`,
      `https://user@guijitongzhuo.com/login/desktop?request=${REQUEST_ID}`,
      `https://guijitongzhuo.com:444/login/desktop?request=${REQUEST_ID}`,
      `https://wrong.guijitongzhuo.com/login/desktop?request=${REQUEST_ID}`,
      `https://guijitongzhuo.com/api?request=${REQUEST_ID}`,
      `https://guijitongzhuo.com/login/desktop?request=${REQUEST_ID}#x`,
      `https://guijitongzhuo.com/login/desktop?request=${REQUEST_ID}&origin=https%3A%2F%2Fevil.invalid`,
      `https://guijitongzhuo.com/login/desktop?request=123e4567-e89b-42d3-a456-426614174001`,
    ]) {
      expect(() =>
        parseDesktopAuthStartResponse({
          ...response,
          authorizationUrl,
        }),
      ).toThrow("authorizationUrl");
    }
    expect(() =>
      parseDesktopAuthStartResponse({
        ...response,
        accessToken: "must-not-cross-wire",
      }),
    ).toThrow("desktop auth start response");
  });

  it.each([
    `https://guijitongzhuo.com:443/login/desktop?request=${REQUEST_ID}`,
    `https://GUIJITONGZHUO.COM/login/desktop?request=${REQUEST_ID}`,
    `HTTPS://guijitongzhuo.com/login/desktop?request=${REQUEST_ID}`,
    `https://guijitongzhuo.com/login/%64esktop?request=${REQUEST_ID}`,
    `https://guijitongzhuo.com/login/desktop?%72equest=${REQUEST_ID}`,
    `https://guijitongzhuo.com/login/desktop?request=%39${REQUEST_ID.slice(1)}`,
  ])(
    "rejects a normalized-equivalent authorization URL: %s",
    (authorizationUrl) => {
      expect(() => parseDesktopAuthStartResponse({
        requestId: REQUEST_ID,
        authorizationUrl,
        cancelToken: CANCEL_TOKEN,
        pollToken: POLL_TOKEN,
        nextPollAfterMs: 2_000,
        expiresInSeconds: 300,
      })).toThrow("authorizationUrl");
    },
  );

  it("keeps request inspection status closed and hides consumed state", () => {
    for (const status of [
      "pending",
      "approved",
      "cancelled",
      "expired",
    ] as const) {
      expect(parseDesktopAuthRequestView({ status })).toEqual({ status });
    }

    expect(() => parseDesktopAuthRequestView({ status: "consumed" })).toThrow(
      "status",
    );
    expect(() =>
      parseDesktopAuthRequestView({ status: "pending", userId: REQUEST_ID }),
    ).toThrow("desktop auth request view");
  });

  it("parses exact exchange and cancellation capabilities", () => {
    expect(
      parseDesktopAuthExchangeRequest({
        authorizationCode: AUTHORIZATION_CODE,
        codeVerifier: VERIFIER,
      }),
    ).toEqual({
      authorizationCode: AUTHORIZATION_CODE,
      codeVerifier: VERIFIER,
    });
    expect(
      parseDesktopAuthCancelRequest({
        requestId: REQUEST_ID,
        cancelToken: CANCEL_TOKEN,
      }),
    ).toEqual({ requestId: REQUEST_ID, cancelToken: CANCEL_TOKEN });

    expect(() =>
      parseDesktopAuthExchangeRequest({
        authorizationCode: `dc.${"E".repeat(43)}`,
        codeVerifier: VERIFIER,
      }),
    ).toThrow("authorizationCode");
    expect(() =>
      parseDesktopAuthExchangeRequest({
        authorizationCode: AUTHORIZATION_CODE,
        codeVerifier: `${"C".repeat(42)}=`,
      }),
    ).toThrow("codeVerifier");
    expect(() =>
      parseDesktopAuthCancelRequest({
        requestId: REQUEST_ID,
        cancelToken: CANCEL_TOKEN,
        refreshToken: "must-not-cross-wire",
      }),
    ).toThrow("desktop auth cancel request");
  });

  it("parses an exact poll capability without accepting browser session data", () => {
    const request = {
      requestId: REQUEST_ID,
      pollToken: POLL_TOKEN,
      codeVerifier: VERIFIER,
    };

    expect(parseDesktopAuthPollRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopAuthPollRequest({ ...request, accessToken: "must-not-cross-wire" }),
    ).toThrow("desktop auth poll request");
    expect(() =>
      parseDesktopAuthPollRequest({ ...request, pollToken: "F".repeat(42) }),
    ).toThrow("pollToken");
  });

  it("keeps pending polls token-free and accepts tokens only after authentication", () => {
    expect(
      parseDesktopAuthPollResponse({
        status: "pending",
        nextPollAfterMs: 2_000,
      }),
    ).toEqual({ status: "pending", nextPollAfterMs: 2_000 });

    const authenticated = {
      status: "authenticated" as const,
      accessToken: "at1.valid-access-token",
      accessTokenExpiresInSeconds: 900,
      refreshToken: "rt1.valid-refresh-token",
      refreshTokenExpiresInSeconds: 2_592_000,
    };
    expect(parseDesktopAuthPollResponse(authenticated)).toEqual(authenticated);

    expect(() =>
      parseDesktopAuthPollResponse({
        status: "pending",
        nextPollAfterMs: 2_000,
        accessToken: "must-not-cross-wire",
      }),
    ).toThrow("desktop auth poll response");
    expect(() =>
      parseDesktopAuthPollResponse({
        ...authenticated,
        nextPollAfterMs: 2_000,
      }),
    ).toThrow("desktop auth poll response");
  });

  it("accepts only the exact StudyBuddy callback boundary", () => {
    expect(isDesktopAuthCallback(CALLBACK)).toBe(true);
    expect(parseDesktopAuthCallback(CALLBACK)).toEqual({
      authorizationCode: AUTHORIZATION_CODE,
      state: STATE,
    });

    for (const value of [
      `https://auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://evil/callback?code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://auth/other?code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}#fragment`,
      `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}&token=secret`,
      `studybuddy://user@auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://auth:123/callback?code=${AUTHORIZATION_CODE}&state=${STATE}`,
      `studybuddy://auth/callback?code=dc.${"E".repeat(43)}&state=${STATE}`,
      `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&state=${"A".repeat(44)}`,
    ]) {
      expect(isDesktopAuthCallback(value), value).toBe(false);
      expect(() => parseDesktopAuthCallback(value), value).toThrow(
        "desktop auth callback",
      );
    }
  });

  it("parses an approve response only when it carries one safe callback", () => {
    expect(parseDesktopAuthApproveResponse({ redirectUrl: CALLBACK })).toEqual({
      redirectUrl: CALLBACK,
    });
    expect(() =>
      parseDesktopAuthApproveResponse({
        redirectUrl: CALLBACK,
        phone: "must-not-cross-wire",
      }),
    ).toThrow("desktop auth approve response");
    expect(() =>
      parseDesktopAuthApproveResponse({
        redirectUrl:
          `studybuddy://auth/callback?code=${AUTHORIZATION_CODE}&state=${STATE}&accessToken=secret`,
      }),
    ).toThrow("redirectUrl");
  });
});
