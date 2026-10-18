import { describe, expect, it } from "vitest";

import {
  parseProviderModels,
  parseProviderToolCapabilities,
} from "./provider-tool-capability.js";

describe("provider tool capability contracts", () => {
  it("parses an unbounded reviewed provider-model/tool registry", () => {
    const rows = validProviderToolCapabilities();
    const secondDeepSeekModel = {
      ...rows[0],
      toolCapabilityId: "cap.codex.deepseek-v4-pro",
      providerModelId: "deepseek.deepseek-v4-pro",
      logicalModelId: "codex.deepseek.deepseek-v4-pro",
      exactUpstreamModelId: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      manifestSha256: "e".repeat(64),
      revision: 2,
    };

    expect(parseProviderToolCapabilities(rows)).toEqual(rows);
    expect(parseProviderToolCapabilities([...rows, secondDeepSeekModel])).toHaveLength(5);
    expect(parseProviderToolCapabilities([rows[1], rows[0], rows[2], rows[3]])).toEqual([
      rows[1], rows[0], rows[2], rows[3],
    ]);
    expect(() => parseProviderToolCapabilities([])).toThrow(
      "PROVIDER_TOOL_CAPABILITIES_INVALID",
    );

    const rowsWithSymbol = [...rows];
    Object.defineProperty(rowsWithSymbol, Symbol("unexpected"), {
      value: true,
    });
    const rowsWithHiddenField = [...rows];
    Object.defineProperty(rowsWithHiddenField, "unexpected", {
      value: true,
      enumerable: false,
    });
    expect(() => parseProviderToolCapabilities(rowsWithSymbol)).toThrow(
      "PROVIDER_TOOL_CAPABILITIES_INVALID",
    );
    expect(() => parseProviderToolCapabilities(rowsWithHiddenField)).toThrow(
      "PROVIDER_TOOL_CAPABILITIES_INVALID",
    );
  });

  it("parses multiple reviewed models per provider and rejects duplicate exact identities", () => {
    const models = validProviderModels();
    expect(parseProviderModels(models)).toEqual(models);

    expect(() => parseProviderModels([...models, models[0]])).toThrow(
      "PROVIDER_MODELS_INVALID",
    );
    expect(() => parseProviderModels([
      models[0],
      { ...models[1], exactUpstreamModelId: models[0].exactUpstreamModelId },
    ])).toThrow("PROVIDER_MODELS_INVALID");
    expect(() => parseProviderModels([
      models[0],
      { ...models[1], providerModelId: "kimi.deepseek-v4-flash", providerId: "kimi", exactUpstreamModelId: models[0].exactUpstreamModelId },
    ])).not.toThrow();
  });

  it("accepts a newly reviewed provider identifier without a client-side provider allowlist", () => {
    const model = {
      ...validProviderModels()[0],
      providerModelId: "alpha.alpha-reasoner-v1",
      providerId: "alpha",
      exactUpstreamModelId: "alpha-reasoner-v1",
      displayName: "Alpha Reasoner",
    };
    const capability = {
      ...validProviderToolCapabilities()[0],
      toolCapabilityId: "codex.alpha.alpha-reasoner-v1",
      providerModelId: model.providerModelId,
      logicalModelId: "codex.alpha.alpha-reasoner-v1",
      providerId: model.providerId,
      displayName: model.displayName,
      exactUpstreamModelId: model.exactUpstreamModelId,
      originId: "alpha-openai-v1",
      adapterKey: "alpha-reasoner-responses-v1",
      adapterRevision: "alpha-reasoner-responses-v1",
      platform: {
        ...validProviderToolCapabilities()[0].platform,
        releaseId: "codex-alpha-reasoner-platform-v1",
        priceVersionId: "alpha-reasoner-cny-v1",
      },
      userApi: {
        ...validProviderToolCapabilities()[0].userApi,
        verifierRevision: "alpha-identity-v1",
      },
    };

    expect(parseProviderModels([model])).toEqual([model]);
    expect(parseProviderToolCapabilities([capability])).toEqual([capability]);
  });

  it("accepts an exact upstream model identifier containing a version dot", () => {
    const capability = {
      ...validProviderToolCapabilities()[1],
      toolCapabilityId: "claude_code.kimi.kimi-k2.6",
      providerModelId: "kimi.kimi-k2.6",
      logicalModelId: "claude_code.kimi.kimi-k2.6",
      displayName: "Kimi K2.6",
      exactUpstreamModelId: "kimi-k2.6",
    };

    expect(parseProviderToolCapabilities([capability])).toEqual([capability]);
  });

  it.each(["Alpha", "a", "alpha/provider", "alpha.provider", `a${"x".repeat(32)}`])(
    "rejects noncanonical provider identifier %s",
    (providerId) => {
      const model = {
        ...validProviderModels()[0],
        providerModelId: `${providerId}.deepseek-v4-flash`,
        providerId,
      };
      expect(() => parseProviderModels([model])).toThrow("PROVIDER_MODELS_INVALID");
    },
  );

  it("keeps null-adapter cells exactly preparing for both funding sources", () => {
    const rows = validProviderToolCapabilities();
    const missingAdapterAndSecret = replaceRow(rows, 2, {
      ...rows[2],
      platform: {
        ...rows[2].platform,
        secretRevision: null,
      },
    });
    expect(
      parseProviderToolCapabilities(missingAdapterAndSecret)[2]?.platform,
    ).toMatchObject({
      state: "preparing",
      reason: "ADAPTER_MISSING",
      secretAuthority: "managed_keyring",
      secretRevision: null,
    });
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 2, {
          ...rows[2],
          platform: {
            ...rows[2].platform,
            state: "available",
            reason: "AVAILABLE",
            releaseId: "codex-kimi-platform-v1",
            releaseRevision: 1,
            priceVersionId: "codex-kimi-cny-v1",
          },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 3, {
          ...rows[3],
          userApi: {
            state: "available",
            reason: "AVAILABLE",
            capabilityRevision: 1,
            verifierRevision: "deepseek-identity-v2",
          },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 3, {
          ...rows[3],
          platform: {
            ...rows[3].platform,
            reason: "RELEASE_MISSING",
          },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
  });

  it("rejects duplicate and non-exact cell identities", () => {
    const rows = validProviderToolCapabilities();

    expect(() =>
      parseProviderToolCapabilities(
        [...rows, { ...rows[0], toolCapabilityId: "cap.duplicate-id" }],
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 2, {
          ...rows[2],
          toolCapabilityId: rows[0].toolCapabilityId,
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 2, {
          ...rows[2],
          exactUpstreamModelId: "other-model",
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 1, {
          ...rows[1],
          adapterRevision: "unreviewed-adapter-v1",
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
  });

  it("keeps legacy environment and managed keyring null semantics distinct", () => {
    const rows = validProviderToolCapabilities();
    expect(rows[0].platform).toMatchObject({
      state: "available",
      secretAuthority: "legacy_env",
      secretRevision: null,
    });
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 0, {
          ...rows[0],
          platform: { ...rows[0].platform, secretRevision: 1 },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");

    const unavailableManaged = replaceRow(rows, 1, {
      ...rows[1],
      platform: {
        ...rows[1].platform,
        state: "preparing",
        reason: "SECRET_UNAVAILABLE",
        secretRevision: null,
      },
    });
    expect(parseProviderToolCapabilities(unavailableManaged)[1]?.platform).toEqual(
      unavailableManaged[1]?.platform,
    );
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 1, {
          ...rows[1],
          platform: { ...rows[1].platform, secretRevision: null },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    const blockedManaged = replaceRow(rows, 1, {
      ...rows[1],
      platform: {
        ...rows[1].platform,
        state: "preparing",
        reason: "RELEASE_BLOCKED",
        secretRevision: null,
      },
    });
    expect(parseProviderToolCapabilities(blockedManaged)[1]?.platform.reason).toBe(
      "RELEASE_BLOCKED",
    );

    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 1, {
          ...rows[1],
          platform: {
            ...rows[1].platform,
            secretAuthority: "legacy_env",
            secretRevision: null,
          },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");

    const managedDeepSeek = replaceRow(rows, 0, {
      ...rows[0],
      platform: {
        ...rows[0].platform,
        secretAuthority: "managed_keyring",
        secretRevision: 4,
      },
    });
    expect(parseProviderToolCapabilities(managedDeepSeek)[0]?.platform).toMatchObject({
      state: "available",
      secretAuthority: "managed_keyring",
      secretRevision: 4,
    });
  });

  it("applies deterministic first-missing platform reasons", () => {
    const rows = validProviderToolCapabilities();
    const kimi = rows[1];
    const candidates = [
      {
        reason: "RELEASE_MISSING",
        releaseId: null,
        releaseRevision: null,
        priceVersionId: null,
        secretRevision: null,
      },
      {
        reason: "RELEASE_BLOCKED",
        releaseId: kimi.platform.releaseId,
        releaseRevision: kimi.platform.releaseRevision,
        priceVersionId: null,
        secretRevision: null,
      },
      {
        reason: "PRICE_UNAVAILABLE",
        releaseId: kimi.platform.releaseId,
        releaseRevision: kimi.platform.releaseRevision,
        priceVersionId: null,
        secretRevision: null,
      },
      {
        reason: "SECRET_UNAVAILABLE",
        releaseId: kimi.platform.releaseId,
        releaseRevision: kimi.platform.releaseRevision,
        priceVersionId: kimi.platform.priceVersionId,
        secretRevision: null,
      },
    ] as const;
    for (const candidate of candidates) {
      const parsed = parseProviderToolCapabilities(
        replaceRow(rows, 1, {
          ...kimi,
          platform: {
            ...kimi.platform,
            state: "preparing",
            ...candidate,
          },
        }),
      );
      expect(parsed[1]?.platform.reason).toBe(candidate.reason);
    }

    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 1, {
          ...kimi,
          platform: {
            ...kimi.platform,
            state: "preparing",
            reason: "SECRET_UNAVAILABLE",
            releaseId: null,
            releaseRevision: null,
            priceVersionId: null,
            secretRevision: null,
          },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
  });

  it("rejects platform reasons from the wrong branch or missing-fact stage", () => {
    const rows = validProviderToolCapabilities();
    const kimi = rows[1];
    for (const reason of ["ADAPTER_MISSING", "CONNECTION_INCOMPATIBLE", "MODEL_RETIRED"] as const) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 1, {
            ...kimi,
            platform: { ...kimi.platform, state: "preparing", reason },
          }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }

    for (const platform of [
      {
        ...kimi.platform,
        state: "preparing",
        reason: "PRICE_UNAVAILABLE",
        releaseId: null,
        releaseRevision: null,
        priceVersionId: null,
        secretRevision: null,
      },
      {
        ...kimi.platform,
        state: "preparing",
        reason: "SECRET_UNAVAILABLE",
        priceVersionId: null,
        secretRevision: null,
      },
      {
        ...kimi.platform,
        state: "preparing",
        reason: "FAKE_EVIDENCE_MISSING",
        secretRevision: null,
      },
    ] as const) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 1, { ...kimi, platform }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }

    for (const reason of [
      "FAKE_EVIDENCE_MISSING",
      "REAL_EVIDENCE_MISSING",
      "NATIVE_EVIDENCE_MISSING",
    ] as const) {
      expect(
        parseProviderToolCapabilities(
          replaceRow(rows, 1, {
            ...kimi,
            platform: { ...kimi.platform, state: "preparing", reason },
          }),
        )[1]?.platform.reason,
      ).toBe(reason);
    }
  });

  it("accepts release-blocking reasons only while both funding paths are preparing", () => {
    const capability = validProviderToolCapabilities()[0];
    for (const reason of [
      "OFFICIAL_RELEASE_PENDING",
      "UPSTREAM_MODEL_REDIRECT_IN_EFFECT",
    ] as const) {
      expect(
        parseProviderToolCapabilities([
          {
            ...capability,
            platform: {
              ...capability.platform,
              state: "preparing",
              reason,
              releaseId: null,
              releaseRevision: null,
              priceVersionId: null,
            },
            userApi: { ...capability.userApi, state: "preparing", reason },
          },
        ]),
      ).toHaveLength(1);
      for (const userApi of [
        { capabilityRevision: 0, verifierRevision: null },
        { capabilityRevision: 1, verifierRevision: "" },
      ] as const) {
        expect(() =>
          parseProviderToolCapabilities([
            {
              ...capability,
              platform: {
                ...capability.platform,
                state: "preparing",
                reason,
                releaseId: null,
                releaseRevision: null,
                priceVersionId: null,
              },
              userApi: { ...capability.userApi, state: "preparing", reason, ...userApi },
            },
          ]),
        ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
      }
      expect(() =>
        parseProviderToolCapabilities([
          {
            ...capability,
            platform: { ...capability.platform, state: "available", reason },
          },
        ]),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
      expect(() =>
        parseProviderToolCapabilities([
          {
            ...capability,
            userApi: { ...capability.userApi, state: "disabled", reason },
          },
        ]),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }
  });

  it("accepts only user-api reasons from the user-api branch", () => {
    const rows = validProviderToolCapabilities();
    const deepseek = rows[0];
    for (const reason of [
      "ADAPTER_MISSING",
      "RELEASE_MISSING",
      "RELEASE_BLOCKED",
      "PRICE_UNAVAILABLE",
      "SECRET_UNAVAILABLE",
    ] as const) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 0, {
            ...deepseek,
            userApi: { ...deepseek.userApi, state: "preparing", reason },
          }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }

    for (const reason of [
      "CONNECTION_INCOMPATIBLE",
      "FAKE_EVIDENCE_MISSING",
      "REAL_EVIDENCE_MISSING",
      "NATIVE_EVIDENCE_MISSING",
    ] as const) {
      expect(
        parseProviderToolCapabilities(
          replaceRow(rows, 0, {
            ...deepseek,
            userApi: { ...deepseek.userApi, state: "preparing", reason },
          }),
        )[0]?.userApi.reason,
      ).toBe(reason);
    }

    expect(
      parseProviderToolCapabilities(
        replaceRow(rows, 0, {
          ...deepseek,
          userApi: { ...deepseek.userApi, state: "disabled", reason: "MODEL_RETIRED" },
        }),
      )[0]?.userApi.reason,
    ).toBe("MODEL_RETIRED");
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 0, {
          ...deepseek,
          userApi: { ...deepseek.userApi, state: "preparing", reason: "MODEL_RETIRED" },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
  });

  it("requires complete available platform and user-api authority facts", () => {
    const rows = validProviderToolCapabilities();
    for (const platformMutation of [
      { releaseId: null },
      { releaseRevision: null },
      { releaseRevision: 0 },
      { priceVersionId: null },
      { reason: "RELEASE_MISSING" },
    ]) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 0, {
            ...rows[0],
            platform: { ...rows[0].platform, ...platformMutation },
          }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }

    for (const userApiMutation of [
      { capabilityRevision: 0 },
      { capabilityRevision: 1.5 },
      { verifierRevision: null },
      { reason: "CONNECTION_INCOMPATIBLE" },
    ]) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 0, {
            ...rows[0],
            userApi: { ...rows[0].userApi, ...userApiMutation },
          }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }
  });

  it("rejects unknown states, reasons, revisions, protocols and extra fields", () => {
    const rows = validProviderToolCapabilities();
    for (const rowMutation of [
      { ingressProtocol: "openai_chat" },
      { upstreamProtocol: "vendor_magic" },
      { adapterRevision: "" },
      { manifestSha256: "not-a-digest" },
      { revision: 0 },
      { unexpected: true },
    ]) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 0, { ...rows[0], ...rowMutation }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }
    for (const platformMutation of [
      { state: "unknown" },
      { reason: "UNKNOWN" },
      { releaseRevision: -1 },
      { releaseId: " contains-space" },
      { unexpected: true },
    ]) {
      expect(() =>
        parseProviderToolCapabilities(
          replaceRow(rows, 0, {
            ...rows[0],
            platform: { ...rows[0].platform, ...platformMutation },
          }),
        ),
      ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
    }
    expect(() =>
      parseProviderToolCapabilities(
        replaceRow(rows, 0, {
          ...rows[0],
          userApi: { ...rows[0].userApi, unexpected: true },
        }),
      ),
    ).toThrow("PROVIDER_TOOL_CAPABILITIES_INVALID");
  });
});

function validProviderToolCapabilities() {
  return [
    {
      toolCapabilityId: "cap.codex.deepseek-v4-flash",
      providerModelId: "deepseek.deepseek-v4-flash",
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      toolId: "codex",
      providerId: "deepseek",
      displayName: "DeepSeek V4 Flash",
      exactUpstreamModelId: "deepseek-v4-flash",
      scope: "responses:create",
      ingressProtocol: "openai_responses",
      upstreamProtocol: "openai_compatible_chat",
      originId: "deepseek-native-responses-v1",
      adapterKey: "deepseek-v4-flash-responses-v1",
      adapterRevision: "deepseek-v4-flash-responses-v1",
      manifestSha256: "a".repeat(64),
      platform: {
        state: "available",
        reason: "AVAILABLE",
        secretAuthority: "legacy_env",
        releaseId: "codex-deepseek-platform-v2",
        releaseRevision: 2,
        priceVersionId: "deepseek-v4-flash-cny-v2",
        secretRevision: null,
      },
      userApi: {
        state: "available",
        reason: "AVAILABLE",
        capabilityRevision: 1,
        verifierRevision: "deepseek-identity-v1",
      },
      revision: 1,
    },
    {
      toolCapabilityId: "cap.claude-code.kimi-k3",
      providerModelId: "kimi.kimi-k3",
      logicalModelId: "claude_code.kimi.kimi-k3",
      toolId: "claude_code",
      providerId: "kimi",
      displayName: "Kimi K3",
      exactUpstreamModelId: "kimi-k3",
      scope: "messages:create",
      ingressProtocol: "anthropic_messages",
      upstreamProtocol: "openai_compatible_chat",
      originId: "moonshot-anthropic-v1",
      adapterKey: "kimi-k3-messages-v1",
      adapterRevision: "kimi-k3-messages-v1",
      manifestSha256: "b".repeat(64),
      platform: {
        state: "available",
        reason: "AVAILABLE",
        secretAuthority: "managed_keyring",
        releaseId: "claude-code-kimi-k3-platform-v1",
        releaseRevision: 1,
        priceVersionId: "kimi-k3-cny-v1",
        secretRevision: 3,
      },
      userApi: {
        state: "available",
        reason: "AVAILABLE",
        capabilityRevision: 2,
        verifierRevision: "kimi-identity-v1",
      },
      revision: 1,
    },
    {
      toolCapabilityId: "cap.codex.kimi-k3",
      providerModelId: "kimi.kimi-k3",
      logicalModelId: "codex.kimi.kimi-k3",
      toolId: "codex",
      providerId: "kimi",
      displayName: "Kimi K3",
      exactUpstreamModelId: "kimi-k3",
      scope: "responses:create",
      ingressProtocol: "openai_responses",
      upstreamProtocol: "openai_compatible_chat",
      originId: "moonshot-openai-chat-v1",
      adapterKey: "adapter_missing",
      adapterRevision: null,
      manifestSha256: "c".repeat(64),
      platform: {
        state: "preparing",
        reason: "ADAPTER_MISSING",
        secretAuthority: "managed_keyring",
        releaseId: null,
        releaseRevision: null,
        priceVersionId: null,
        secretRevision: 3,
      },
      userApi: {
        state: "preparing",
        reason: "ADAPTER_MISSING",
        capabilityRevision: 0,
        verifierRevision: null,
      },
      revision: 1,
    },
    {
      toolCapabilityId: "cap.claude-code.deepseek-v4-flash",
      providerModelId: "deepseek.deepseek-v4-flash",
      logicalModelId: "claude_code.deepseek.deepseek-v4-flash",
      toolId: "claude_code",
      providerId: "deepseek",
      displayName: "DeepSeek V4 Flash",
      exactUpstreamModelId: "deepseek-v4-flash",
      scope: "messages:create",
      ingressProtocol: "anthropic_messages",
      upstreamProtocol: "anthropic_messages",
      originId: "deepseek-anthropic-v1",
      adapterKey: "adapter_missing",
      adapterRevision: null,
      manifestSha256: "d".repeat(64),
      platform: {
        state: "preparing",
        reason: "ADAPTER_MISSING",
        secretAuthority: "legacy_env",
        releaseId: null,
        releaseRevision: null,
        priceVersionId: null,
        secretRevision: null,
      },
      userApi: {
        state: "preparing",
        reason: "ADAPTER_MISSING",
        capabilityRevision: 0,
        verifierRevision: null,
      },
      revision: 1,
    },
  ] as const;
}

function validProviderModels() {
  return [
    {
      providerModelId: "deepseek.deepseek-v4-flash",
      providerId: "deepseek",
      exactUpstreamModelId: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
      capabilityFlags: ["reasoning", "streaming", "tools"],
      reviewedSourceDigest: "a".repeat(64),
      revision: 1,
    },
    {
      providerModelId: "deepseek.deepseek-v4-pro",
      providerId: "deepseek",
      exactUpstreamModelId: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      capabilityFlags: ["reasoning", "streaming", "tools"],
      reviewedSourceDigest: "b".repeat(64),
      revision: 1,
    },
  ] as const;
}

function replaceRow(
  rows: readonly Record<string, any>[],
  index: number,
  replacement: Record<string, any>,
): Array<Record<string, any>> {
  return rows.map((row, rowIndex) => (rowIndex === index ? replacement : row));
}
