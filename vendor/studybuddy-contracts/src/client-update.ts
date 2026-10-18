export type ReleasePlatform = "windows" | "macos";
export type ReleaseArchitecture = "x64" | "aarch64";
export type ReleaseChannel = "stable";
export type ReleaseArtifactKind = "nsis" | "app_tar_gz";

export type ReleaseTarget = {
  platform: ReleasePlatform;
  architecture: ReleaseArchitecture;
  artifactKind: ReleaseArtifactKind;
};

export type DynamicUpdateResponse = {
  version: string;
  pub_date: string;
  url: string;
  signature: string;
  notes: string;
  release_id: string;
  sha256: string;
  file_size_bytes: string;
};

export type PersistedUpdateNotice = {
  targetVersion: string;
  notes: string;
  publishedAt: string;
  confirmedAt: string;
  releaseId: string;
};

export type UpdateStateView =
  | { status: "checking"; currentVersion: string }
  | { status: "current"; currentVersion: string; checkedAt: string }
  | {
      status: "available";
      currentVersion: string;
      targetVersion: string;
      notes: string;
      publishedAt: string;
    }
  | {
      status: "downloading";
      currentVersion: string;
      targetVersion: string;
      downloadedBytes: string;
      totalBytes: string | null;
    }
  | { status: "verifying"; currentVersion: string; targetVersion: string }
  | { status: "installing"; currentVersion: string; targetVersion: string }
  | {
      status: "failed";
      currentVersion: string;
      targetVersion: string | null;
      errorCode: string;
      retryable: boolean;
    }
  | {
      status: "unavailable";
      currentVersion: string;
      lastKnownUpdate: PersistedUpdateNotice | null;
    };

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;
const UPDATE_ERROR_PATTERN = /^UPDATE_[A-Z0-9_]{1,80}$/;

export function parseReleaseTarget(value: unknown): ReleaseTarget {
  const record = exactRecord(
    value,
    ["platform", "architecture", "artifactKind"],
    "release target",
  );
  const supported =
    (record.platform === "windows" &&
      record.architecture === "x64" &&
      record.artifactKind === "nsis") ||
    (record.platform === "macos" &&
      (record.architecture === "x64" || record.architecture === "aarch64") &&
      record.artifactKind === "app_tar_gz");
  if (!supported) throw new TypeError("release target is unsupported");
  return record as ReleaseTarget;
}

export function parseDynamicUpdateResponse(value: unknown): DynamicUpdateResponse {
  const record = exactRecord(
    value,
    [
      "version",
      "pub_date",
      "url",
      "signature",
      "notes",
      "release_id",
      "sha256",
      "file_size_bytes",
    ],
    "dynamic update response",
  );
  if (
    !isSemVer(record.version) ||
    !isCanonicalUtcTimestamp(record.pub_date) ||
    !isUpdateDownloadUrl(record.url) ||
    typeof record.signature !== "string" ||
    record.signature.length < 1 ||
    record.signature.length > 4_096 ||
    typeof record.notes !== "string" ||
    record.notes.length > 4_000 ||
    typeof record.release_id !== "string" ||
    !UUID_PATTERN.test(record.release_id) ||
    typeof record.sha256 !== "string" ||
    !SHA256_PATTERN.test(record.sha256) ||
    typeof record.file_size_bytes !== "string" ||
    !POSITIVE_DECIMAL_PATTERN.test(record.file_size_bytes)
  ) {
    throw new TypeError("dynamic update response contains invalid fields");
  }
  return record as DynamicUpdateResponse;
}

export function parsePersistedUpdateNotice(value: unknown): PersistedUpdateNotice {
  const record = exactRecord(
    value,
    ["targetVersion", "notes", "publishedAt", "confirmedAt", "releaseId"],
    "persisted update notice",
  );
  if (
    !isSemVer(record.targetVersion) ||
    typeof record.notes !== "string" ||
    record.notes.length > 4_000 ||
    !isCanonicalUtcTimestamp(record.publishedAt) ||
    !isCanonicalUtcTimestamp(record.confirmedAt) ||
    typeof record.releaseId !== "string" ||
    !UUID_PATTERN.test(record.releaseId)
  ) {
    throw new TypeError("persisted update notice contains invalid fields");
  }
  return record as PersistedUpdateNotice;
}

export function parseUpdateStateView(value: unknown): UpdateStateView {
  const status = readStatus(value);
  const record = exactRecord(value, stateKeys(status), "update state");
  if (!isSemVer(record.currentVersion)) {
    throw new TypeError("update state contains invalid currentVersion");
  }
  switch (status) {
    case "checking":
      break;
    case "current":
      if (!isCanonicalUtcTimestamp(record.checkedAt)) throw invalidState();
      break;
    case "available":
      if (
        !isSemVer(record.targetVersion) ||
        typeof record.notes !== "string" ||
        record.notes.length > 4_000 ||
        !isCanonicalUtcTimestamp(record.publishedAt)
      ) throw invalidState();
      break;
    case "downloading":
      if (
        !isSemVer(record.targetVersion) ||
        typeof record.downloadedBytes !== "string" ||
        !DECIMAL_PATTERN.test(record.downloadedBytes) ||
        (record.totalBytes !== null &&
          (typeof record.totalBytes !== "string" ||
            !POSITIVE_DECIMAL_PATTERN.test(record.totalBytes)))
      ) throw invalidState();
      break;
    case "verifying":
      if (!isSemVer(record.targetVersion)) throw invalidState();
      break;
    case "installing":
      if (!isSemVer(record.targetVersion)) throw invalidState();
      break;
    case "failed":
      if (
        (record.targetVersion !== null && !isSemVer(record.targetVersion)) ||
        typeof record.errorCode !== "string" ||
        !UPDATE_ERROR_PATTERN.test(record.errorCode) ||
        typeof record.retryable !== "boolean"
      ) throw invalidState();
      break;
    case "unavailable":
      if (record.lastKnownUpdate !== null) {
        parsePersistedUpdateNotice(record.lastKnownUpdate);
      }
      break;
  }
  return record as UpdateStateView;
}

function readStatus(value: unknown): UpdateStateView["status"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidState();
  }
  const status = (value as { status?: unknown }).status;
  if (
    status !== "checking" &&
    status !== "current" &&
    status !== "available" &&
    status !== "downloading" &&
    status !== "verifying" &&
    status !== "installing" &&
    status !== "failed" &&
    status !== "unavailable"
  ) throw invalidState();
  return status;
}

function stateKeys(status: UpdateStateView["status"]): string[] {
  switch (status) {
    case "checking": return ["status", "currentVersion"];
    case "current": return ["status", "currentVersion", "checkedAt"];
    case "available": return ["status", "currentVersion", "targetVersion", "notes", "publishedAt"];
    case "downloading": return ["status", "currentVersion", "targetVersion", "downloadedBytes", "totalBytes"];
    case "verifying": return ["status", "currentVersion", "targetVersion"];
    case "installing": return ["status", "currentVersion", "targetVersion"];
    case "failed": return ["status", "currentVersion", "targetVersion", "errorCode", "retryable"];
    case "unavailable": return ["status", "currentVersion", "lastKnownUpdate"];
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
  ) throw new TypeError(`${name} must be an object`);
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !keys.includes(key))
  ) throw new TypeError(`${name} contains unknown or missing fields`);
  return record;
}

function isSemVer(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && SEMVER_PATTERN.test(value);
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
}

function isUpdateDownloadUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    value.includes("/../") ||
    value.includes("/./") ||
    value.includes("\\")
  ) return false;
  try {
    const UrlConstructor = (globalThis as unknown as {
      URL?: new (input: string) => {
        protocol: string;
        username: string;
        password: string;
        hostname: string;
        port: string;
        pathname: string;
        search: string;
        hash: string;
      };
    }).URL;
    if (UrlConstructor === undefined) return false;
    const url = new UrlConstructor(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname === "guijitongzhuo.com" &&
      url.port === "" &&
      /^\/studybuddy-releases\/releases\/windows\/x64\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.nsis\.zip$/.test(url.pathname) &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function invalidState(): TypeError {
  return new TypeError("update state contains invalid fields");
}
