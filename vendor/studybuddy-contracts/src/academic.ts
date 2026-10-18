const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GRADE_PATTERN = /^(19|20)\d{2}级$/u;

export type AcademicEntityStatusView =
  | "verified"
  | "pending"
  | "merged"
  | "disabled";

export type AcademicEntitySelection =
  | Readonly<{ id: string }>
  | Readonly<{ candidateName: string }>;

export type AcademicProgramSelection =
  | Readonly<{ id: string }>
  | Readonly<{ candidateName: string; majorCatalogId?: string }>;

export type AcademicProfileLockRequest = Readonly<{
  realName: string;
  school: AcademicEntitySelection;
  college: AcademicEntitySelection;
  program: AcademicProgramSelection;
  grade: string;
}>;

export type AcademicProfileCorrectionRequest = AcademicProfileLockRequest & Readonly<{
  reason: string;
  expectedRevision: number;
}>;

export type AcademicDirectoryUpdateRequest = Readonly<{
  college: AcademicEntitySelection;
  program: AcademicProgramSelection;
  expectedRevision: number;
}>;

export type AcademicProfileView = Readonly<{
  displayName: string;
  school: Readonly<{ id: string; name: string }>;
  college: Readonly<{
    id: string;
    name: string;
    status: AcademicEntityStatusView;
  }>;
  program: Readonly<{
    id: string;
    name: string;
    status: AcademicEntityStatusView;
    majorCatalogId: string | null;
  }>;
  grade: string;
  lockedAt: string;
  revision: number;
}>;

export type AcademicDirectoryEntityType =
  | "school"
  | "college"
  | "program"
  | "major";

export type AcademicDirectoryItem = Readonly<{
  entityType: AcademicDirectoryEntityType;
  id: string;
  name: string;
  status: AcademicEntityStatusView;
  schoolId: string | null;
  collegeId: string | null;
  majorCatalogId: string | null;
}>;

export type AcademicDirectorySearchView = Readonly<{
  items: AcademicDirectoryItem[];
}>;

export function parseAcademicProfileLockRequest(
  value: unknown,
): AcademicProfileLockRequest {
  const error = "ACADEMIC_PROFILE_INVALID";
  const record = exactRecord(
    value,
    ["realName", "school", "college", "program", "grade"],
    error,
  );
  return parseAcademicIdentityFields(record, error);
}

export function parseAcademicDirectoryUpdateRequest(value: unknown): AcademicDirectoryUpdateRequest {
  const error = "ACADEMIC_DIRECTORY_UPDATE_INVALID";
  const record = exactRecord(value, ["college", "program", "expectedRevision"], error);
  return {
    college: parseEntitySelection(record.college, error),
    program: parseProgramSelection(record.program, error),
    expectedRevision: positiveSafeInteger(record.expectedRevision, error),
  };
}

export function parseAcademicProfileCorrectionRequest(
  value: unknown,
): AcademicProfileCorrectionRequest {
  const error = "ACADEMIC_CORRECTION_INVALID";
  const record = exactRecord(value, [
    "realName",
    "school",
    "college",
    "program",
    "grade",
    "reason",
    "expectedRevision",
  ], error);
  return {
    ...parseAcademicIdentityFields(record, error),
    reason: boundedText(record.reason, 500, error),
    expectedRevision: positiveSafeInteger(record.expectedRevision, error),
  };
}

function parseAcademicIdentityFields(
  record: Record<string, unknown>,
  error: string,
): AcademicProfileLockRequest {
  return {
    realName: boundedText(record.realName, 120, error),
    school: parseEntitySelection(record.school, error),
    college: parseEntitySelection(record.college, error),
    program: parseProgramSelection(record.program, error),
    grade: enrollmentGrade(record.grade, error),
  };
}

function parseEntitySelection(
  value: unknown,
  error: string,
): AcademicEntitySelection {
  const record = plainRecord(value, error);
  const keys = Reflect.ownKeys(record);
  if (keys.length !== 1) throw new TypeError(error);
  if (keys[0] === "id") return { id: canonicalUuid(record.id, error) };
  if (keys[0] === "candidateName") {
    return { candidateName: boundedText(record.candidateName, 160, error) };
  }
  throw new TypeError(error);
}

function parseProgramSelection(
  value: unknown,
  error: string,
): AcademicProgramSelection {
  const record = plainRecord(value, error);
  const keys = Reflect.ownKeys(record);
  if (keys.length === 1 && keys[0] === "id") {
    return { id: canonicalUuid(record.id, error) };
  }
  if (
    keys.length < 1 ||
    keys.length > 2 ||
    !keys.includes("candidateName") ||
    keys.some((key) => key !== "candidateName" && key !== "majorCatalogId")
  ) {
    throw new TypeError(error);
  }
  const candidateName = boundedText(record.candidateName, 160, error);
  return record.majorCatalogId === undefined
    ? { candidateName }
    : { candidateName, majorCatalogId: canonicalUuid(record.majorCatalogId, error) };
}

function enrollmentGrade(value: unknown, error: string): string {
  const grade = boundedText(value, 32, error);
  if (!GRADE_PATTERN.test(grade)) throw new TypeError(error);
  return grade;
}

function positiveSafeInteger(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(error);
  }
  return value as number;
}

function boundedText(value: unknown, maximumBytes: number, error: string): string {
  if (typeof value !== "string") throw new TypeError(error);
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const length = utf8ByteLength(normalized, maximumBytes + 1);
  if (length < 1 || length > maximumBytes) throw new TypeError(error);
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
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(error);
  }
  return record;
}
