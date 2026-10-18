import type { AcademicDirectoryItem } from "./academic.js";
import {
  normalizeProfileNickname,
  parseCanonicalProfileViewNickname,
} from "./profile-nickname.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GRADE_PATTERN = /^(19|20)\d{2}级$/u;
const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;

export type AcademicEntityView = Readonly<{
  id: AcademicDirectoryItem["id"];
  name: AcademicDirectoryItem["name"];
  status: Extract<AcademicDirectoryItem["status"], "verified" | "pending">;
}>;

type CampusIdentityDetails = Readonly<{
  realName: string;
  school: AcademicEntityView;
  college: AcademicEntityView;
  program: AcademicEntityView;
  grade: string;
}>;

export type CampusIdentityState =
  | Readonly<{ status: "missing" }>
  | (Readonly<{ status: "pending" }> & CampusIdentityDetails)
  | (Readonly<{ status: "confirmed"; revision: number }> & CampusIdentityDetails)
  | (Readonly<{ status: "correction_pending"; revision: number }> & CampusIdentityDetails);

export type OwnerPersonalProfileView = Readonly<{
  schemaVersion: 1;
  profileVersion: number;
  avatarUrl: string;
  nickname: string;
  publicId: string;
  membership: "lifetime" | "member" | "none";
  campus: CampusIdentityState;
  account: Readonly<{
    email: string;
    currentDeviceDisplayName: string | null;
  }>;
}>;

export type PublicProfileView = Readonly<{
  avatarUrl: string;
  nickname: string;
  publicId: string;
  membership: "lifetime" | "member" | "none";
}>;

export type CampusCollaboratorIdentityView = Readonly<{
  avatarUrl: string;
  nickname: string;
  realName: string;
  school: AcademicEntityView;
  college: AcademicEntityView;
  program: AcademicEntityView;
  grade: string;
}>;

export type PersonalProfileUpdate = Readonly<{
  nickname: string;
  expectedVersion: number;
}>;

export type PersonalProfileAvatarPreset = "male" | "female";

export type PersonalProfileAvatarPresetUpdate = Readonly<{
  preset: PersonalProfileAvatarPreset;
  expectedVersion: number;
}>;

export function parseOwnerPersonalProfileView(
  value: unknown,
): OwnerPersonalProfileView {
  const error = "OWNER_PERSONAL_PROFILE_INVALID";
  const record = exactRecord(value, [
    "schemaVersion",
    "profileVersion",
    "avatarUrl",
    "nickname",
    "publicId",
    "membership",
    "campus",
    "account",
  ], error);
  if (record.schemaVersion !== 1) throw new TypeError(error);
  const account = exactRecord(
    record.account,
    ["email", "currentDeviceDisplayName"],
    error,
  );
  return {
    schemaVersion: 1,
    profileVersion: positiveSafeInteger(record.profileVersion, error),
    avatarUrl: safeAvatarUrl(record.avatarUrl, error),
    nickname: parseCanonicalProfileViewNickname(record.nickname, error),
    publicId: canonicalUuid(record.publicId, error),
    membership: membership(record.membership, error),
    campus: parseCampusIdentityState(record.campus, error),
    account: {
      email: emailAddress(account.email, error),
      currentDeviceDisplayName: account.currentDeviceDisplayName === null
        ? null
        : boundedText(account.currentDeviceDisplayName, 160, error),
    },
  };
}

export function parsePublicProfileView(value: unknown): PublicProfileView {
  const error = "PUBLIC_PROFILE_INVALID";
  const record = exactRecord(
    value,
    ["avatarUrl", "nickname", "publicId", "membership"],
    error,
  );
  return {
    avatarUrl: safeAvatarUrl(record.avatarUrl, error),
    nickname: parseCanonicalProfileViewNickname(record.nickname, error),
    publicId: canonicalUuid(record.publicId, error),
    membership: membership(record.membership, error),
  };
}

export function parseCampusCollaboratorIdentityView(
  value: unknown,
): CampusCollaboratorIdentityView {
  const error = "CAMPUS_IDENTITY_INVALID";
  const record = exactRecord(value, [
    "avatarUrl",
    "nickname",
    "realName",
    "school",
    "college",
    "program",
    "grade",
  ], error);
  const school = parseAcademicEntity(record.school, error);
  const college = parseAcademicEntity(record.college, error);
  const program = parseAcademicEntity(record.program, error);
  if ([school, college, program].some((entity) => entity.status !== "verified")) {
    throw new TypeError(error);
  }
  return {
    avatarUrl: safeAvatarUrl(record.avatarUrl, error),
    nickname: parseCanonicalProfileViewNickname(record.nickname, error),
    realName: boundedText(record.realName, 120, error),
    school,
    college,
    program,
    grade: enrollmentGrade(record.grade, error),
  };
}

export function parsePersonalProfileUpdate(value: unknown): PersonalProfileUpdate {
  const error = "PERSONAL_PROFILE_UPDATE_INVALID";
  const record = exactRecord(value, ["nickname", "expectedVersion"], error);
  return {
    nickname: normalizeProfileNickname(record.nickname, error),
    expectedVersion: positiveSafeInteger(record.expectedVersion, error),
  };
}

export function parsePersonalProfileAvatarPresetUpdate(
  value: unknown,
): PersonalProfileAvatarPresetUpdate {
  const error = "PERSONAL_PROFILE_AVATAR_PRESET_INVALID";
  const record = exactRecord(value, ["preset", "expectedVersion"], error);
  if (record.preset !== "male" && record.preset !== "female") {
    throw new TypeError(error);
  }
  return {
    preset: record.preset,
    expectedVersion: positiveSafeInteger(record.expectedVersion, error),
  };
}

export function parseCampusIdentityState(
  value: unknown,
  error = "CAMPUS_IDENTITY_INVALID",
): CampusIdentityState {
  const record = plainRecord(value, error);
  if (record.status === "missing") {
    exactKeys(record, ["status"], error);
    return { status: "missing" };
  }
  if (record.status === "pending") {
    exactKeys(
      record,
      ["status", "realName", "school", "college", "program", "grade"],
      error,
    );
    const details = parseCampusIdentityDetails(record, error);
    if ([details.school, details.college, details.program]
      .every((entity) => entity.status === "verified")) {
      throw new TypeError(error);
    }
    return { status: "pending", ...details };
  }
  if (record.status === "confirmed" || record.status === "correction_pending") {
    exactKeys(record, [
      "status",
      "realName",
      "school",
      "college",
      "program",
      "grade",
      "revision",
    ], error);
    const details = parseCampusIdentityDetails(record, error);
    if ([details.school, details.college, details.program]
      .some((entity) => entity.status !== "verified")) {
      throw new TypeError(error);
    }
    return {
      status: record.status,
      ...details,
      revision: positiveSafeInteger(record.revision, error),
    };
  }
  throw new TypeError(error);
}

function parseCampusIdentityDetails(
  record: Record<string, unknown>,
  error: string,
): CampusIdentityDetails {
  return {
    realName: boundedText(record.realName, 120, error),
    school: parseAcademicEntity(record.school, error),
    college: parseAcademicEntity(record.college, error),
    program: parseAcademicEntity(record.program, error),
    grade: enrollmentGrade(record.grade, error),
  };
}

function parseAcademicEntity(value: unknown, error: string): AcademicEntityView {
  const record = exactRecord(value, ["id", "name", "status"], error);
  if (record.status !== "verified" && record.status !== "pending") {
    throw new TypeError(error);
  }
  return {
    id: canonicalUuid(record.id, error),
    name: boundedText(record.name, 160, error),
    status: record.status,
  };
}

function membership(
  value: unknown,
  error: string,
): OwnerPersonalProfileView["membership"] {
  if (value !== "lifetime" && value !== "member" && value !== "none") {
    throw new TypeError(error);
  }
  return value;
}

function safeAvatarUrl(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2048 ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    value.includes("\\")
  ) {
    throw new TypeError(error);
  }
  let parsed: {
    protocol: string;
    hostname: string;
    username: string;
    password: string;
    hash: string;
  };
  try {
    const URLConstructor = (globalThis as typeof globalThis & {
      URL: new (url: string, base: string) => typeof parsed;
    }).URL;
    parsed = new URLConstructor(value, "https://studybuddy.invalid");
  } catch {
    throw new TypeError(error);
  }
  const isSameOriginPath = value.startsWith("/") && !value.startsWith("//");
  if (
    !isSameOriginPath ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "studybuddy.invalid" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError(error);
  }
  return value;
}

function emailAddress(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  ) {
    throw new TypeError(error);
  }
  return value;
}

function enrollmentGrade(value: unknown, error: string): string {
  const grade = boundedText(value, 32, error);
  if (!GRADE_PATTERN.test(grade)) throw new TypeError(error);
  return grade;
}

function boundedText(value: unknown, maximumBytes: number, error: string): string {
  if (typeof value !== "string") throw new TypeError(error);
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length < 1 ||
    utf8ByteLength(normalized, maximumBytes + 1) > maximumBytes ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new TypeError(error);
  }
  return normalized;
}

function utf8ByteLength(value: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
    if (bytes >= stopAfter) return bytes;
  }
  return bytes;
}

function positiveSafeInteger(value: unknown, error: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(error);
  }
  return value;
}

function canonicalUuid(value: unknown, error: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function plainRecord(value: unknown, error: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(error);
  }
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = plainRecord(value, error);
  exactKeys(record, keys, error);
  return record;
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(error);
  }
}
