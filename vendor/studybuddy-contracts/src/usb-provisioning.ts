const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const CANONICAL_UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const MANIFEST_KEYS = [
  "schemaVersion",
  "environment",
  "batchId",
  "signingKeyVersion",
  "createdAt",
  "count",
  "identities",
] as const;
const MANIFEST_IDENTITY_KEYS = [
  "usbId",
  "identityDigest",
  "payloadPath",
  "signaturePath",
] as const;
const RECEIPT_KEYS = [
  "schemaVersion",
  "environment",
  "batchId",
  "manifestDigest",
  "importedCount",
  "importedAt",
] as const;
const USB_IDENTITY_KEYS = [
  "schemaVersion",
  "usbId",
  "batchId",
  "issuedAt",
  "signingKeyVersion",
] as const;

export type UsbBatchEnvironment = "test" | "production";

export type UsbIdentityFields = Readonly<{
  schemaVersion: 1;
  usbId: string;
  batchId: string;
  issuedAt: string;
  signingKeyVersion: number;
}>;

export type UsbBatchManifest = Readonly<{
  schemaVersion: 1;
  environment: UsbBatchEnvironment;
  batchId: string;
  signingKeyVersion: number;
  createdAt: string;
  count: number;
  identities: readonly Readonly<{
    usbId: string;
    identityDigest: string;
    payloadPath: string;
    signaturePath: string;
  }>[];
}>;

export type UsbImportReceipt = Readonly<{
  schemaVersion: 1;
  environment: UsbBatchEnvironment;
  batchId: string;
  manifestDigest: string;
  importedCount: number;
  importedAt: string;
}>;

export function canonicalUsbIdentity(input: UsbIdentityFields): Uint8Array {
  const record = exactRecord(input, USB_IDENTITY_KEYS, "USB identity");
  const canonical: UsbIdentityFields = {
    schemaVersion: schemaVersion(record.schemaVersion),
    usbId: canonicalUuid(record.usbId, "usbId"),
    batchId: canonicalUuid(record.batchId, "batchId"),
    issuedAt: canonicalUtcInstant(record.issuedAt, "issuedAt"),
    signingKeyVersion: positiveSafeInteger(
      record.signingKeyVersion,
      "signingKeyVersion",
    ),
  };

  const serialized = `${JSON.stringify(canonical)}\n`;
  // Every variable field is ASCII-only; the contracts build intentionally has
  // no DOM TextEncoder dependency.
  return Uint8Array.from(
    Array.from(serialized, (character) => character.charCodeAt(0)),
  );
}

export function parseUsbBatchManifest(input: unknown): UsbBatchManifest {
  const record = exactRecord(input, MANIFEST_KEYS, "USB batch manifest");
  const environment = batchEnvironment(record.environment);
  const count = positiveSafeInteger(record.count, "count");
  const maximumCount = environment === "test" ? 100 : 5_000;
  if (count > maximumCount) {
    throw new TypeError(
      `count must not exceed ${maximumCount} for ${environment} batches`,
    );
  }
  if (!Array.isArray(record.identities)) {
    throw new TypeError("identities must be an array");
  }
  if (record.identities.length !== count) {
    throw new TypeError("count must equal identities length");
  }

  const identities = Array.from(record.identities, (value, index) =>
    parseManifestIdentity(value, index),
  );
  assertUniqueManifestIdentities(identities);
  for (const identity of identities) {
    const expectedBase = `identities/${identity.usbId}`;
    if (
      identity.payloadPath !== `${expectedBase}/device.json` ||
      identity.signaturePath !== `${expectedBase}/device.sig`
    ) {
      throw new TypeError(
        "USB batch identity paths must match the fixed archive structure",
      );
    }
  }

  return {
    schemaVersion: schemaVersion(record.schemaVersion),
    environment,
    batchId: canonicalUuid(record.batchId, "batchId"),
    signingKeyVersion: positiveSafeInteger(
      record.signingKeyVersion,
      "signingKeyVersion",
    ),
    createdAt: canonicalUtcInstant(record.createdAt, "createdAt"),
    count,
    identities,
  };
}

export function parseUsbImportReceipt(input: unknown): UsbImportReceipt {
  const record = exactRecord(input, RECEIPT_KEYS, "USB import receipt");
  const environment = batchEnvironment(record.environment);
  const importedCount = positiveSafeInteger(
    record.importedCount,
    "importedCount",
  );
  const maximumCount = environment === "test" ? 100 : 5_000;
  if (importedCount > maximumCount) {
    throw new TypeError(
      `importedCount must not exceed ${maximumCount} for ${environment} batches`,
    );
  }

  return {
    schemaVersion: schemaVersion(record.schemaVersion),
    environment,
    batchId: canonicalUuid(record.batchId, "batchId"),
    manifestDigest: sha256Digest(record.manifestDigest, "manifestDigest"),
    importedCount,
    importedAt: canonicalUtcInstant(record.importedAt, "importedAt"),
  };
}

type ParsedManifestIdentity = UsbBatchManifest["identities"][number];

function parseManifestIdentity(
  input: unknown,
  index: number,
): ParsedManifestIdentity {
  const record = exactRecord(
    input,
    MANIFEST_IDENTITY_KEYS,
    `USB batch identity at index ${index}`,
  );

  return {
    usbId: canonicalUuid(record.usbId, "usbId"),
    identityDigest: sha256Digest(
      record.identityDigest,
      "identityDigest",
    ),
    payloadPath: safeArchivePath(record.payloadPath, "payloadPath"),
    signaturePath: safeArchivePath(record.signaturePath, "signaturePath"),
  };
}

function assertUniqueManifestIdentities(
  identities: readonly ParsedManifestIdentity[],
): void {
  const usbIds = new Set<string>();
  const digests = new Set<string>();
  const paths = new Set<string>();

  for (const identity of identities) {
    if (usbIds.has(identity.usbId)) {
      throw new TypeError("usbId values must be unique within a batch");
    }
    usbIds.add(identity.usbId);

    if (digests.has(identity.identityDigest)) {
      throw new TypeError(
        "identityDigest values must be unique within a batch",
      );
    }
    digests.add(identity.identityDigest);

    for (const path of [identity.payloadPath, identity.signaturePath]) {
      if (paths.has(path)) {
        throw new TypeError("identity paths must be unique within a batch");
      }
      paths.add(path);
    }
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${name} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${name} contains unknown or missing fields`);
  }

  return record;
}

function schemaVersion(value: unknown): 1 {
  if (value !== 1) {
    throw new TypeError("schemaVersion must be 1");
  }
  return value;
}

function batchEnvironment(value: unknown): UsbBatchEnvironment {
  if (value !== "test" && value !== "production") {
    throw new TypeError("environment must be test or production");
  }
  return value;
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function canonicalUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !CANONICAL_UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a canonical lowercase UUID`);
  }
  return value;
}

function canonicalUtcInstant(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !CANONICAL_UTC_INSTANT_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(
      `${name} must be a canonical UTC ISO-8601 timestamp`,
    );
  }
  return value;
}

function sha256Digest(value: unknown, name: string): string {
  if (typeof value !== "string" || !SHA256_HEX_PATTERN.test(value)) {
    throw new TypeError(
      `${name} must be a 64-character lowercase hexadecimal SHA-256 digest`,
    );
  }
  return value;
}

function safeArchivePath(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//.test(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new TypeError(`${name} must be a safe relative archive path`);
  }

  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError(`${name} must be a normalized relative archive path`);
  }

  return segments.join("/");
}
