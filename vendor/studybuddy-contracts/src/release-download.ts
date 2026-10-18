import {
  parseDeviceProofInput,
  type DeviceProofInput,
} from "./device-authorization.js";

const PACKAGE_CODE_PATTERN = /^[a-z0-9._-]+$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

export type ReleaseManifestResponse = {
  packageCode: string;
  version: string;
  platform: "windows";
  architecture: "x64";
  channel: "stable";
  fileSizeBytes: string;
  sha256: string;
  publisherSignature: string;
  publishedAt: string;
};

export type DownloadTicketRequest = {
  packageCode: string;
  proof: DeviceProofInput;
};

export type DownloadTicketResponse = {
  ticket: string;
  expiresInSeconds: 600;
};

export type DownloadRedeemRequest = {
  ticket: string;
};

export type DownloadRedeemResponse = {
  downloadUrl: string;
  expiresInSeconds: number;
};

export type PublicWindowsReleaseArtifact = {
  kind: "installer_exe" | "portable_zip" | "updater_nsis";
  fileName: string;
  fileSizeBytes: string;
  sha256: string;
  downloadUrl: string;
  expiresInSeconds?: number;
};

export type PublicWindowsReleaseResponse = {
  packageCode: string;
  version: string;
  platform: "windows";
  architecture: "x64";
  channel: "stable";
  publishedAt: string;
  unsignedEarlyTest: boolean;
  artifacts:
    | readonly [PublicWindowsReleaseArtifact]
    | readonly [
      PublicWindowsReleaseArtifact,
      PublicWindowsReleaseArtifact,
      PublicWindowsReleaseArtifact,
    ];
};

export function parsePublicWindowsReleaseResponse(
  value: unknown,
): PublicWindowsReleaseResponse {
  const record = exactRecord(value, [
    "packageCode",
    "version",
    "platform",
    "architecture",
    "channel",
    "publishedAt",
    "unsignedEarlyTest",
    "artifacts",
  ], "public Windows installer response");
  if (
    typeof record.packageCode !== "string" ||
    record.packageCode.length < 1 ||
    record.packageCode.length > 100 ||
    !PACKAGE_CODE_PATTERN.test(record.packageCode) ||
    typeof record.version !== "string" ||
    !VERSION_PATTERN.test(record.version) ||
    record.platform !== "windows" ||
    record.architecture !== "x64" ||
    record.channel !== "stable" ||
    typeof record.publishedAt !== "string" ||
    !isCanonicalUtcTimestamp(record.publishedAt) ||
    typeof record.unsignedEarlyTest !== "boolean" ||
    !Array.isArray(record.artifacts) ||
    (record.artifacts.length !== 1 && record.artifacts.length !== 3)
  ) {
    throw new TypeError("public Windows installer response contains invalid fields");
  }

  const installer = parsePublicArtifact(record.artifacts[0], "installer_exe");
  if (record.artifacts.length === 1) {
    return {
      packageCode: record.packageCode,
      version: record.version,
      platform: "windows",
      architecture: "x64",
      channel: "stable",
      publishedAt: record.publishedAt,
      unsignedEarlyTest: record.unsignedEarlyTest,
      artifacts: [installer],
    };
  }
  const archive = parsePublicArtifact(record.artifacts[1], "portable_zip");
  const updater = parsePublicArtifact(record.artifacts[2], "updater_nsis");
  return {
    packageCode: record.packageCode,
    version: record.version,
    platform: "windows",
    architecture: "x64",
    channel: "stable",
    publishedAt: record.publishedAt,
    unsignedEarlyTest: record.unsignedEarlyTest,
    artifacts: [installer, archive, updater],
  };
}

function parsePublicArtifact(
  value: unknown,
  expectedKind: PublicWindowsReleaseArtifact["kind"],
): PublicWindowsReleaseArtifact {
  const record = exactRecordWithOptional(value, [
    "kind",
    "fileName",
    "fileSizeBytes",
    "sha256",
    "downloadUrl",
  ], ["expiresInSeconds"], "public Windows release artifact");
  const extension = expectedKind === "installer_exe"
    ? ".exe"
    : expectedKind === "updater_nsis"
      ? ".nsis.zip"
      : ".zip";
  if (
    record.kind !== expectedKind ||
    typeof record.fileName !== "string" ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(record.fileName) ||
    !record.fileName.toLowerCase().endsWith(extension) ||
    typeof record.fileSizeBytes !== "string" ||
    !POSITIVE_DECIMAL_PATTERN.test(record.fileSizeBytes) ||
    BigInt(record.fileSizeBytes) > MAX_SIGNED_BIGINT ||
    typeof record.sha256 !== "string" ||
    !SHA256_PATTERN.test(record.sha256) ||
    typeof record.downloadUrl !== "string" ||
    !isSafeDownloadUrl(record.downloadUrl, record.fileName) ||
    (record.expiresInSeconds !== undefined && (
      !Number.isSafeInteger(record.expiresInSeconds) ||
      (record.expiresInSeconds as number) < 1 ||
      (record.expiresInSeconds as number) > 1_800
    ))
  ) {
    throw new TypeError("public Windows release artifact contains invalid fields");
  }
  return record as PublicWindowsReleaseArtifact;
}

function exactRecordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
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
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) =>
      !requiredKeys.includes(key) && !optionalKeys.includes(key))
  ) {
    throw new TypeError(`${name} contains unknown or missing fields`);
  }
  return record;
}

export function parseDownloadTicketRequest(
  value: unknown,
): DownloadTicketRequest {
  const record = exactRecord(
    value,
    ["packageCode", "proof"],
    "download ticket request",
  );
  if (
    typeof record.packageCode !== "string" ||
    record.packageCode.length < 1 ||
    record.packageCode.length > 100 ||
    !PACKAGE_CODE_PATTERN.test(record.packageCode)
  ) {
    throw new TypeError(
      "packageCode must contain 1 to 100 lowercase identifier characters",
    );
  }

  return {
    packageCode: record.packageCode,
    proof: parseDeviceProofInput(record.proof),
  };
}

export function parseDownloadRedeemRequest(
  value: unknown,
): DownloadRedeemRequest {
  const record = exactRecord(
    value,
    ["ticket"],
    "download redeem request",
  );
  if (
    typeof record.ticket !== "string" ||
    !isCanonicalBase64urlWithExactBytes(record.ticket, 32)
  ) {
    throw new TypeError("ticket must be a canonical 32-byte base64url value");
  }

  return { ticket: record.ticket };
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

function isCanonicalBase64urlWithExactBytes(
  value: string,
  exactBytes: number,
): boolean {
  if (!BASE64URL_PATTERN.test(value)) return false;
  if (Math.floor((value.length * 6) / 8) !== exactBytes) return false;

  const remainder = value.length % 4;
  if (remainder === 1) return false;
  if (remainder === 0) return true;

  const lastCharacter = value[value.length - 1];
  if (lastCharacter === undefined) return false;
  const alphabetIndex =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(
      lastCharacter,
    );
  return remainder === 2
    ? (alphabetIndex & 0b1111) === 0
    : (alphabetIndex & 0b11) === 0;
}

function isCanonicalUtcTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
}

function isSafeDownloadUrl(value: string, fileName: string): boolean {
  if (value.length > 2_048 || !VISIBLE_ASCII_PATTERN.test(value)) {
    return false;
  }
  try {
    const UrlConstructor = (globalThis as unknown as {
      URL?: new (input: string) => {
        protocol: string;
        username: string;
        password: string;
        hostname: string;
        port: string;
        pathname: string;
        hash: string;
      };
    }).URL;
    if (UrlConstructor === undefined) return false;
    const url = new UrlConstructor(value);
    return (
      value.startsWith(
        "https://guijitongzhuo.com/studybuddy-releases/",
      ) &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname === "guijitongzhuo.com" &&
      url.port === "" &&
      url.pathname.startsWith("/studybuddy-releases/") &&
      url.pathname.length > "/studybuddy-releases/".length &&
      url.pathname.endsWith(`/${fileName}`) &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}
