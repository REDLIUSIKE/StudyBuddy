import { describe, expect, it } from "vitest";

import {
  CLAUDE_DEEPSEEK_AI_COMBINATION_ID,
  CLAUDE_KIMI_AI_COMBINATION_ID,
  CODEX_KIMI_AI_COMBINATION_ID,
  PLATFORM_AI_COMBINATION_ID,
  PLATFORM_AI_USAGE_IDENTITIES,
  parseAiAccountEmptyQuery,
  parseAiAccountSummary,
  parseAiAccountMutationBody,
  parseAiCredentialRevokeResult,
  parseAiCredentialTicket,
  parseAiGatewayAccountSummary,
  parseAiGatewayUsageDetail,
  parseAiGatewayUsagePage,
  parseAiUsageDetail,
  parseAiUsagePage,
  parseAiUsageQuery,
  parseInternalAiAuthorizationRequest,
  parseInternalAiAuthorizationResponse,
} from "./ai-account.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const DEVICE_ID = "20000000-0000-4000-8000-000000000001";

describe("AI account contracts", () => {
  it("accepts no external mutation identity or configuration body", () => {
    expect(parseAiAccountMutationBody(undefined)).toEqual({});
    expect(parseAiAccountMutationBody({})).toEqual({});
    for (const body of [
      { userId: USER_ID },
      { deviceId: DEVICE_ID },
      { serviceBackendUserId: "7" },
      { combinationId: PLATFORM_AI_COMBINATION_ID },
      { provider: "deepseek" },
      { endpoint: "https://example.invalid" },
    ]) {
      expect(() => parseAiAccountMutationBody(body)).toThrow(
        "AI_ACCOUNT_MUTATION_INVALID",
      );
    }
  });

  it("accepts no query identity or configuration on non-list routes", () => {
    expect(parseAiAccountEmptyQuery({})).toEqual({});
    expect(parseAiAccountEmptyQuery(Object.create(null))).toEqual({});
    expect(() => parseAiAccountEmptyQuery(Object.create({}))).toThrow(
      "AI_ACCOUNT_QUERY_INVALID",
    );
    for (const query of [
      { userId: USER_ID },
      { deviceId: DEVICE_ID },
      { serviceBackendUserId: "7" },
      { combinationId: PLATFORM_AI_COMBINATION_ID },
      { provider: "deepseek" },
      { endpoint: "https://example.invalid" },
    ]) {
      expect(() => parseAiAccountEmptyQuery(query)).toThrow(
        "AI_ACCOUNT_QUERY_INVALID",
      );
    }
  });

  it("accepts only the closed non-secret account summary", () => {
    expect(parseAiAccountSummary(validSummary())).toEqual(validSummary());

    for (const mutation of [
      { balance: 36.8 },
      { balance: "036.8" },
      { balance: "36.80" },
      { availableBalance: "1e-8" },
      { frozenBalance: "0.000000001" },
      { userId: USER_ID },
      { deviceId: DEVICE_ID },
      { serviceBackendUserId: "7" },
      { provider: "deepseek" },
      { endpointUrl: "https://example.invalid" },
      { credential: "secret" },
      { credentialDigest: "digest" },
      { upstreamKey: "key" },
    ]) {
      expect(() =>
        parseAiAccountSummary({ ...validSummary(), ...mutation }),
      ).toThrow("AI_ACCOUNT_SUMMARY_INVALID");
    }
  });

  it("preserves unknown gateway balances and requires complete reported token facts", () => {
    const unavailable = {
      availableBalance: null,
      frozenBalance: null,
      currency: null,
      observedAt: "2026-09-21T00:00:00.000Z",
      syncStatus: "unavailable",
      subscription: null,
    };
    expect(parseAiGatewayAccountSummary(unavailable)).toEqual(unavailable);

    const usage = {
      id: "primary_backend:prod:41",
      modelId: "kimi-k3",
      inputTokens: "12",
      outputTokens: "7",
      chargedAmount: "0.01",
      precision: "reported",
      occurredAt: "2026-09-21T00:01:00.000Z",
    };
    expect(parseAiGatewayUsageDetail(usage)).toEqual(usage);
    expect(parseAiGatewayUsagePage({
      items: [usage],
      total: 1,
      page: 1,
      pageSize: 20,
    })).toEqual({ items: [usage], total: 1, page: 1, pageSize: 20 });
    expect(parseAiGatewayUsageDetail({
      ...usage,
      chargedAmount: null,
      precision: "estimated",
      inputTokens: null,
      outputTokens: null,
    })).toMatchObject({
      chargedAmount: null,
      precision: "estimated",
      inputTokens: null,
      outputTokens: null,
    });
    expect(() =>
      parseAiGatewayUsageDetail({ ...usage, inputTokens: null }),
    ).toThrow("AI_GATEWAY_USAGE_DETAIL_INVALID");
    expect(parseAiGatewayUsageDetail({
      ...usage,
      inputTokens: null,
      outputTokens: null,
      precision: "estimated",
    })).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      precision: "estimated",
    });
  });

  it("keeps ticket plaintext only in the exact bounded ticket success object", () => {
    const ticket = {
      ticket: "A".repeat(43),
      expiresAt: "2026-08-15T01:02:03.000Z",
      combinationId: PLATFORM_AI_COMBINATION_ID,
    };
    expect(parseAiCredentialTicket(ticket)).toEqual(ticket);

    for (const mutation of [
      { ticket: "short" },
      { combinationId: "codex.deepseek.alias" },
      { deviceId: DEVICE_ID },
      { credentialDigest: "digest" },
      { providerUrl: "https://example.invalid" },
    ]) {
      expect(() =>
        parseAiCredentialTicket({ ...ticket, ...mutation }),
      ).toThrow("AI_CREDENTIAL_TICKET_INVALID");
    }
  });

  it("accepts only the fixed idempotent revoke result", () => {
    expect(parseAiCredentialRevokeResult({ status: "revoked" })).toEqual({
      status: "revoked",
    });
    expect(() =>
      parseAiCredentialRevokeResult({
        status: "revoked",
        credentialId: "9",
      }),
    ).toThrow("AI_CREDENTIAL_REVOKE_INVALID");
  });

  it("caps pagination and rejects non-string or unknown query identities", () => {
    expect(parseAiUsageQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseAiUsageQuery({ page: "1000", pageSize: "100" })).toEqual({
      page: 1000,
      pageSize: 100,
    });

    for (const query of [
      { page: "0" },
      { page: "1001" },
      { pageSize: "101" },
      { page: 1 },
      { page: "1.0" },
      { userId: USER_ID },
      { deviceId: DEVICE_ID },
      { provider: "deepseek" },
    ]) {
      expect(() => parseAiUsageQuery(query)).toThrow(
        "AI_USAGE_QUERY_INVALID",
      );
    }
  });

  it("accepts adapter-owned null-prototype pagination without weakening body or response parsing", () => {
    const query = Object.assign(Object.create(null), { page: "2", pageSize: "40" });
    expect(parseAiUsageQuery(query)).toEqual({ page: 2, pageSize: 40 });
    expect(parseAiUsageQuery(Object.create(null))).toEqual({ page: 1, pageSize: 20 });
    expect(() => parseAiAccountMutationBody(Object.create(null))).toThrow("AI_ACCOUNT_MUTATION_INVALID");
    expect(() => parseAiAccountSummary(Object.assign(Object.create(null), validSummary())))
      .toThrow("AI_ACCOUNT_SUMMARY_INVALID");
  });

  it("rejects duplicate, nested, inherited and pollution pagination identities", () => {
    for (const value of [
      Object.create({ page: "2" }),
      Object.assign(Object.create(null), { page: ["1", "2"] }),
      Object.assign(Object.create(null), { page: { value: "1" } }),
      Object.assign(Object.create(null), { userId: USER_ID }),
      Object.assign(Object.create(null), { constructor: "1" }),
      Object.assign(Object.create(null), { ["__proto__"]: "1" }),
      Object.assign(Object.create(null), { [Symbol("page")]: "1" }),
      Object.assign(Object.create(null), { page: "1001" }),
    ]) expect(() => parseAiUsageQuery(value)).toThrow("AI_USAGE_QUERY_INVALID");
  });

  it("strictly parses bounded non-secret usage pages and detail", () => {
    const item = validUsage();
    const page = {
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    expect(parseAiUsagePage(page)).toEqual(page);
    expect(parseAiUsageDetail(item)).toEqual(item);
    for (const identity of PLATFORM_AI_USAGE_IDENTITIES) {
      expect(parseAiUsageDetail({
        ...item,
        tool: identity.tool,
        model: identity.model,
      })).toEqual({
        ...item,
        tool: identity.tool,
        model: identity.model,
      });
    }

    expect(PLATFORM_AI_USAGE_IDENTITIES).toEqual([
      { combinationId: "codex.deepseek.deepseek-flash", tool: "codex", model: "deepseek-flash" },
      { combinationId: "claude_code.deepseek.deepseek-flash", tool: "claude_code", model: "deepseek-flash" },
      { combinationId: "codex.kimi.kimi-k3", tool: "codex", model: "kimi-k3" },
      { combinationId: "claude_code.kimi.kimi-k3", tool: "claude_code", model: "kimi-k3" },
      { combinationId: "codex.deepseek.deepseek-v4-flash", tool: "codex", model: "deepseek-v4-flash" },
      { combinationId: "claude_code.deepseek.deepseek-v4-flash", tool: "claude_code", model: "deepseek-v4-flash" },
      { combinationId: "codex.deepseek.deepseek-v4-flash-vision-exp", tool: "codex", model: "deepseek-v4-flash-vision-exp" },
      { combinationId: "claude_code.deepseek.deepseek-v4-flash-vision-exp", tool: "claude_code", model: "deepseek-v4-flash-vision-exp" },
      { combinationId: "codex.kimi.kimi-k2.6", tool: "codex", model: "kimi-k2.6" },
      { combinationId: "claude_code.kimi.kimi-k2.6", tool: "claude_code", model: "kimi-k2.6" },
      { combinationId: "codex.kimi.kimi-k2.7-code", tool: "codex", model: "kimi-k2.7-code" },
      { combinationId: "claude_code.kimi.kimi-k2.7-code", tool: "claude_code", model: "kimi-k2.7-code" },
      { combinationId: "codex.kimi.kimi-k2.7-code-highspeed", tool: "codex", model: "kimi-k2.7-code-highspeed" },
      { combinationId: "claude_code.kimi.kimi-k2.7-code-highspeed", tool: "claude_code", model: "kimi-k2.7-code-highspeed" },
    ]);
    expect(JSON.stringify(PLATFORM_AI_USAGE_IDENTITIES)).not.toContain(
      "deepseek-v4-pro",
    );
    expect(() => parseAiUsageDetail({
      ...item,
      tool: "claude_code",
      model: "deepseek-v4-flash-vision-exp",
    })).not.toThrow();
    expect(() => parseAiUsageDetail({
      ...item,
      tool: "unknown",
      model: "kimi-k3",
    })).toThrow("AI_USAGE_DETAIL_INVALID");

    for (const mutation of [
      { actualCost: 0.00012345 },
      { reservedAmount: "1.00" },
      { inputTokens: -1 },
      { requestId: "raw-request" },
      { prompt: "secret prompt" },
      { provider: "deepseek" },
      { credentialDigest: "digest" },
      { endpoint: "https://example.invalid" },
    ]) {
      expect(() =>
        parseAiUsageDetail({ ...item, ...mutation }),
      ).toThrow("AI_USAGE_DETAIL_INVALID");
    }

    expect(() =>
      parseAiUsagePage({ ...page, items: Array.from({ length: 101 }, () => item) }),
    ).toThrow("AI_USAGE_PAGE_INVALID");
  });

  it("accepts only the fixed internal authorization body and response", () => {
    const request = {
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      combinationId: PLATFORM_AI_COMBINATION_ID,
      toolId: "codex",
      scope: "responses:create",
    };
    expect(parseInternalAiAuthorizationRequest(request)).toEqual(request);
    expect(parseInternalAiAuthorizationRequest({
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      combinationId: CLAUDE_KIMI_AI_COMBINATION_ID,
      toolId: "claude_code",
      scope: "messages:create",
    })).toEqual({
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      combinationId: CLAUDE_KIMI_AI_COMBINATION_ID,
      toolId: "claude_code",
      scope: "messages:create",
    });
    expect(
      parseInternalAiAuthorizationResponse({
        allowed: false,
        authorizationRevision: 19,
      }),
    ).toEqual({ allowed: false, authorizationRevision: 19 });

    for (const mutation of [
      { combinationId: "codex.deepseek.alias" },
      { toolId: "claude_code" },
      { scope: "messages:create" },
      { userId: USER_ID },
      { serviceApiKey: "secret" },
      { credential: "secret" },
      { balance: "1" },
      { modelAlias: "deepseek" },
      { endpoint: "https://example.invalid" },
      { authorizationRevision: 7 },
    ]) {
      expect(() =>
        parseInternalAiAuthorizationRequest({ ...request, ...mutation }),
      ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
    }

    for (const response of [
      { allowed: true, authorizationRevision: 0 },
      { allowed: true, authorizationRevision: 1.5 },
      { allowed: true, authorizationRevision: 1, userId: USER_ID },
    ]) {
      expect(() => parseInternalAiAuthorizationResponse(response)).toThrow(
        "INTERNAL_AI_AUTHORIZATION_RESPONSE_INVALID",
      );
    }
  });

  it("keeps the four v5 authorization triples during the compatibility window", () => {
    const identities = [
      [PLATFORM_AI_COMBINATION_ID, "codex", "responses:create"],
      [CODEX_KIMI_AI_COMBINATION_ID, "codex", "responses:create"],
      [CLAUDE_DEEPSEEK_AI_COMBINATION_ID, "claude_code", "messages:create"],
      [CLAUDE_KIMI_AI_COMBINATION_ID, "claude_code", "messages:create"],
    ] as const;

    for (const [combinationId, toolId, scope] of identities) {
      expect(
        parseInternalAiAuthorizationRequest({
          studyBuddyUserId: USER_ID,
          deviceId: DEVICE_ID,
          combinationId,
          toolId,
          scope,
        }),
      ).toEqual({
        studyBuddyUserId: USER_ID,
        deviceId: DEVICE_ID,
        combinationId,
        toolId,
        scope,
      });

      const wrongTool = toolId === "codex" ? "claude_code" : "codex";
      const wrongScope =
        scope === "responses:create" ? "messages:create" : "responses:create";
      expect(() =>
        parseInternalAiAuthorizationRequest({
          studyBuddyUserId: USER_ID,
          deviceId: DEVICE_ID,
          combinationId,
          toolId: wrongTool,
          scope,
        }),
      ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
      expect(() =>
        parseInternalAiAuthorizationRequest({
          studyBuddyUserId: USER_ID,
          deviceId: DEVICE_ID,
          combinationId,
          toolId,
          scope: wrongScope,
        }),
      ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
    }

    expect(() =>
      parseInternalAiAuthorizationRequest({
        studyBuddyUserId: USER_ID,
        deviceId: DEVICE_ID,
        combinationId: "claude_code.deepseek.deepseek-chat",
        toolId: "claude_code",
        scope: "messages:create",
      }),
    ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");

    const authorizationWithSymbol = {
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      combinationId: PLATFORM_AI_COMBINATION_ID,
      toolId: "codex",
      scope: "responses:create",
      [Symbol("unexpected")]: true,
    };
    const authorizationWithHiddenField = {
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      combinationId: PLATFORM_AI_COMBINATION_ID,
      toolId: "codex",
      scope: "responses:create",
    };
    Object.defineProperty(authorizationWithHiddenField, "unexpected", {
      value: true,
      enumerable: false,
    });
    expect(() =>
      parseInternalAiAuthorizationRequest(authorizationWithSymbol),
    ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
    expect(() =>
      parseInternalAiAuthorizationRequest(authorizationWithHiddenField),
    ).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
  });

  it("parses dynamic exact provider-model authorization identities without authorizing aliases", () => {
    const dynamic = {
      studyBuddyUserId: USER_ID,
      deviceId: DEVICE_ID,
      providerModelId: "deepseek.deepseek-flash",
      combinationId: "codex.deepseek.deepseek-flash",
      toolId: "codex",
      scope: "responses:create",
    };
    expect(parseInternalAiAuthorizationRequest(dynamic)).toEqual(dynamic);
    expect(() => parseInternalAiAuthorizationRequest({
      ...dynamic,
      providerModelId: "deepseek.deepseek-v4-pro",
      combinationId: "codex.deepseek.deepseek-v4-pro",
    })).toThrow("INTERNAL_AI_AUTHORIZATION_INVALID");
    expect(parseInternalAiAuthorizationRequest({
      ...dynamic,
      providerModelId: "kimi.kimi-k3-thinking",
      combinationId: "codex.kimi.kimi-k3-thinking",
    })).toMatchObject({ providerModelId: "kimi.kimi-k3-thinking" });
    expect(parseInternalAiAuthorizationRequest({
      ...dynamic,
      providerModelId: "kimi.kimi-k2.6",
      combinationId: "codex.kimi.kimi-k2.6",
    })).toMatchObject({ providerModelId: "kimi.kimi-k2.6" });

    for (const mutation of [
      { providerModelId: "deepseek-v4-pro" },
      { providerModelId: "unknown.reviewed-model", combinationId: "codex.unknown.reviewed-model" },
      { providerModelId: "kimi.kimi-k3", combinationId: dynamic.combinationId },
      { toolId: "claude-code" },
      { toolId: "claude_code", scope: "responses:create" },
      { combinationId: "claude-code.deepseek.deepseek-v4-pro" },
      { providerModelId: "deepseek.deepseek-v4-pro", upstreamKey: "secret" },
    ]) {
      expect(() => parseInternalAiAuthorizationRequest({ ...dynamic, ...mutation })).toThrow(
        "INTERNAL_AI_AUTHORIZATION_INVALID",
      );
    }
  });
});

function validSummary() {
  return {
    balance: "36.8",
    frozenBalance: "0.00000001",
    availableBalance: "36.79999999",
    platformAccess: {
      status: "active" as const,
      maskedId: "AAAAAAAA********",
      revision: 3,
      issuedAt: "2026-08-14T01:00:00.000Z",
      expiresAt: "2026-09-13T01:00:00.000Z",
      revokedAt: null,
    },
  };
}

function validUsage() {
  return {
    id: "91",
    requestIdSuffix: "request1",
    tool: "codex" as const,
    model: "deepseek-flash" as const,
    status: "settled" as const,
    reservedAmount: "0.0002",
    actualCost: "0.00012345",
    releasedAmount: "0.00007655",
    inputTokens: 125,
    outputTokens: 17,
    cachedTokens: 40,
    stableCode: null,
    createdAt: "2026-08-14T01:00:00.000Z",
    settledAt: "2026-08-14T01:00:01.000Z",
  };
}
