import { describe, expect, it } from "vitest";

import {
  parsePendingToolDeviceToken,
  parseToolCredentialExchangeRequest,
  parseToolCredentialExchangeResult,
  parseToolDeviceTokenActivation,
  parseToolDeviceTokenActivationBody,
  parseToolDeviceTokenCancelResult,
  parseToolDeviceTokenEmptyQuery,
  parseToolDeviceTokenHandleRevision,
  parseToolDeviceTokenIssueBody,
  parseToolDeviceTokenRevokeBody,
  parseToolDeviceTokenRevokeResult,
  parseToolDeviceTokenSummary,
  parseToolDeviceTokenToolId,
  toolDeviceTokenScopeFor,
} from "./tool-device-token.js";

const HANDLE = "a0000000-0000-4000-8000-00000000000b";
const TOKEN = "A".repeat(48);
const PENDING_AT = "2026-08-19T00:02:00.000Z";
const ACTIVATED_AT = "2026-08-19T00:00:02.000Z";
const REVOKED_AT = "2026-08-19T00:05:00.000Z";
const REQUEST_ID = "b0000000-0000-4000-8000-00000000000c";
const RECEIPT_REVISION = 9;

const pendingFixture = {
  token: TOKEN,
  handle: HANDLE,
  toolId: "codex",
  scope: "responses:create",
  revision: 1,
  pendingExpiresAt: PENDING_AT,
} as const;

describe("long-lived tool device token contracts", () => {
  it("accepts exactly the two production tools and binds each to its own scope", () => {
    expect(parseToolDeviceTokenToolId("codex")).toBe("codex");
    expect(parseToolDeviceTokenToolId("claude_code")).toBe("claude_code");
    expect(toolDeviceTokenScopeFor("codex")).toBe("responses:create");
    expect(toolDeviceTokenScopeFor("claude_code")).toBe("messages:create");
    for (const value of ["claude-code", "CODEX", "../codex", "", 1, null]) {
      expect(() => parseToolDeviceTokenToolId(value)).toThrow(
        "TOOL_DEVICE_TOKEN_TOOL_INVALID",
      );
    }
  });

  it.each([
    ["codex", "responses:create"],
    ["claude_code", "messages:create"],
  ] as const)("parses the canonical %s/%s pending pair", (toolId, scope) => {
    expect(parsePendingToolDeviceToken({ ...pendingFixture, toolId, scope })).toMatchObject({
      toolId,
      scope,
    });
  });

  it.each([
    ["codex", "messages:create"],
    ["claude_code", "responses:create"],
    ["claude-code", "messages:create"],
  ])("rejects the crossed or unknown %s/%s pending pair", (toolId, scope) => {
    expect(() => parsePendingToolDeviceToken({ ...pendingFixture, toolId, scope })).toThrow(
      "TOOL_DEVICE_TOKEN_PENDING_INVALID",
    );
  });

  it("accepts no public identity or secret carrier when issuing or querying", () => {
    expect(parseToolDeviceTokenIssueBody(undefined)).toEqual({});
    expect(parseToolDeviceTokenIssueBody({})).toEqual({});
    expect(parseToolDeviceTokenEmptyQuery(undefined)).toEqual({});
    expect(parseToolDeviceTokenEmptyQuery({})).toEqual({});

    for (const carrier of [
      { userId: HANDLE },
      { deviceId: HANDLE },
      { serviceBackendUserId: "7" },
      { toolId: "codex" },
      { scope: "responses:create" },
      { token: TOKEN },
      { revision: 1 },
    ]) {
      expect(() => parseToolDeviceTokenIssueBody(carrier)).toThrow(
        "TOOL_DEVICE_TOKEN_ISSUE_INVALID",
      );
      expect(() => parseToolDeviceTokenEmptyQuery(carrier)).toThrow(
        "TOOL_DEVICE_TOKEN_QUERY_INVALID",
      );
    }
  });

  it("accepts one canonical pending bearer and rejects noncanonical base64url encodings", () => {
    expect(parsePendingToolDeviceToken(pendingFixture)).toEqual(pendingFixture);
    expect(parsePendingToolDeviceToken({
      ...pendingFixture,
      token: "A".repeat(48),
    })).toMatchObject({ token: "A".repeat(48) });

    for (const token of [
      "A".repeat(42),
      "A".repeat(44),
      `${"A".repeat(42)}=`,
      `${"A".repeat(42)}B`,
      `${"A".repeat(42)}+`,
      `${"A".repeat(42)}/`,
    ]) {
      expect(() =>
        parsePendingToolDeviceToken({ ...pendingFixture, token }),
      ).toThrow("TOOL_DEVICE_TOKEN_PENDING_INVALID");
    }
  });

  it("rejects identity, digest, expiry, and provider fields in the pending response", () => {
    for (const forbidden of [
      { userId: HANDLE },
      { deviceId: HANDLE },
      { credentialDigest: "d".repeat(64) },
      { expiresAt: "2027-08-19T00:00:00.000Z" },
      { refreshAt: "2026-08-20T00:00:00.000Z" },
      { providerPayload: "secret" },
    ]) {
      expect(() =>
        parsePendingToolDeviceToken({ ...pendingFixture, ...forbidden }),
      ).toThrow("TOOL_DEVICE_TOKEN_PENDING_INVALID");
    }
  });

  it("requires canonical handles, safe positive revisions, and real UTC millisecond instants", () => {
    expect(
      parsePendingToolDeviceToken({
        ...pendingFixture,
        revision: Number.MAX_SAFE_INTEGER,
      }).revision,
    ).toBe(Number.MAX_SAFE_INTEGER);

    for (const mutation of [
      { handle: HANDLE.toUpperCase() },
      { handle: "10000000-0000-0000-0000-000000000001" },
      { revision: 0 },
      { revision: -1 },
      { revision: 1.5 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { pendingExpiresAt: "2026-02-30T00:02:00.000Z" },
      { pendingExpiresAt: "2026-08-19T00:02:00Z" },
      { pendingExpiresAt: "2026-08-19T08:02:00.000+08:00" },
    ]) {
      expect(() =>
        parsePendingToolDeviceToken({ ...pendingFixture, ...mutation }),
      ).toThrow("TOOL_DEVICE_TOKEN_PENDING_INVALID");
    }
  });

  it("accepts receipt-bound pending cancellation while preserving legacy handle-only parsing", () => {
    expect(parseToolDeviceTokenHandleRevision({ handle: HANDLE, revision: 4 })).toEqual({
      handle: HANDLE,
      revision: 4,
    });
    expect(parseToolDeviceTokenHandleRevision({
      handle: HANDLE,
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
    })).toEqual({
      handle: HANDLE,
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
    });
    expect(() => parseToolDeviceTokenHandleRevision({
      handle: HANDLE,
      revision: 4,
      receiptRevision: 0,
    })).toThrow("TOOL_DEVICE_TOKEN_HANDLE_REVISION_INVALID");
    expect(() => parseToolDeviceTokenActivationBody({ handle: HANDLE, revision: 4 })).toThrow(
      "TOOL_DEVICE_TOKEN_ACTIVATION_BODY_INVALID",
    );
    expect(parseToolDeviceTokenActivationBody({
      handle: HANDLE,
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
    })).toEqual({ handle: HANDLE, revision: 4, receiptRevision: RECEIPT_REVISION });
    expect(
      parseToolDeviceTokenRevokeBody({
        handle: HANDLE,
        revision: 4,
        receiptRevision: RECEIPT_REVISION,
        reason: "explicit_deactivate",
      }),
    ).toEqual({
      handle: HANDLE,
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
      reason: "explicit_deactivate",
    });

    for (const body of [
      { handle: HANDLE, revision: 0, receiptRevision: RECEIPT_REVISION },
      { handle: HANDLE, revision: 4, receiptRevision: 0 },
      { handle: HANDLE, revision: 4, receiptRevision: 1.5 },
      { handle: HANDLE, revision: 4, receiptRevision: RECEIPT_REVISION, deviceId: HANDLE },
      { handle: HANDLE, revision: 4, receiptRevision: RECEIPT_REVISION, reason: "logout" },
      { handle: HANDLE, revision: 4, receiptRevision: RECEIPT_REVISION, reason: "app_exit" },
    ]) {
      if ("reason" in body) {
        expect(() => parseToolDeviceTokenRevokeBody(body)).toThrow(
          "TOOL_DEVICE_TOKEN_REVOKE_INVALID",
        );
      } else {
        expect(() => parseToolDeviceTokenActivationBody(body)).toThrow(
          "TOOL_DEVICE_TOKEN_ACTIVATION_BODY_INVALID",
        );
      }
    }
  });

  it("parses active, cancelled, and revoked results without an active expiry or secret", () => {
    const activation = {
      handle: HANDLE,
      toolId: "codex",
      scope: "responses:create",
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
      status: "active",
      activatedAt: ACTIVATED_AT,
    } as const;
    expect(parseToolDeviceTokenActivation(activation)).toEqual(activation);
    expect(
      parseToolDeviceTokenCancelResult({ handle: HANDLE, revision: 5, status: "cancelled" }),
    ).toEqual({ handle: HANDLE, revision: 5, status: "cancelled" });
    expect(
      parseToolDeviceTokenRevokeResult({
        handle: HANDLE,
        revision: 4,
        receiptRevision: RECEIPT_REVISION,
        status: "revoked",
      }),
    ).toEqual({
      handle: HANDLE,
      revision: 4,
      receiptRevision: RECEIPT_REVISION,
      status: "revoked",
    });

    for (const forbidden of [
      { expiresAt: "2027-08-19T00:00:00.000Z" },
      { token: TOKEN },
      { credential: TOKEN },
      { credentialDigest: "d".repeat(64) },
    ]) {
      expect(() => parseToolDeviceTokenActivation({ ...activation, ...forbidden })).toThrow(
        "TOOL_DEVICE_TOKEN_ACTIVATION_INVALID",
      );
    }
  });

  it("enforces the exact timestamp and reason matrix for every public status", () => {
    const fixtures = [
      {
        status: "pending",
        receiptRevision: null,
        activatedAt: null,
        revokedAt: null,
        revocationReason: null,
      },
      {
        status: "active",
        receiptRevision: RECEIPT_REVISION,
        activatedAt: ACTIVATED_AT,
        revokedAt: null,
        revocationReason: null,
      },
      {
        status: "cancelled",
        receiptRevision: null,
        activatedAt: null,
        revokedAt: REVOKED_AT,
        revocationReason: "pending_timeout",
      },
      {
        status: "revoked",
        receiptRevision: RECEIPT_REVISION,
        activatedAt: ACTIVATED_AT,
        revokedAt: REVOKED_AT,
        revocationReason: "logout",
      },
      {
        status: "revoked",
        receiptRevision: RECEIPT_REVISION,
        activatedAt: ACTIVATED_AT,
        revokedAt: REVOKED_AT,
        revocationReason: "connection_reset",
      },
    ] as const;

    for (const state of fixtures) {
      const summary = {
        handle: HANDLE,
        toolId: "codex",
        scope: "responses:create",
        revision: 4,
        ...state,
      };
      expect(parseToolDeviceTokenSummary(summary)).toEqual(summary);
    }

    for (const invalid of [
      { status: "active", receiptRevision: RECEIPT_REVISION, activatedAt: null, revokedAt: null, revocationReason: null },
      { status: "active", receiptRevision: null, activatedAt: ACTIVATED_AT, revokedAt: null, revocationReason: null },
      { status: "active", receiptRevision: 0, activatedAt: ACTIVATED_AT, revokedAt: null, revocationReason: null },
      { status: "active", receiptRevision: RECEIPT_REVISION, activatedAt: ACTIVATED_AT, revokedAt: REVOKED_AT, revocationReason: "logout" },
      { status: "pending", receiptRevision: null, activatedAt: null, revokedAt: REVOKED_AT, revocationReason: "pending_timeout" },
      { status: "pending", receiptRevision: RECEIPT_REVISION, activatedAt: null, revokedAt: null, revocationReason: null },
      { status: "cancelled", receiptRevision: null, activatedAt: null, revokedAt: REVOKED_AT, revocationReason: "logout" },
      { status: "revoked", receiptRevision: RECEIPT_REVISION, activatedAt: null, revokedAt: REVOKED_AT, revocationReason: "logout" },
      { status: "revoked", receiptRevision: null, activatedAt: ACTIVATED_AT, revokedAt: REVOKED_AT, revocationReason: "logout" },
      { status: "revoked", receiptRevision: RECEIPT_REVISION, activatedAt: ACTIVATED_AT, revokedAt: REVOKED_AT, revocationReason: "pending_timeout" },
      { status: "expired", receiptRevision: RECEIPT_REVISION, activatedAt: ACTIVATED_AT, revokedAt: REVOKED_AT, revocationReason: "expired" },
    ]) {
      expect(() =>
        parseToolDeviceTokenSummary({
          handle: HANDLE,
          toolId: "codex",
          scope: "responses:create",
          revision: 4,
          ...invalid,
        }),
      ).toThrow("TOOL_DEVICE_TOKEN_SUMMARY_INVALID");
    }
  });

  it("represents migration-invalidated historical active rows only as revoked without a guessed receipt", () => {
    const migrated = {
      handle: HANDLE,
      toolId: "codex",
      scope: "responses:create",
      revision: 4,
      receiptRevision: null,
      status: "revoked",
      activatedAt: ACTIVATED_AT,
      revokedAt: REVOKED_AT,
      revocationReason: "receipt_binding_migration",
    } as const;
    expect(parseToolDeviceTokenSummary(migrated)).toEqual(migrated);
  });

  it("strictly parses receipt-bound credential exchange without accepting tool identity", () => {
    const request = {
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION,
      adapterIdentity: "studybuddy.codex.v1",
      managedConfigSha256: "a".repeat(64),
      requestId: REQUEST_ID,
    };
    expect(parseToolCredentialExchangeRequest(request)).toEqual(request);
    for (const invalid of [
      { ...request, credentialRevision: 0 },
      { ...request, receiptRevision: 0 },
      { ...request, receiptRevision: 1.5 },
      { ...request, managedConfigSha256: "A".repeat(64) },
      { ...request, requestId: "not-a-uuid" },
      { ...request, toolId: "codex" },
    ]) {
      expect(() => parseToolCredentialExchangeRequest(invalid)).toThrow(
        "TOOL_CREDENTIAL_EXCHANGE_REQUEST_INVALID",
      );
    }
  });

  it("rejects multiline bearers, noncanonical expiry, unknown fields, and exchange revision mismatches", () => {
    const result = {
      bearer: "short-lived-bearer",
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION,
      expiresAt: "2026-09-17T12:00:00.000Z",
    };
    expect(parseToolCredentialExchangeResult(result, {
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION,
    })).toEqual(result);
    for (const invalid of [
      { ...result, bearer: "" },
      { ...result, bearer: "secret\nsecond-line" },
      { ...result, expiresAt: "2026-09-17T12:00:00Z" },
      { ...result, extra: true },
    ]) {
      expect(() => parseToolCredentialExchangeResult(invalid)).toThrow(
        "TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID",
      );
    }
    expect(() => parseToolCredentialExchangeResult(result, {
      credentialRevision: 8,
      receiptRevision: RECEIPT_REVISION,
    })).toThrow("TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID");
    expect(() => parseToolCredentialExchangeResult(result, {
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION + 1,
    })).toThrow("TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID");
  });

  it("rejects non-plain objects and inherited values at every public parser boundary", () => {
    const inherited = Object.create(pendingFixture) as object;
    for (const value of [null, [], inherited, new Date(), "pending"]) {
      expect(() => parsePendingToolDeviceToken(value)).toThrow(
        "TOOL_DEVICE_TOKEN_PENDING_INVALID",
      );
    }
  });
});
