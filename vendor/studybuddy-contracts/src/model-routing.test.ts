import { describe, expect, it } from "vitest";
import { currentModelProjection, currentRegistry } from "../test-fixtures/current-model-catalog.mjs";

import {
  parseConnectProviderBody,
  parseGatewayReference,
  parseModelSelectionsProjection as parseModelSelectionsProjectionContract,
  parseUpdateToolModelSelectionBody,
} from "./model-routing.js";

describe("model routing contracts", () => {
  it("accepts only complete namespaced gateway references", () => {
    expect(parseGatewayReference({
      backend: "primary_backend",
      backendInstanceId: "prod",
      sourceId: "41",
    })).toEqual({
      backend: "primary_backend",
      backendInstanceId: "prod",
      sourceId: "41",
    });
    expect(parseGatewayReference({
      backend: "primary_backend",
      backendInstanceId: "prod",
      sourceId: "order/2026:41",
    })).toMatchObject({ sourceId: "order/2026:41" });
    for (const invalid of [
      { backend: "primary_backend", backendInstanceId: "prod", sourceId: "" },
      { backend: "primary_backend", backendInstanceId: "prod", sourceId: "  " },
      { backend: "primary_backend", backendInstanceId: "prod", sourceId: "41\n42" },
      { backend: "primary_backend", backendInstanceId: "", sourceId: "41" },
      { backend: "unknown", backendInstanceId: "prod", sourceId: "41" },
      { backend: "primary_backend", backendInstanceId: "prod", sourceId: "41", key: "secret" },
    ]) {
      expect(() => parseGatewayReference(invalid)).toThrow(
        "AI_GATEWAY_REFERENCE_INVALID",
      );
    }
  });

  it("rejects the removed V4 Pro identity at the selection boundary", () => {
    expect(() => parseUpdateToolModelSelectionBody({
      expectedRevision: 1,
      logicalModelId: "codex.deepseek.deepseek-v4-pro",
      fundingSource: "platform",
    })).toThrow("UPDATE_TOOL_MODEL_SELECTION_INVALID");
  });

  it("preserves all current registry cells and derives readiness from capability authority", () => {
    const wire = currentModelProjection();
    // Deliberately stale legacy flags must never promote preparing capabilities.
    const result = parseModelSelectionsProjectionContract({
      ...wire,
      models: wire.models.map((row) => ({ ...row, availability: "available", platformAvailable: true, userApiAvailable: true })),
    });
    expect(result.providerModels?.map((row) => row.exactUpstreamModelId)).toEqual([
      "deepseek-flash", "kimi-k3",
    ]);
    expect(result.providerModels).toHaveLength(2);
    expect(result.models).toHaveLength(4);
    expect(result.providerToolCapabilities).toHaveLength(4);
    expect(result.models.map((row) => row.logicalModelId).sort()).toEqual(currentRegistry.cells.map((cell) => cell.logical_model_id).sort());
    expect(result.models.every((row) => row.availability === "preparing" && !row.platformAvailable && !row.userApiAvailable)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/kimi-k2|deepseek-v4-pro|deepseek-v4-flash(?:-vision-exp)?/);
    expect(result.providerToolCapabilities
      ?.every((row) => row.platform.reason === "FAKE_EVIDENCE_MISSING"
        && row.userApi.reason === "FAKE_EVIDENCE_MISSING")).toBe(true);
  });
  const deepSeekConnectionId = "11111111-1111-4111-8111-111111111111";
  const kimiConnectionId = "22222222-2222-4222-8222-222222222222";

  it("projects dynamic provider models and tool capabilities without fixed cardinality", () => {
    const projection = {
      tools: [
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
      ],
      models: [
        { logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "preparing", platformAvailable: false, userApiAvailable: false },
      ],
      selections: [
        { toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1 },
      ],
      connections: [],
      providerModels: validProviderModels(),
      providerToolCapabilities: validCapabilityMatrix(),
    };

    const parsed = parseModelSelectionsProjection(projection);
    expect(parsed.providerToolCapabilities).toHaveLength(4);
    expect(parsed.providerModels).toEqual(projection.providerModels);
    expect(parsed.providerToolCapabilities).toEqual(
      projection.providerToolCapabilities,
    );
    expect(parsed.selections).toHaveLength(1);
    expect(parsed.models).toEqual([
      {
        ...projection.models[0],
        availability: "available",
        platformAvailable: true,
        userApiAvailable: true,
      },
    ]);

    const { providerToolCapabilities: _matrix, providerModels: _providerModels, ...legacyProjection } = projection;
    const parsedLegacy = parseModelSelectionsProjectionContract({
      ...legacyProjection,
      selections: [],
    });
    expect(parsedLegacy).not.toHaveProperty("providerToolCapabilities");
    const availableLegacy = parseModelSelectionsProjectionContract({
      ...legacyProjection,
      models: [
        {
          ...legacyProjection.models[0],
          availability: "available",
          platformAvailable: true,
        },
      ],
    });
    expect(availableLegacy.selections).toHaveLength(1);
    expect(() =>
      parseModelSelectionsProjectionContract({
        ...legacyProjection,
        models: [{ ...legacyProjection.models[0], availability: "preparing" }],
      }),
    ).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");
    expect(
      parseModelSelectionsProjectionContract({
        ...legacyProjection,
        models: [{ ...legacyProjection.models[0], availability: "disabled" }],
      }).selections,
    ).toEqual(legacyProjection.selections);
    expect(() =>
      parseModelSelectionsProjectionContract({
        ...legacyProjection,
        providerToolCapabilities: undefined,
      }),
    ).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");

    const preparingLegacyView = parseModelSelectionsProjection({
      ...projection,
      models: [
        {
          logicalModelId: "codex.kimi.kimi-k3",
          displayName: "Kimi K3",
          provider: "kimi",
          toolId: "codex",
          availability: "available",
          platformAvailable: true,
          userApiAvailable: true,
        },
      ],
      selections: [],
    });
    expect(preparingLegacyView.models).toEqual([
      {
        logicalModelId: "codex.kimi.kimi-k3",
        displayName: "Kimi K3",
        provider: "kimi",
        toolId: "codex",
        availability: "preparing",
        platformAvailable: false,
        userApiAvailable: false,
      },
    ]);

    const preparingMatrix = validCapabilityMatrix();
    const availableCapability = preparingMatrix[0]!;
    preparingMatrix[0] = {
      ...availableCapability,
      platform: {
        ...availableCapability.platform,
        state: "preparing",
        reason: "RELEASE_BLOCKED",
      },
    };
    expect(() =>
      parseModelSelectionsProjection({
        ...projection,
        models: [{ ...projection.models[0], availability: "available", platformAvailable: true }],
        providerToolCapabilities: preparingMatrix,
      }),
    ).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");

    const incompatibleUserApiMatrix = validCapabilityMatrix();
    const userApiCapability = incompatibleUserApiMatrix[0]!;
    incompatibleUserApiMatrix[0] = {
      ...userApiCapability,
      userApi: {
        ...userApiCapability.userApi,
        state: "preparing",
        reason: "CONNECTION_INCOMPATIBLE",
      },
    };
    expect(() =>
      parseModelSelectionsProjection({
        ...projection,
        models: [{ ...projection.models[0], availability: "available", userApiAvailable: true }],
        selections: [{ ...projection.selections[0], fundingSource: "user_api", providerConnectionId: deepSeekConnectionId }],
        connections: [{ providerConnectionId: deepSeekConnectionId, provider: "deepseek", status: "healthy", compatibleModelIds: ["codex.deepseek.deepseek-v4-flash"] }],
        providerToolCapabilities: incompatibleUserApiMatrix,
      }),
    ).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");
  });

  it("parses independent Codex and Claude Code selections", () => {
    const value = parseModelSelectionsProjection({
      tools: [
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
        { toolId: "claude_code", displayName: "Claude Code", protocol: "anthropic_messages", displayOrder: 20 },
      ],
      models: [
        { logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek V4 Flash", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true },
        { logicalModelId: "claude_code.kimi.kimi-k3", displayName: "Kimi K3", provider: "kimi", toolId: "claude_code", availability: "preparing", platformAvailable: false, userApiAvailable: false },
      ],
      selections: [
        { toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 3 },
      ],
      connections: [],
    });

    expect(value.tools.map((tool) => tool.toolId)).toEqual(["codex", "claude_code"]);
    expect(value.selections).toHaveLength(1);
  });

  it("allows a preparing capability to reference a reviewed model not yet published for selection", () => {
    const preparing = validCapabilityMatrix()[1]!;
    const preparingCapability = {
      ...preparing,
      platform: {
        ...preparing.platform,
        state: "preparing",
        reason: "RELEASE_BLOCKED",
      },
      userApi: {
        ...preparing.userApi,
        state: "preparing",
        reason: "FAKE_EVIDENCE_MISSING",
      },
    };
    const projection = {
      tools: [
        { toolId: "claude_code", displayName: "Claude Code", protocol: "anthropic_messages", displayOrder: 20 },
      ],
      models: [
        { logicalModelId: preparing.logicalModelId, displayName: preparing.displayName, provider: preparing.providerId, toolId: "claude_code", availability: "preparing", platformAvailable: false, userApiAvailable: false },
      ],
      selections: [],
      connections: [],
      providerModels: [validProviderModels()[0]],
      providerToolCapabilities: [preparingCapability],
    };

    expect(parseModelSelectionsProjectionContract(projection).models[0]?.availability).toBe("preparing");
    expect(() => parseModelSelectionsProjectionContract({
      ...projection,
      providerToolCapabilities: [{
        ...preparingCapability,
        platform: { ...preparingCapability.platform, state: "available", reason: "AVAILABLE" },
      }],
    })).toThrow("MODEL_SELECTIONS_PROJECTION_INVALID");
  });

  it("sorts tools by unique display order", () => {
    const value = parseModelSelectionsProjection({
      tools: [
        { toolId: "claude_code", displayName: "Claude Code", protocol: "anthropic_messages", displayOrder: 20 },
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
      ],
      models: [],
      selections: [],
      connections: [],
    });

    expect(value.tools.map((tool) => tool.displayOrder)).toEqual([10, 20]);
  });

  it("rejects duplicate identifiers and equal display order", () => {
    expect(() => parseModelSelectionsProjection({
      tools: [
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
        { toolId: "codex", displayName: "Codex 2", protocol: "openai_responses", displayOrder: 20 },
      ], models: [], selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
        { toolId: "claude_code", displayName: "Claude Code", protocol: "anthropic_messages", displayOrder: 10 },
      ], models: [], selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [
        { logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: false },
        { logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek copy", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: false },
      ], selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }], models: [],
      selections: [
        { toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1 },
        { toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 2 },
      ], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [], models: [], selections: [],
      connections: [
        { providerConnectionId: kimiConnectionId, provider: "kimi", status: "healthy", compatibleModelIds: [] },
        { providerConnectionId: kimiConnectionId, provider: "kimi", status: "healthy", compatibleModelIds: [] },
      ],
    })).toThrow();
  });

  it("rejects invalid projection relationships and preparing selections", () => {
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "unsupported", displayName: "Unsupported", protocol: "openai_responses", displayOrder: 10 }],
      models: [], selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "unsupported", displayOrder: 10 }],
      models: [], selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: false }],
      selections: [], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [
        { toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 },
        { toolId: "claude_code", displayName: "Claude Code", protocol: "anthropic_messages", displayOrder: 20 },
      ],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: false }],
      selections: [{ toolId: "claude_code", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1 }], connections: [],
    })).toThrow();
    expect(parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "preparing", platformAvailable: true, userApiAvailable: false }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1 }], connections: [],
    }).selections).toHaveLength(1);
    expect(parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "disabled", platformAvailable: false, userApiAvailable: false }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1 }], connections: [],
    }).selections).toHaveLength(1);
  });

  it("requires funding-compatible connection relationships", () => {
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: null, revision: 1 }], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: deepSeekConnectionId, revision: 1 }], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: "33333333-3333-4333-8333-333333333333", revision: 1 }], connections: [],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: kimiConnectionId, revision: 1 }],
      connections: [{ providerConnectionId: kimiConnectionId, provider: "kimi", status: "unhealthy", compatibleModelIds: ["codex.deepseek.deepseek-v4-flash"] }],
    })).toThrow();
    expect(() => parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: kimiConnectionId, revision: 1 }],
      connections: [{ providerConnectionId: kimiConnectionId, provider: "kimi", status: "healthy", compatibleModelIds: ["codex.deepseek.deepseek-v4-flash"] }],
    })).toThrow();
    const value = parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: true }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: deepSeekConnectionId, revision: 1 }],
      connections: [{ providerConnectionId: deepSeekConnectionId, provider: "deepseek", status: "healthy", compatibleModelIds: ["codex.deepseek.deepseek-v4-flash"] }],
    });

    expect(value.selections[0]?.providerConnectionId).toBe(deepSeekConnectionId);
  });

  it("keeps an existing user-API selection displayable after its connection becomes unhealthy", () => {
    const value = parseModelSelectionsProjection({
      tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 10 }],
      models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "disabled", platformAvailable: false, userApiAvailable: false }],
      selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "user_api", providerConnectionId: deepSeekConnectionId, revision: 2 }],
      connections: [{ providerConnectionId: deepSeekConnectionId, provider: "deepseek", status: "unhealthy", compatibleModelIds: ["codex.deepseek.deepseek-v4-flash"] }],
    });

    expect(value.selections).toEqual([{
      toolId: "codex",
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      providerConnectionId: deepSeekConnectionId,
      revision: 2,
    }]);
  });

  it("accepts only canonical lowercase UUID provider connection IDs", () => {
    expect(parseUpdateToolModelSelectionBody({
      expectedRevision: 1,
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      fundingSource: "user_api",
      providerConnectionId: deepSeekConnectionId,
    }).providerConnectionId).toBe(deepSeekConnectionId);

    for (const providerConnectionId of [
      "conn_deepseek",
      "11111111-1111-4111-8111-11111111111",
      "11111111-1111-4111-C111-111111111111",
      "11111111-1111-4111-8111-11111111111A",
    ]) {
      expect(() => parseUpdateToolModelSelectionBody({
        expectedRevision: 1,
        logicalModelId: "codex.deepseek.deepseek-v4-flash",
        fundingSource: "user_api",
        providerConnectionId,
      })).toThrow();
    }
  });

  it("rejects unknown keys at every public object boundary", () => {
    expect(() => parseModelSelectionsProjection({ tools: [], models: [], selections: [], connections: [], unexpected: true })).toThrow();
    expect(() => parseModelSelectionsProjection({ tools: [{ toolId: "codex", displayName: "Codex", protocol: "openai_responses", displayOrder: 1, unexpected: true }], models: [], selections: [], connections: [] })).toThrow();
    expect(() => parseModelSelectionsProjection({ tools: [], models: [{ logicalModelId: "codex.deepseek.deepseek-v4-flash", displayName: "DeepSeek", provider: "deepseek", toolId: "codex", availability: "available", platformAvailable: true, userApiAvailable: false, unexpected: true }], selections: [], connections: [] })).toThrow();
    expect(() => parseModelSelectionsProjection({ tools: [], models: [], selections: [{ toolId: "codex", logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: null, revision: 1, unexpected: true }], connections: [] })).toThrow();
    expect(() => parseModelSelectionsProjection({ tools: [], models: [], selections: [], connections: [{ providerConnectionId: kimiConnectionId, provider: "kimi", status: "healthy", compatibleModelIds: [], unexpected: true }] })).toThrow();
    expect(() => parseUpdateToolModelSelectionBody({ expectedRevision: 1, logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", unexpected: true })).toThrow();
    expect(() => parseConnectProviderBody({ apiKey: "synthetic-key", unexpected: true })).toThrow();
  });

  it("rejects symbol and non-enumerable own properties", () => {
    const updateWithSymbol = {
      expectedRevision: 1,
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      fundingSource: "platform",
      [Symbol("unexpected")]: true,
    };
    const connectionWithHiddenField = { apiKey: "synthetic-key" };
    Object.defineProperty(connectionWithHiddenField, "unexpected", {
      value: true,
      enumerable: false,
    });

    expect(() => parseUpdateToolModelSelectionBody(updateWithSymbol)).toThrow();
    expect(() => parseConnectProviderBody(connectionWithHiddenField)).toThrow();
  });

  it("normalizes a valid model-selection update without client authority fields", () => {
    const body = parseUpdateToolModelSelectionBody({
      expectedRevision: 1,
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      fundingSource: "platform",
    });

    expect(body).toEqual({
      expectedRevision: 1,
      logicalModelId: "codex.deepseek.deepseek-v4-flash",
      fundingSource: "platform",
      providerConnectionId: null,
    });
    for (const field of ["provider", "upstreamModel", "baseUrl", "price", "balance"]) {
      expect(() => parseUpdateToolModelSelectionBody({ expectedRevision: 1, logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", [field]: "client-controlled" })).toThrow();
    }
  });

  it("rejects malformed model-selection updates", () => {
    for (const expectedRevision of [0, -1, 1.5]) {
      expect(() => parseUpdateToolModelSelectionBody({ expectedRevision, logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform" })).toThrow();
    }
    for (const logicalModelId of ["codex", "Codex.deepseek.deepseek-v4-flash", "codex.deepseek."]) {
      expect(() => parseUpdateToolModelSelectionBody({ expectedRevision: 1, logicalModelId, fundingSource: "platform" })).toThrow();
    }
    expect(() => parseUpdateToolModelSelectionBody({ expectedRevision: 1, logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "platform", providerConnectionId: "bad id" })).toThrow();
    expect(() => parseUpdateToolModelSelectionBody({ expectedRevision: 1, logicalModelId: "codex.deepseek.deepseek-v4-flash", fundingSource: "unsupported" })).toThrow();
  });

  it("accepts only a safe API-key connection body", () => {
    expect(parseConnectProviderBody({ apiKey: "synthetic-key" })).toEqual({ apiKey: "synthetic-key" });
    for (const apiKey of ["short", " leadingkey", "trailingkey ", "line\nbreak", "null\0byte", "你你"]) {
      expect(() => parseConnectProviderBody({ apiKey })).toThrow();
    }
    expect(() => parseConnectProviderBody({ apiKey: "a".repeat(513) })).toThrow();
  });
});

function validCapabilityMatrix(): Array<{
  toolCapabilityId: string;
  providerModelId: string;
  logicalModelId: string;
  toolId: string;
  providerId: string;
  displayName: string;
  exactUpstreamModelId: string;
  scope: string;
  ingressProtocol: string;
  upstreamProtocol: string;
  originId: string;
  adapterKey: string;
  adapterRevision: string | null;
  manifestSha256: string;
  platform: Record<string, unknown>;
  userApi: Record<string, unknown>;
  revision: number;
}> {
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
      platform: { state: "available", reason: "AVAILABLE", secretAuthority: "legacy_env", releaseId: "codex-deepseek-platform-v2", releaseRevision: 2, priceVersionId: "deepseek-v4-flash-cny-v2", secretRevision: null },
      userApi: { state: "available", reason: "AVAILABLE", capabilityRevision: 1, verifierRevision: "deepseek-identity-v1" },
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
      platform: { state: "available", reason: "AVAILABLE", secretAuthority: "managed_keyring", releaseId: "claude-code-kimi-k3-platform-v1", releaseRevision: 1, priceVersionId: "kimi-k3-cny-v1", secretRevision: 3 },
      userApi: { state: "available", reason: "AVAILABLE", capabilityRevision: 2, verifierRevision: "kimi-identity-v1" },
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
      platform: { state: "preparing", reason: "ADAPTER_MISSING", secretAuthority: "managed_keyring", releaseId: null, releaseRevision: null, priceVersionId: null, secretRevision: 3 },
      userApi: { state: "preparing", reason: "ADAPTER_MISSING", capabilityRevision: 0, verifierRevision: null },
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
      platform: { state: "preparing", reason: "ADAPTER_MISSING", secretAuthority: "legacy_env", releaseId: null, releaseRevision: null, priceVersionId: null, secretRevision: null },
      userApi: { state: "preparing", reason: "ADAPTER_MISSING", capabilityRevision: 0, verifierRevision: null },
      revision: 1,
    },
  ];
}

function validProviderModels() {
  return [
    { providerModelId: "deepseek.deepseek-v4-flash", providerId: "deepseek", exactUpstreamModelId: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", contextWindow: 200_000, maxOutputTokens: 32_000, capabilityFlags: ["reasoning", "streaming", "tools"], reviewedSourceDigest: "a".repeat(64), revision: 1 },
    { providerModelId: "kimi.kimi-k3", providerId: "kimi", exactUpstreamModelId: "kimi-k3", displayName: "Kimi K3", contextWindow: 262_144, maxOutputTokens: 32_000, capabilityFlags: ["reasoning", "streaming", "tools"], reviewedSourceDigest: "c".repeat(64), revision: 1 },
  ] as const;
}

function parseModelSelectionsProjection(value: Record<string, unknown>) {
  const projection = Object.prototype.hasOwnProperty.call(
    value,
    "providerToolCapabilities",
  )
    ? value
    : { ...value, providerToolCapabilities: validCapabilityMatrix() };
  return parseModelSelectionsProjectionContract(projection);
}
