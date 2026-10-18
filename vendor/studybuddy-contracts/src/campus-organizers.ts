const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type StartCampusOrganizerAssignment = Readonly<{
  schoolId: string;
  organizerStudyBuddyUserId: string;
  effectiveFrom: string;
  reason: string;
}>;

export type EndCampusOrganizerAssignment = Readonly<{
  effectiveTo: string;
  reason: string;
}>;

export type CampusOrganizerAssignmentView = Readonly<{
  id: string;
  programCode: "founding-v1";
  amountFen: 1000;
  currency: "CNY";
  school: Readonly<{ id: string; name: string }>;
  organizer: Readonly<{ studyBuddyUserId: string }>;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "ACTIVE" | "ENDED";
}>;

export function parseStartCampusOrganizerAssignment(value: unknown): StartCampusOrganizerAssignment {
  const record = exactRecord(value, ["schoolId", "organizerStudyBuddyUserId", "effectiveFrom", "reason"]);
  return {
    schoolId: canonicalUuid(record.schoolId),
    organizerStudyBuddyUserId: canonicalUuid(record.organizerStudyBuddyUserId),
    effectiveFrom: canonicalInstant(record.effectiveFrom),
    reason: boundedText(record.reason, 500),
  };
}

export function parseEndCampusOrganizerAssignment(value: unknown): EndCampusOrganizerAssignment {
  const record = exactRecord(value, ["effectiveTo", "reason"]);
  return {
    effectiveTo: canonicalInstant(record.effectiveTo),
    reason: boundedText(record.reason, 500),
  };
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalid();
  }
  const record = value as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) throw invalid();
  return record;
}

function canonicalUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw invalid();
  return value;
}

function canonicalInstant(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw invalid();
  return value;
}

function boundedText(value: unknown, maximumBytes: number): string {
  if (typeof value !== "string") throw invalid();
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length === 0 || utf8ByteLength(normalized, maximumBytes + 1) > maximumBytes) throw invalid();
  return normalized;
}

function utf8ByteLength(value: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes >= stopAfter) return bytes;
  }
  return bytes;
}

function invalid(): TypeError {
  return new TypeError("CAMPUS_ORGANIZER_INVALID");
}
