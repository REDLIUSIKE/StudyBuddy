import { describe, expect, it } from "vitest";
import {
  parseClientLogEvent,
  parseCreateSupportLogUploadRequest,
  parseCompleteSupportLogUploadRequest,
  parseCreateSupportLogUploadResponse,
  parseCreateSupportLogUploadV2Request,
  parseCreateSupportLogUploadV2Response,
  parseSupportUploadIdempotencyKey,
  parseSupportLogUploadView,
  SUPPORT_LOG_RANGE_SEMANTICS,
} from "./support.js";

const fixtureEvent = () => ({
  schemaVersion: 1 as const,
  occurredAt: "2026-08-21T00:00:00.000Z",
  level: "info" as const,
  eventName: "app.started",
  component: "shell",
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  operationId: null,
  requestId: null,
  appVersion: "0.1.0",
  buildNumber: "1",
  platform: "windows" as const,
  architecture: "x64" as const,
  routeId: null,
  outcome: "started" as const,
  errorCode: null,
  durationMs: null,
  fields: { cold: true },
});

describe("support contracts", () => {
  it("accepts a bounded versioned event and rejects unknown fields", () => {
    const event = fixtureEvent();
    expect(parseClientLogEvent(event)).toEqual(event);
    expect(() => parseClientLogEvent({ ...event, authorization: "Bearer secret" })).toThrow("client log event");
  });

  it("rejects unsafe field names at the contract boundary", () => {
    for (const fieldName of ["accessToken", "prompt", "prompt.text", "ai conversation body", "clipboard", "clipboard_data", "user-file-content", "paymentPayload", "payment-payload", "api-key", "verification_code", "payment_secret"]) {
      expect(() => parseClientLogEvent({ ...fixtureEvent(), fields: { [fieldName]: "secret" } })).toThrow("client log field name");
    }
  });

  it("requires operation and request IDs to be canonical UUIDs", () => {
    for (const key of ["operationId", "requestId"] as const) {
      expect(() => parseClientLogEvent({ ...fixtureEvent(), [key]: "not-a-uuid" })).toThrow("client log event");
    }
  });

  it.each([
    ["ordinary", "1.2.3", "2026-08-21T00:00:00.000Z", true],
    ["unbounded numeric core", "18446744073709551616.0.0", "2026-08-21T00:00:00.000Z", true],
    ["leading-zero core", "01.2.3", "2026-08-21T00:00:00.000Z", false],
    ["numeric prerelease leading zero", "1.2.3-01", "2026-08-21T00:00:00.000Z", false],
    ["leap second", "1.2.3", "2016-12-31T23:59:60.000Z", false],
  ] as const)(
    "shares the %s event compatibility case with the Rust archive validator",
    (_case, appVersion, occurredAt, accepted) => {
      const parse = () => parseClientLogEvent({
        ...fixtureEvent(),
        appVersion,
        occurredAt,
      });
      if (accepted) expect(parse()).toMatchObject({ appVersion, occurredAt });
      else expect(parse).toThrow();
    },
  );

  it("requires canonical sha256, byte counts and exact archive metadata", () => {
    const request = {
      platform: "windows" as const,
      architecture: "x64" as const,
      appVersion: "0.1.0",
      buildNumber: "1",
      range: "last_24_hours" as const,
      compressedBytes: "1048576",
      sha256: "a".repeat(64),
      eventCount: 42,
      firstOccurredAt: "2026-08-21T00:00:00.000Z",
      lastOccurredAt: "2026-08-21T01:00:00.000Z",
    };
    expect(parseCreateSupportLogUploadRequest(request)).toEqual(request);
    const v2Request = {
      ...request,
      uploadKind: "INSTALL_FAILURE",
      clientBuild: {
        buildId: "1".repeat(32),
        sourceGitSha: "1".repeat(40),
      },
    } as const;
    expect(parseCreateSupportLogUploadV2Request(v2Request)).toEqual(v2Request);
    expect(parseSupportUploadIdempotencyKey(
      "0187f707-77cc-7b6f-b18a-dfa6e87a9cf6",
    )).toBe("0187f707-77cc-7b6f-b18a-dfa6e87a9cf6");
    for (const idempotencyKey of [
      "account@example.com",
      "C:\\Users\\student\\AppData\\Local\\StudyBuddy\\logs\\run-1",
      "0187F707-77CC-7B6F-B18A-DFA6E87A9CF6",
    ]) {
      expect(() => parseSupportUploadIdempotencyKey(idempotencyKey))
        .toThrow("support log upload idempotency key");
    }
    expect(() => parseCreateSupportLogUploadV2Request({
      ...v2Request,
      idempotencyKey: "0187f707-77cc-7b6f-b18a-dfa6e87a9cf6",
    })).toThrow("support log upload request");
    expect(() => parseCreateSupportLogUploadRequest({ ...request, objectKey: "chosen/by/client" })).toThrow("support log upload request");
    expect(() => parseCreateSupportLogUploadRequest({ ...request, uploadUrl: "https://attacker.example" })).toThrow("support log upload request");
    expect(() => parseCreateSupportLogUploadRequest({ ...request, provider: "attacker" })).toThrow("support log upload request");
  });

  it("requires the server-issued upload id when completing", () => {
    expect(parseCompleteSupportLogUploadRequest({ uploadId: "123e4567-e89b-42d3-a456-426614174000", sha256: "b".repeat(64), compressedBytes: "120" })).toEqual({ uploadId: "123e4567-e89b-42d3-a456-426614174000", sha256: "b".repeat(64), compressedBytes: "120" });
  });

  it("documents the shared last-24-hours range semantics", () => {
    expect(SUPPORT_LOG_RANGE_SEMANTICS.last_24_hours).toContain("latest three recorded launch sessions");
  });

  it("rejects numeric prerelease identifiers with leading zeroes", () => {
    const request = { platform: "windows" as const, architecture: "x64" as const, appVersion: "1.0.0-01", buildNumber: "1", range: "last_24_hours" as const, compressedBytes: "1", sha256: "a".repeat(64), eventCount: 1, firstOccurredAt: "2026-08-21T00:00:00.000Z", lastOccurredAt: "2026-08-21T00:00:00.000Z" };
    expect(() => parseCreateSupportLogUploadRequest(request)).toThrow("support log upload request");
  });

  it("keeps the strict v1 create response unchanged", () => {
    const base = { uploadId: "123e4567-e89b-42d3-a456-426614174000", expiresInSeconds: 600, requiredHeaders: { "if-none-match": "*" } };
    expect(parseCreateSupportLogUploadResponse({ ...base, uploadUrl: "https://storage.example/upload" }).uploadUrl).toBe("https://storage.example/upload");
    expect(() => parseCreateSupportLogUploadResponse({ ...base, uploadUrl: "https:not-a-url" })).toThrow("support log upload response");
    expect(() => parseCreateSupportLogUploadResponse({
      ...base,
      uploadUrl: "https://storage.example/upload",
      publicCode: "LOG-ABC12345",
      status: "CREATED",
    })).toThrow("support log upload response");
  });

  it("requires a v2 write capability only while the upload is CREATED", () => {
    const base = {
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      publicCode: "LOG-ABC12345",
      uploadKind: "INSTALL_FAILURE",
      buildIdentityStatus: "UNKNOWN",
      requestFingerprint: "c".repeat(64),
    };
    const created = {
      ...base,
      status: "CREATED",
      expiresInSeconds: 600,
      requiredHeaders: { "if-none-match": "*" },
    };
    expect(parseCreateSupportLogUploadV2Response({ ...created, uploadUrl: "https://storage.example/upload" }).uploadUrl).toBe("https://storage.example/upload");
    expect(() => parseCreateSupportLogUploadV2Response({ ...created, uploadUrl: "https:not-a-url" })).toThrow("support log upload response");
    expect(() => parseCreateSupportLogUploadV2Response({
      ...created,
      uploadUrl: "https://storage.example/upload",
      requiredHeaders: {},
    })).toThrow("support log upload response");
    expect(parseCreateSupportLogUploadV2Response({
      ...base,
      status: "AVAILABLE",
    })).toEqual({
      ...base,
      status: "AVAILABLE",
    });
    expect(() => parseCreateSupportLogUploadV2Response({
      ...created,
      status: "AVAILABLE",
      uploadUrl: "https://storage.example/upload",
    })).toThrow("support log upload response");
  });

  it("bounds upload view expiry to the 30-day retention window", () => {
    const view = { platform: "windows" as const, architecture: "x64" as const, appVersion: "0.1.0", buildNumber: "1", range: "last_24_hours" as const, compressedBytes: "1", sha256: "a".repeat(64), eventCount: 1, firstOccurredAt: "2026-08-21T00:00:00.000Z", lastOccurredAt: "2026-08-21T00:00:00.000Z", id: "123e4567-e89b-42d3-a456-426614174000", publicCode: "LOG-ABC12345", status: "AVAILABLE" as const, createdAt: "2026-08-21T00:00:00.000Z", completedAt: null, expiresAt: "2026-09-20T00:00:00.000Z" };
    expect(parseSupportLogUploadView(view)).toEqual(view);
    expect(() => parseSupportLogUploadView({ ...view, publicCode: "ISSUE-ABC12345" })).toThrow("support log upload view");
    expect(() => parseSupportLogUploadView({ ...view, expiresAt: "2026-09-20T00:00:00.001Z" })).toThrow("support log upload view");
    expect(() => parseSupportLogUploadView({ ...view, expiresAt: view.createdAt })).toThrow("support log upload view");
    expect(() => parseSupportLogUploadView({ ...view, expiresAt: "2026-08-20T23:59:59.999Z" })).toThrow("support log upload view");
  });
});
