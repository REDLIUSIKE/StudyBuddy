import { describe, expect, it } from "vitest";

import {
  parseDefaultToolModelSelections,
  parseModelSelectionsProjection,
  parseProviderConnectionAuthorities,
  parseUpdateDefaultToolModelSelectionBody,
} from "./model-routing.js";

const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";

describe("exact dynamic model default authority contracts", () => {
  it("parses the frozen default and exact connection authority projections", () => {
    expect(parseDefaultToolModelSelections([{
      toolId: "codex",
      defaultProviderModelId: "deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      defaultProviderConnectionId: CONNECTION_ID,
      defaultRevision: 7,
      fundingAuthorityRevision: 5,
    }])).toEqual([{
      toolId: "codex",
      defaultProviderModelId: "deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      defaultProviderConnectionId: CONNECTION_ID,
      defaultRevision: 7,
      fundingAuthorityRevision: 5,
    }]);

    expect(parseProviderConnectionAuthorities([{
      providerConnectionId: CONNECTION_ID,
      providerId: "deepseek",
      status: "insufficient_balance",
      reason: "CONNECTION_BALANCE_INSUFFICIENT",
      nextAction: "replace_or_reverify_connection",
      connectionRevision: 3,
      capabilityRevision: 2,
      verifierRevision: "deepseek-identity-v1",
      compatibleProviderModelIds: ["deepseek.deepseek-v4-flash"],
    }])).toEqual([{
      providerConnectionId: CONNECTION_ID,
      providerId: "deepseek",
      status: "insufficient_balance",
      reason: "CONNECTION_BALANCE_INSUFFICIENT",
      nextAction: "replace_or_reverify_connection",
      connectionRevision: 3,
      capabilityRevision: 2,
      verifierRevision: "deepseek-identity-v1",
      compatibleProviderModelIds: ["deepseek.deepseek-v4-flash"],
    }]);
  });

  it("carries exact defaults and connection authorities on the dynamic projection", () => {
    const value = parseModelSelectionsProjection({
      tools: [{
        toolId: "codex",
        displayName: "Codex",
        protocol: "openai_responses",
        displayOrder: 10,
      }],
      models: [],
      selections: [],
      connections: [],
      defaults: [{
        toolId: "codex",
        defaultProviderModelId: "deepseek.deepseek-v4-flash",
        fundingSource: "user_api",
        defaultProviderConnectionId: CONNECTION_ID,
        defaultRevision: 7,
        fundingAuthorityRevision: 5,
      }],
      connectionAuthorities: [{
        providerConnectionId: CONNECTION_ID,
        providerId: "deepseek",
        status: "available",
        reason: "AVAILABLE",
        nextAction: null,
        connectionRevision: 3,
        capabilityRevision: 2,
        verifierRevision: "deepseek-identity-v1",
        compatibleProviderModelIds: ["deepseek.deepseek-v4-flash"],
      }],
    });

    expect(value.defaults?.[0]?.fundingAuthorityRevision).toBe(5);
    expect(value.connectionAuthorities?.[0]?.connectionRevision).toBe(3);
  });

  it("accepts an exact user-api default CAS and a platform create CAS", () => {
    expect(parseUpdateDefaultToolModelSelectionBody({
      expectedDefaultRevision: 7,
      expectedFundingAuthorityRevision: 5,
      expectedProviderConnectionRevision: 3,
      defaultProviderModelId: "deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      defaultProviderConnectionId: CONNECTION_ID,
    })).toEqual({
      expectedDefaultRevision: 7,
      expectedFundingAuthorityRevision: 5,
      expectedProviderConnectionRevision: 3,
      defaultProviderModelId: "deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      defaultProviderConnectionId: CONNECTION_ID,
    });

    expect(parseUpdateDefaultToolModelSelectionBody({
      expectedDefaultRevision: 1,
      expectedFundingAuthorityRevision: 0,
      expectedProviderConnectionRevision: null,
      defaultProviderModelId: "kimi.kimi-k3",
      fundingSource: "platform",
      defaultProviderConnectionId: null,
    })).toMatchObject({
      expectedFundingAuthorityRevision: 0,
      expectedProviderConnectionRevision: null,
      defaultProviderConnectionId: null,
    });
  });

  it("rejects stale-authority omissions, funding/connection mismatches, and unknown fields", () => {
    const userApi = {
      expectedDefaultRevision: 7,
      expectedFundingAuthorityRevision: 5,
      expectedProviderConnectionRevision: 3,
      defaultProviderModelId: "deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      defaultProviderConnectionId: CONNECTION_ID,
    } as const;

    for (const malformed of [
      { ...userApi, expectedFundingAuthorityRevision: undefined },
      { ...userApi, expectedProviderConnectionRevision: null },
      { ...userApi, defaultProviderConnectionId: null },
      { ...userApi, defaultProviderModelId: "DeepSeek/model" },
      { ...userApi, unexpected: true },
      {
        ...userApi,
        fundingSource: "platform",
        expectedProviderConnectionRevision: 3,
        defaultProviderConnectionId: CONNECTION_ID,
      },
    ]) {
      expect(() => parseUpdateDefaultToolModelSelectionBody(malformed)).toThrow(
        "MODEL_DEFAULT_AUTHORITY_INVALID",
      );
    }

    expect(() => parseProviderConnectionAuthorities([{
      providerConnectionId: CONNECTION_ID,
      providerId: "Alpha/provider",
      status: "available",
      reason: "AVAILABLE",
      nextAction: null,
      connectionRevision: 1,
      capabilityRevision: 1,
      verifierRevision: "alpha-identity-v1",
      compatibleProviderModelIds: ["alpha.alpha-v1"],
    }])).toThrow("MODEL_CONNECTION_AUTHORITIES_INVALID");
  });

  it("rejects every noncanonical legacy connection even when it is unused", () => {
    expect(() => parseModelSelectionsProjection({
      tools: [],
      models: [],
      selections: [],
      connections: [{
        providerConnectionId: CONNECTION_ID,
        provider: "Alpha/provider",
        status: "healthy",
        compatibleModelIds: [],
      }],
    })).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");
  });
});
