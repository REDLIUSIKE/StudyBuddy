const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GRADE_PATTERN = /^(19|20)\d{2}级$/u;
export function parseAcademicProfileLockRequest(value) {
    const error = "ACADEMIC_PROFILE_INVALID";
    const record = exactRecord(value, ["realName", "school", "college", "program", "grade"], error);
    return parseAcademicIdentityFields(record, error);
}
export function parseAcademicDirectoryUpdateRequest(value) {
    const error = "ACADEMIC_DIRECTORY_UPDATE_INVALID";
    const record = exactRecord(value, ["college", "program", "expectedRevision"], error);
    return {
        college: parseEntitySelection(record.college, error),
        program: parseProgramSelection(record.program, error),
        expectedRevision: positiveSafeInteger(record.expectedRevision, error),
    };
}
export function parseAcademicProfileCorrectionRequest(value) {
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
function parseAcademicIdentityFields(record, error) {
    return {
        realName: boundedText(record.realName, 120, error),
        school: parseEntitySelection(record.school, error),
        college: parseEntitySelection(record.college, error),
        program: parseProgramSelection(record.program, error),
        grade: enrollmentGrade(record.grade, error),
    };
}
function parseEntitySelection(value, error) {
    const record = plainRecord(value, error);
    const keys = Reflect.ownKeys(record);
    if (keys.length !== 1)
        throw new TypeError(error);
    if (keys[0] === "id")
        return { id: canonicalUuid(record.id, error) };
    if (keys[0] === "candidateName") {
        return { candidateName: boundedText(record.candidateName, 160, error) };
    }
    throw new TypeError(error);
}
function parseProgramSelection(value, error) {
    const record = plainRecord(value, error);
    const keys = Reflect.ownKeys(record);
    if (keys.length === 1 && keys[0] === "id") {
        return { id: canonicalUuid(record.id, error) };
    }
    if (keys.length < 1 ||
        keys.length > 2 ||
        !keys.includes("candidateName") ||
        keys.some((key) => key !== "candidateName" && key !== "majorCatalogId")) {
        throw new TypeError(error);
    }
    const candidateName = boundedText(record.candidateName, 160, error);
    return record.majorCatalogId === undefined
        ? { candidateName }
        : { candidateName, majorCatalogId: canonicalUuid(record.majorCatalogId, error) };
}
function enrollmentGrade(value, error) {
    const grade = boundedText(value, 32, error);
    if (!GRADE_PATTERN.test(grade))
        throw new TypeError(error);
    return grade;
}
function positiveSafeInteger(value, error) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(error);
    }
    return value;
}
function boundedText(value, maximumBytes, error) {
    if (typeof value !== "string")
        throw new TypeError(error);
    const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const length = utf8ByteLength(normalized, maximumBytes + 1);
    if (length < 1 || length > maximumBytes)
        throw new TypeError(error);
    return normalized;
}
function utf8ByteLength(value, stopAfter) {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit <= 0x7f) {
            bytes += 1;
        }
        else if (codeUnit <= 0x7ff) {
            bytes += 2;
        }
        else if (codeUnit >= 0xd800 &&
            codeUnit <= 0xdbff &&
            index + 1 < value.length &&
            value.charCodeAt(index + 1) >= 0xdc00 &&
            value.charCodeAt(index + 1) <= 0xdfff) {
            bytes += 4;
            index += 1;
        }
        else {
            bytes += 3;
        }
        if (bytes >= stopAfter)
            return bytes;
    }
    return bytes;
}
function canonicalUuid(value, error) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
        throw new TypeError(error);
    }
    return value;
}
function plainRecord(value, error) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(error);
    }
    return value;
}
function exactRecord(value, keys, error) {
    const record = plainRecord(value, error);
    const actual = Reflect.ownKeys(record);
    if (actual.length !== keys.length ||
        actual.some((key) => typeof key !== "string" || !keys.includes(key))) {
        throw new TypeError(error);
    }
    return record;
}
//# sourceMappingURL=academic.js.map