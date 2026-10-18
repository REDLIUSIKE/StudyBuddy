const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DISPLAY_IDENTIFIER_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const CAMPUS_ORGANIZER_GRANT_STATES = [
  "NOT_GRANTED",
  "SCHEDULED",
  "ACTIVE",
  "REVOKED",
] as const;

export type CampusOrganizerGrantState =
  (typeof CAMPUS_ORGANIZER_GRANT_STATES)[number];

export type CampusOrganizerGrantInput = Readonly<{
  schoolId: string;
  effectiveFrom: string;
  reason: string;
}>;

export type CampusOrganizerRevokeInput = Readonly<{
  grantId: string;
  revision: number;
  reason: string;
}>;

export type CampusOrganizerGrantProjection = Readonly<{
  grantId: string;
  school: Readonly<{ id: string; name: string }>;
  revision: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type CampusOrganizerAdminGrant = CampusOrganizerGrantProjection &
  Readonly<{
    grantReason: string;
    revokeReason: string | null;
    grantedByAdminUserId: string;
    revokedByAdminUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

export type CampusOrganizerCommissionAssignmentSummary = Readonly<{
  id: string;
  schoolId: string;
  status: "ACTIVE" | "ENDED";
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type CampusOrganizerAdminView = Readonly<{
  studyBuddyUserId: string;
  accountMasked: string;
  userStatus: "ACTIVE" | "SUSPENDED";
  state: CampusOrganizerGrantState;
  grant: CampusOrganizerAdminGrant | null;
  commissionAssignment: CampusOrganizerCommissionAssignmentSummary | null;
}>;

export type CampusOrganizerListQuery = Readonly<{
  state?: CampusOrganizerGrantState;
  schoolId?: string;
  cursor?: string;
  limit: number;
}>;

export type CampusOrganizerListPage = Readonly<{
  items: readonly CampusOrganizerAdminView[];
  nextCursor: string | null;
}>;

export type CampusPlaybookDocumentGroup = Readonly<{
  id: string;
  title: string;
}>;

export type CampusPlaybookDocumentMedia = Readonly<{
  id: string;
  title: string;
  assetId: string;
  alt: string;
  scene: string;
  size: string;
  version: string;
  updatedAt: string;
  source: string;
}>;

export type CampusPlaybookDocumentSection = Readonly<{
  id: string;
  title: string;
  prompt?: string;
  body?: string;
  items?: readonly string[];
  ordered?: boolean;
  tone?: "support" | "note";
  links?: readonly Readonly<{ label: string; href: string }>[];
  media?: readonly CampusPlaybookDocumentMedia[];
  faqs?: readonly Readonly<{
    category: string;
    question: string;
    answer: string;
  }>[];
}>;

export type CampusPlaybookDocumentEntry = Readonly<{
  id: string;
  groupId: string;
  navTitle: string;
  eyebrow: string;
  summary: string;
  status?: string;
  sections: readonly CampusPlaybookDocumentSection[];
}>;

export type CampusPlaybookDocument = Readonly<{
  version: string;
  access: CampusOrganizerGrantProjection;
  groups: readonly CampusPlaybookDocumentGroup[];
  entries: readonly CampusPlaybookDocumentEntry[];
}>;

export type CampusPlaybookAssetMetadata = Readonly<{
  assetId: string;
  url: string;
  mediaType: "image/png";
  contentLength: number;
  sha256: string;
}>;

export function parseCampusOrganizerGrantInput(
  value: unknown,
): CampusOrganizerGrantInput {
  const record = exactRecord(value, [
    "schoolId",
    "effectiveFrom",
    "reason",
  ]);
  return {
    schoolId: canonicalUuid(record.schoolId),
    effectiveFrom: canonicalInstant(record.effectiveFrom),
    reason: normalizedText(record.reason, 500),
  };
}

export function parseCampusOrganizerRevokeInput(
  value: unknown,
): CampusOrganizerRevokeInput {
  const record = exactRecord(value, [
    "grantId",
    "revision",
    "reason",
  ]);
  return {
    grantId: canonicalUuid(record.grantId),
    revision: positiveInteger(record.revision),
    reason: normalizedText(record.reason, 500),
  };
}

export function parseCampusOrganizerGrantProjection(
  value: unknown,
): CampusOrganizerGrantProjection {
  const record = exactRecord(value, [
    "grantId",
    "school",
    "revision",
    "effectiveFrom",
    "effectiveTo",
  ]);
  const school = exactRecord(record.school, ["id", "name"]);
  return {
    grantId: canonicalUuid(record.grantId),
    school: {
      id: canonicalUuid(school.id),
      name: responseText(school.name, 1, 200),
    },
    revision: positiveInteger(record.revision),
    effectiveFrom: canonicalInstant(record.effectiveFrom),
    effectiveTo: nullableInstant(record.effectiveTo),
  };
}

export function parseCampusOrganizerAdminView(
  value: unknown,
): CampusOrganizerAdminView {
  const record = exactRecord(value, [
    "studyBuddyUserId",
    "accountMasked",
    "userStatus",
    "state",
    "grant",
    "commissionAssignment",
  ]);
  const state = oneOf(record.state, CAMPUS_ORGANIZER_GRANT_STATES);
  const grant = record.grant === null ? null : parseAdminGrant(record.grant);
  if ((state === "NOT_GRANTED") !== (grant === null)) throw invalid();
  if (grant && state === "REVOKED" && grant.effectiveTo === null) throw invalid();
  if (grant && (state === "ACTIVE" || state === "SCHEDULED") && grant.effectiveTo !== null) {
    throw invalid();
  }
  return {
    studyBuddyUserId: canonicalUuid(record.studyBuddyUserId),
    accountMasked: responseText(record.accountMasked, 1, 254),
    userStatus: oneOf(record.userStatus, ["ACTIVE", "SUSPENDED"] as const),
    state,
    grant,
    commissionAssignment:
      record.commissionAssignment === null
        ? null
        : parseCommissionAssignment(record.commissionAssignment),
  };
}

export function parseCampusOrganizerListQuery(
  value: unknown,
): CampusOrganizerListQuery {
  const record = allowedRecord(value, ["state", "schoolId", "cursor", "limit"]);
  const result: {
    state?: CampusOrganizerGrantState;
    schoolId?: string;
    cursor?: string;
    limit: number;
  } = {
    limit: record.limit === undefined ? 50 : canonicalLimit(record.limit),
  };
  if (record.state !== undefined) {
    result.state = oneOf(record.state, CAMPUS_ORGANIZER_GRANT_STATES);
  }
  if (record.schoolId !== undefined) result.schoolId = canonicalUuid(record.schoolId);
  if (record.cursor !== undefined) result.cursor = canonicalUuid(record.cursor);
  return result;
}

export function parseCampusOrganizerListPage(
  value: unknown,
): CampusOrganizerListPage {
  const record = exactRecord(value, ["items", "nextCursor"]);
  if (!Array.isArray(record.items) || record.items.length > 100) throw invalid();
  const items = record.items.map(parseCampusOrganizerAdminView);
  unique(items.map((item) => item.studyBuddyUserId));
  unique(items.flatMap((item) => (item.grant ? [item.grant.grantId] : [])));
  return {
    items,
    nextCursor: record.nextCursor === null ? null : canonicalUuid(record.nextCursor),
  };
}

export function parseCampusPlaybookDocument(
  value: unknown,
): CampusPlaybookDocument {
  const record = exactRecord(value, ["version", "access", "groups", "entries"]);
  if (!Array.isArray(record.groups) || record.groups.length === 0 || record.groups.length > 50) {
    throw invalid();
  }
  if (!Array.isArray(record.entries) || record.entries.length === 0 || record.entries.length > 200) {
    throw invalid();
  }
  const groups = record.groups.map(parseDocumentGroup);
  const entries = record.entries.map(parseDocumentEntry);
  unique(groups.map((group) => group.id));
  unique(entries.map((entry) => entry.id));
  const groupIds = new Set(groups.map((group) => group.id));
  if (entries.some((entry) => !groupIds.has(entry.groupId))) throw invalid();
  return {
    version: responseText(record.version, 1, 40),
    access: parseCampusOrganizerGrantProjection(record.access),
    groups,
    entries,
  };
}

export function parseCampusPlaybookAssetMetadata(
  value: unknown,
): CampusPlaybookAssetMetadata {
  const record = exactRecord(value, [
    "assetId",
    "url",
    "mediaType",
    "contentLength",
    "sha256",
  ]);
  const assetId = identifier(record.assetId);
  if (record.url !== `/v1/campus-playbook/assets/${assetId}`) throw invalid();
  if (record.mediaType !== "image/png") throw invalid();
  const contentLength = positiveInteger(record.contentLength);
  if (contentLength > 20 * 1024 * 1024) throw invalid();
  if (typeof record.sha256 !== "string" || !SHA256_PATTERN.test(record.sha256)) {
    throw invalid();
  }
  return {
    assetId,
    url: record.url,
    mediaType: record.mediaType,
    contentLength,
    sha256: record.sha256,
  };
}

function parseAdminGrant(value: unknown): CampusOrganizerAdminGrant {
  const record = exactRecord(value, [
    "grantId",
    "school",
    "revision",
    "effectiveFrom",
    "effectiveTo",
    "grantReason",
    "revokeReason",
    "grantedByAdminUserId",
    "revokedByAdminUserId",
    "createdAt",
    "updatedAt",
  ]);
  const projection = parseCampusOrganizerGrantProjection({
    grantId: record.grantId,
    school: record.school,
    revision: record.revision,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
  });
  const revokeReason = nullableResponseText(record.revokeReason, 500);
  const revokedByAdminUserId =
    record.revokedByAdminUserId === null
      ? null
      : canonicalUuid(record.revokedByAdminUserId);
  if ((projection.effectiveTo === null) !== (revokeReason === null)) throw invalid();
  if ((projection.effectiveTo === null) !== (revokedByAdminUserId === null)) throw invalid();
  return {
    ...projection,
    grantReason: responseText(record.grantReason, 1, 500),
    revokeReason,
    grantedByAdminUserId: canonicalUuid(record.grantedByAdminUserId),
    revokedByAdminUserId,
    createdAt: canonicalInstant(record.createdAt),
    updatedAt: canonicalInstant(record.updatedAt),
  };
}

function parseCommissionAssignment(
  value: unknown,
): CampusOrganizerCommissionAssignmentSummary {
  const record = exactRecord(value, [
    "id",
    "schoolId",
    "status",
    "effectiveFrom",
    "effectiveTo",
  ]);
  const status = oneOf(record.status, ["ACTIVE", "ENDED"] as const);
  const effectiveTo = nullableInstant(record.effectiveTo);
  if ((status === "ACTIVE") !== (effectiveTo === null)) throw invalid();
  return {
    id: canonicalUuid(record.id),
    schoolId: canonicalUuid(record.schoolId),
    status,
    effectiveFrom: canonicalInstant(record.effectiveFrom),
    effectiveTo,
  };
}

function parseDocumentGroup(value: unknown): CampusPlaybookDocumentGroup {
  const record = exactRecord(value, ["id", "title"]);
  return {
    id: identifier(record.id),
    title: responseText(record.title, 1, 200),
  };
}

function parseDocumentEntry(value: unknown): CampusPlaybookDocumentEntry {
  const record = allowedRecord(value, [
    "id",
    "groupId",
    "navTitle",
    "eyebrow",
    "summary",
    "status",
    "sections",
  ]);
  required(record, ["id", "groupId", "navTitle", "eyebrow", "summary", "sections"]);
  if (!Array.isArray(record.sections) || record.sections.length === 0 || record.sections.length > 200) {
    throw invalid();
  }
  const sections = record.sections.map(parseDocumentSection);
  unique(sections.map((section) => section.id));
  return {
    id: identifier(record.id),
    groupId: identifier(record.groupId),
    navTitle: responseText(record.navTitle, 1, 200),
    eyebrow: responseText(record.eyebrow, 1, 200),
    summary: responseText(record.summary, 1, 4_000),
    ...(record.status === undefined
      ? {}
      : { status: responseText(record.status, 1, 200) }),
    sections,
  };
}

function parseDocumentSection(value: unknown): CampusPlaybookDocumentSection {
  const record = allowedRecord(value, [
    "id",
    "title",
    "prompt",
    "body",
    "items",
    "ordered",
    "tone",
    "links",
    "media",
    "faqs",
  ]);
  required(record, ["id", "title"]);
  const section: {
    id: string;
    title: string;
    prompt?: string;
    body?: string;
    items?: readonly string[];
    ordered?: boolean;
    tone?: "support" | "note";
    links?: readonly Readonly<{ label: string; href: string }>[];
    media?: readonly CampusPlaybookDocumentMedia[];
    faqs?: readonly Readonly<{ category: string; question: string; answer: string }>[];
  } = {
    id: identifier(record.id),
    title: responseText(record.title, 1, 200),
  };
  if (record.body !== undefined) section.body = responseText(record.body, 1, 20_000);
  if (record.prompt !== undefined) section.prompt = responseText(record.prompt, 1, 20_000);
  if (record.items !== undefined) {
    if (!Array.isArray(record.items) || record.items.length === 0 || record.items.length > 200) {
      throw invalid();
    }
    section.items = record.items.map((item) => responseText(item, 1, 4_000));
  }
  if (record.ordered !== undefined) {
    if (typeof record.ordered !== "boolean") throw invalid();
    section.ordered = record.ordered;
  }
  if (record.tone !== undefined) section.tone = oneOf(record.tone, ["support", "note"] as const);
  if (record.links !== undefined) section.links = parseLinks(record.links);
  if (record.media !== undefined) section.media = parseMediaList(record.media);
  if (record.faqs !== undefined) section.faqs = parseFaqs(record.faqs);
  if (section.body === undefined && section.prompt === undefined && section.items === undefined && section.media === undefined && section.faqs === undefined) {
    throw invalid();
  }
  return section;
}

function parseLinks(value: unknown): readonly Readonly<{ label: string; href: string }>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw invalid();
  return value.map((item) => {
    const record = exactRecord(item, ["label", "href"]);
    if (typeof record.href !== "string" || record.href.length > 2_000) throw invalid();
    let url: { protocol: string; hostname: string };
    try {
      const URLConstructor = (
        globalThis as typeof globalThis & {
          URL: new (input: string) => { protocol: string; hostname: string };
        }
      ).URL;
      url = new URLConstructor(record.href);
    } catch {
      throw invalid();
    }
    if (url.protocol !== "https:" || !url.hostname) throw invalid();
    return {
      label: responseText(record.label, 1, 200),
      href: record.href,
    };
  });
}

function parseMediaList(value: unknown): readonly CampusPlaybookDocumentMedia[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw invalid();
  const media = value.map((item) => {
    const record = exactRecord(item, [
      "id",
      "title",
      "assetId",
      "alt",
      "scene",
      "size",
      "version",
      "updatedAt",
      "source",
    ]);
    return {
      id: displayIdentifier(record.id),
      title: responseText(record.title, 1, 200),
      assetId: identifier(record.assetId),
      alt: responseText(record.alt, 1, 500),
      scene: responseText(record.scene, 1, 500),
      size: responseText(record.size, 1, 100),
      version: responseText(record.version, 1, 100),
      updatedAt: calendarDate(record.updatedAt),
      source: responseText(record.source, 1, 200),
    };
  });
  unique(media.map((item) => item.id));
  unique(media.map((item) => item.assetId));
  return media;
}

function parseFaqs(
  value: unknown,
): readonly Readonly<{ category: string; question: string; answer: string }>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) throw invalid();
  return value.map((item) => {
    const record = exactRecord(item, ["category", "question", "answer"]);
    return {
      category: responseText(record.category, 1, 200),
      question: responseText(record.question, 1, 1_000),
      answer: responseText(record.answer, 1, 4_000),
    };
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const record = plainRecord(value);
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw invalid();
  }
  return record;
}

function allowedRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const record = plainRecord(value);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw invalid();
  }
  return record;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalid();
  }
  return value as Record<string, unknown>;
}

function required(record: Record<string, unknown>, keys: readonly string[]): void {
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) throw invalid();
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

function nullableInstant(value: unknown): string | null {
  return value === null ? null : canonicalInstant(value);
}

function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid();
  return value;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw invalid();
  return value as number;
}

function canonicalLimit(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw invalid();
    return value;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]{0,2}$/u.test(value)) throw invalid();
  const result = Number(value);
  if (result > 100) throw invalid();
  return result;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length > 80 || !IDENTIFIER_PATTERN.test(value)) {
    throw invalid();
  }
  return value;
}

function displayIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !DISPLAY_IDENTIFIER_PATTERN.test(value)
  ) {
    throw invalid();
  }
  return value;
}

function normalizedText(value: unknown, maximumBytes: number): string {
  if (typeof value !== "string") throw invalid();
  const result = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!result || utf8ByteLength(result, maximumBytes + 1) > maximumBytes) throw invalid();
  return result;
}

function responseText(value: unknown, minimum: number, maximumBytes: number): string {
  if (typeof value !== "string" || value.length < minimum) throw invalid();
  if (value.trim() !== value) throw invalid();
  if (utf8ByteLength(value, maximumBytes + 1) > maximumBytes) throw invalid();
  return value;
}

function nullableResponseText(value: unknown, maximumBytes: number): string | null {
  return value === null ? null : responseText(value, 1, maximumBytes);
}

function utf8ByteLength(value: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes >= stopAfter) return bytes;
  }
  return bytes;
}

function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw invalid();
  return value as T[number];
}

function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw invalid();
}

function invalid(): TypeError {
  return new TypeError("CAMPUS_ORGANIZER_ACCESS_INVALID");
}
