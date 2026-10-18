import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseNativeToolConnectionView,
  parseNativeToolMaterial,
  parseNativeToolMaterialRequest,
  parseToolConnectionAuthorityView,
  parseToolConnectionBody,
  parseToolConnectionToolId,
  type NativeToolConnectionView,
  type ToolConnectionAuthorityView,
} from "./tool-connection.js";

const MODEL_A = "fixture-provider-model-a";
const MODEL_B = "fixture-provider-model-b";
const NONCE = "30000000-0000-4000-8000-000000000001";
const CONNECTION_ID = "50000000-0000-4000-8000-000000000001";
const ACCOUNT_OWNER = "018f0000-0000-7000-8000-000000000001";
const DEVICE_ID = "20000000-0000-4000-8000-000000000001";
const AUTHORITY_HANDLE = "60000000-0000-4000-8000-000000000001";
const RECEIPT_REVISION = 17;

function authorityFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    toolId: "codex",
    state: "connected",
    permissionState: "eligible",
    accountOwner: ACCOUNT_OWNER,
    deviceId: DEVICE_ID,
    fundingSource: "platform",
    authorizedModelIds: [MODEL_A, MODEL_B],
    authorizedModels: [
      { modelId: MODEL_A, providerId: "deepseek" },
      { modelId: MODEL_B, providerId: "kimi" },
    ],
    bindingRevision: "opaque-active-binding-2",
    authorityHandle: AUTHORITY_HANDLE,
    credentialRevision: 44,
    receiptRevision: 9,
    lastVerifiedAt: "2026-09-23T00:00:00.000Z",
  } satisfies ToolConnectionAuthorityView;
  return { ...base, ...overrides };
}

function nativeViewFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    toolId: "codex",
    state: "connected",
    permissionState: "eligible",
    savedDefaultModelId: MODEL_A,
    authorizedModelIds: [MODEL_A, MODEL_B],
    fundingSource: "platform",
    activeBindingRevision: "opaque-active-binding-2",
    selectionRevision: 3,
    lastVerifiedAt: "2026-09-23T00:00:00.000Z",
  } satisfies NativeToolConnectionView;
  return { ...base, ...overrides };
}

describe("tool connection contracts", () => {
  it("does not retain the deprecated native-v4 TypeScript surface after frontend migration", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./tool-connection.ts", import.meta.url)),
      "utf8",
    );
    const legacyViewName = ["Tool", "Connection", "View"].join("");
    const legacyParserName = ["parse", legacyViewName].join("");

    expect(source).not.toContain(`export type ${legacyViewName}`);
    expect(source).not.toContain(`export function ${legacyParserName}`);
  });

  it("accepts only canonical tools and model-shaped connect bodies", () => {
    expect(parseToolConnectionToolId("codex")).toBe("codex");
    expect(parseToolConnectionToolId("claude_code")).toBe("claude_code");
    expect(parseToolConnectionBody({ modelId: MODEL_A }))
      .toEqual({ modelId: MODEL_A });

    for (const invalid of ["claude-code", "CODEX", "", null]) {
      expect(() => parseToolConnectionToolId(invalid))
        .toThrow("TOOL_CONNECTION_TOOL_INVALID");
    }
    for (const body of [
      { modelId: "deepseek-v4-pro" },
      { modelId: " model" },
      { modelId: MODEL_A, apiKey: "forbidden" },
    ]) {
      expect(() => parseToolConnectionBody(body))
        .toThrow("TOOL_CONNECTION_BODY_INVALID");
    }
  });

  it("parses an active remote authority with canonical durable membership", () => {
    const authority = authorityFixture();

    expect(parseToolConnectionAuthorityView(authority)).toEqual(authority);
  });

  it("accepts canonical ASCII ordering and the exact membership bounds", () => {
    const maxLengthModel = `a${"x".repeat(127)}`;
    const orderingEdges = [
      "A-model",
      "a-model",
      maxLengthModel,
      "model.1",
      "model/1",
    ];
    const maxMembership = Array.from(
      { length: 64 },
      (_, index) => `fixture-model-${String(index).padStart(2, "0")}`,
    );

    expect(parseToolConnectionAuthorityView(authorityFixture({
      authorizedModelIds: orderingEdges,
      authorizedModels: orderingEdges.map((modelId) => ({ modelId, providerId: "deepseek" })),
    })).authorizedModelIds).toEqual(orderingEdges);
    expect(parseToolConnectionAuthorityView(authorityFixture({
      authorizedModelIds: maxMembership,
      authorizedModels: maxMembership.map((modelId) => ({ modelId, providerId: "kimi" })),
    })).authorizedModelIds).toEqual(maxMembership);
  });

  it("parses absent and cleanup remote authority as strict discriminated shapes", () => {
    const absent = authorityFixture({
      state: "available",
      permissionState: "eligible",
      authorizedModelIds: [],
      authorizedModels: [],
      bindingRevision: null,
      authorityHandle: null,
      credentialRevision: null,
      receiptRevision: null,
    });
    const cleanup = authorityFixture({
      state: "revocation_pending",
      permissionState: "unavailable",
      authorizedModels: null,
    });

    expect(parseToolConnectionAuthorityView(absent)).toEqual(absent);
    expect(parseToolConnectionAuthorityView(cleanup)).toEqual(cleanup);
  });

  it("rejects malformed or ambiguous remote authority", () => {
    const tooManyModels = Array.from(
      { length: 65 },
      (_, index) => `fixture-model-${index}`,
    );
    const invalid = [
      authorityFixture({ authorizedModelIds: [] }),
      authorityFixture({ authorizedModelIds: [MODEL_B, MODEL_A] }),
      authorityFixture({ authorizedModelIds: [MODEL_A, MODEL_A] }),
      authorityFixture({
        authorizedModelIds: tooManyModels,
        authorizedModels: tooManyModels.map((modelId) => ({ modelId, providerId: "deepseek" })),
      }),
      authorityFixture({ authorizedModels: undefined }),
      authorityFixture({ authorizedModels: [] }),
      authorityFixture({
        authorizedModels: [
          { modelId: MODEL_B, providerId: "kimi" },
          { modelId: MODEL_A, providerId: "deepseek" },
        ],
      }),
      authorityFixture({
        authorizedModels: [
          { modelId: MODEL_A, providerId: "deepseek" },
          { modelId: MODEL_B, providerId: "unknown" },
        ],
      }),
      authorityFixture({
        authorizedModels: [
          { modelId: MODEL_A, providerId: "deepseek", alias: MODEL_B },
          { modelId: MODEL_B, providerId: "kimi" },
        ],
      }),
      authorityFixture({ bindingRevision: null }),
      authorityFixture({ credentialRevision: null }),
      authorityFixture({ fundingSource: "user_api" }),
      authorityFixture({ permissionState: "unknown" }),
      authorityFixture({ accountOwner: "not-a-uuid" }),
      authorityFixture({ lastVerifiedAt: "2026-09-23" }),
      authorityFixture({ modelId: MODEL_A }),
      authorityFixture({ state: "revocation_pending", permissionState: "eligible" }),
      authorityFixture({ state: "connected", permissionState: "unavailable" }),
      authorityFixture({
        state: "available",
        authorizedModelIds: [],
        bindingRevision: null,
        authorityHandle: AUTHORITY_HANDLE,
        credentialRevision: null,
        receiptRevision: null,
      }),
    ];

    for (const value of invalid) {
      expect(() => parseToolConnectionAuthorityView(value))
        .toThrow("TOOL_CONNECTION_AUTHORITY_VIEW_INVALID");
    }
  });

  it("keeps saved local state distinct from unknown and known-absent authority", () => {
    const offline = nativeViewFixture({
      state: "unavailable",
      permissionState: "unavailable",
      authorizedModelIds: null,
      activeBindingRevision: null,
      lastVerifiedAt: null,
    });
    const cleanup = nativeViewFixture({
      state: "revocation_pending",
      permissionState: "unavailable",
      authorizedModelIds: [],
      activeBindingRevision: null,
      lastVerifiedAt: null,
    });
    const available = nativeViewFixture({
      state: "available",
      permissionState: "eligible",
      savedDefaultModelId: null,
      authorizedModelIds: [],
      fundingSource: null,
      activeBindingRevision: null,
      selectionRevision: null,
      lastVerifiedAt: "2026-09-23T00:00:00.000Z",
    });

    expect(parseNativeToolConnectionView(offline)).toEqual(offline);
    expect(parseNativeToolConnectionView(cleanup)).toEqual(cleanup);
    expect(parseNativeToolConnectionView(available)).toEqual(available);
  });

  it.each([
    ["owned config drift", MODEL_A],
    ["remote opaque revision drift", MODEL_B],
  ])("keeps fresh membership visible but non-selectable during %s", (_, savedModelId) => {
    const conflict = nativeViewFixture({
      state: "conflict",
      permissionState: "unavailable",
      savedDefaultModelId: savedModelId,
      authorizedModelIds: [MODEL_A, MODEL_B],
      activeBindingRevision: null,
    });

    expect(parseNativeToolConnectionView(conflict)).toEqual(conflict);
    expect(() => parseNativeToolConnectionView({
      ...conflict,
      permissionState: "eligible",
    })).toThrow("NATIVE_TOOL_CONNECTION_VIEW_INVALID");
    expect(() => parseNativeToolConnectionView({
      ...conflict,
      activeBindingRevision: "untrusted-drifted-binding",
    })).toThrow("NATIVE_TOOL_CONNECTION_VIEW_INVALID");
    expect(() => parseNativeToolConnectionView({
      ...conflict,
      savedDefaultModelId: "fixture-provider-model-c",
    })).toThrow("NATIVE_TOOL_CONNECTION_VIEW_INVALID");
  });

  it("rejects native projections that turn local history into current authority", () => {
    const invalid = [
      nativeViewFixture({ savedDefaultModelId: "fixture-provider-model-c" }),
      nativeViewFixture({ authorizedModelIds: [MODEL_B, MODEL_A] }),
      nativeViewFixture({ authorizedModelIds: [MODEL_A, MODEL_A] }),
      nativeViewFixture({ selectionRevision: 0 }),
      nativeViewFixture({ fundingSource: null }),
      nativeViewFixture({ state: "unavailable", permissionState: "unavailable" }),
      nativeViewFixture({
        state: "unavailable",
        permissionState: "unavailable",
        authorizedModelIds: null,
      }),
      nativeViewFixture({
        state: "unavailable",
        permissionState: "unavailable",
        authorizedModelIds: [],
        activeBindingRevision: null,
        lastVerifiedAt: null,
      }),
      nativeViewFixture({
        state: "revocation_pending",
        permissionState: "eligible",
        authorizedModelIds: [],
        activeBindingRevision: null,
      }),
      nativeViewFixture({
        state: "available",
        permissionState: "membership_reconnect_required",
        savedDefaultModelId: null,
        authorizedModelIds: [],
        fundingSource: null,
        activeBindingRevision: null,
        selectionRevision: null,
      }),
      nativeViewFixture({ apiKey: "forbidden" }),
      nativeViewFixture({ authorityHandle: AUTHORITY_HANDLE }),
    ];

    for (const value of invalid) {
      expect(() => parseNativeToolConnectionView(value))
        .toThrow("NATIVE_TOOL_CONNECTION_VIEW_INVALID");
    }
  });

  it("requires the closed native audience and a canonical one-time nonce", () => {
    expect(parseNativeToolMaterialRequest({
      audience: "studybuddy-native-v1",
      selectedModelId: MODEL_A,
      materialNonce: NONCE,
      receiptRevision: RECEIPT_REVISION,
    })).toEqual({
      audience: "studybuddy-native-v1",
      selectedModelId: MODEL_A,
      materialNonce: NONCE,
      receiptRevision: RECEIPT_REVISION,
    });

    for (const body of [
      { audience: "browser", selectedModelId: MODEL_A, materialNonce: NONCE, receiptRevision: RECEIPT_REVISION },
      { audience: "studybuddy-native-v1", selectedModelId: MODEL_A, materialNonce: "replay", receiptRevision: RECEIPT_REVISION },
      { audience: "studybuddy-native-v1", selectedModelId: MODEL_A, materialNonce: NONCE, receiptRevision: 0 },
      { audience: "studybuddy-native-v1", selectedModelId: MODEL_A, materialNonce: NONCE, receiptRevision: RECEIPT_REVISION, deviceId: NONCE },
      { audience: "studybuddy-native-v1", modelId: MODEL_A, materialNonce: NONCE, receiptRevision: RECEIPT_REVISION },
    ]) {
      expect(() => parseNativeToolMaterialRequest(body))
        .toThrow("NATIVE_TOOL_MATERIAL_REQUEST_INVALID");
    }
  });

  it("binds material to a full membership and a distinct pending opaque revision", () => {
    const material = {
      connectionId: CONNECTION_ID,
      accountOwner: ACCOUNT_OWNER,
      deviceId: DEVICE_ID,
      toolId: "codex",
      fundingSource: "platform",
      selectedProviderId: "deepseek",
      gatewayOrigin: "https://gateway.studybuddy.example",
      protocol: "openai_responses",
      selectedModelId: MODEL_A,
      authorizedModelIds: [MODEL_A, MODEL_B],
      apiKey: "sk-owner-bound",
      authorityHandle: AUTHORITY_HANDLE,
      pendingBindingRevision: "opaque-pending-binding-1",
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION,
      pendingExpiresAt: "2026-09-22T04:05:00.000Z",
    } as const;

    expect(parseNativeToolMaterial(material)).toEqual(material);
    expect(() => parseNativeToolMaterial({
      ...material,
      credentialRevision: 8,
      keyRevision: "legacy",
    })).toThrow("NATIVE_TOOL_MATERIAL_INVALID");
  });

  it("rejects material with an ambiguous membership or version domain", () => {
    const material = {
      connectionId: CONNECTION_ID,
      accountOwner: ACCOUNT_OWNER,
      deviceId: DEVICE_ID,
      toolId: "claude_code",
      fundingSource: "platform",
      selectedProviderId: "kimi",
      gatewayOrigin: "https://gateway.studybuddy.example",
      protocol: "anthropic_messages",
      selectedModelId: MODEL_B,
      authorizedModelIds: [MODEL_A, MODEL_B],
      apiKey: "sk-owner-bound",
      authorityHandle: AUTHORITY_HANDLE,
      pendingBindingRevision: "opaque-pending-binding-1",
      credentialRevision: 7,
      receiptRevision: RECEIPT_REVISION,
      pendingExpiresAt: "2026-09-22T04:05:00.000Z",
    } as const;
    const tooManyModels = Array.from(
      { length: 65 },
      (_, index) => `fixture-model-${index}`,
    );
    const invalid = [
      { ...material, selectedModelId: "fixture-provider-model-c" },
      { ...material, authorizedModelIds: [MODEL_B, MODEL_A] },
      { ...material, authorizedModelIds: [MODEL_A, MODEL_A] },
      { ...material, authorizedModelIds: tooManyModels },
      { ...material, authorizedModelIds: [] },
      { ...material, fundingSource: "user_api" },
      { ...material, pendingBindingRevision: " opaque" },
      { ...material, pendingBindingRevision: "opaque\nrevision" },
      { ...material, pendingBindingRevision: "x".repeat(129) },
      { ...material, credentialRevision: "opaque-pending-binding-1" },
      { ...material, pendingBindingRevision: 7 },
      { ...material, providerId: "kimi" },
      { ...material, modelId: MODEL_B },
    ];

    for (const value of invalid) {
      expect(() => parseNativeToolMaterial(value))
        .toThrow("NATIVE_TOOL_MATERIAL_INVALID");
    }
  });
});
