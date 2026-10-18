const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parseStartCampusOrganizerAssignment(value) {
    const record = exactRecord(value, ["schoolId", "organizerStudyBuddyUserId", "effectiveFrom", "reason"]);
    return {
        schoolId: canonicalUuid(record.schoolId),
        organizerStudyBuddyUserId: canonicalUuid(record.organizerStudyBuddyUserId),
        effectiveFrom: canonicalInstant(record.effectiveFrom),
        reason: boundedText(record.reason, 500),
    };
}
export function parseEndCampusOrganizerAssignment(value) {
    const record = exactRecord(value, ["effectiveTo", "reason"]);
    return {
        effectiveTo: canonicalInstant(record.effectiveTo),
        reason: boundedText(record.reason, 500),
    };
}
function exactRecord(value, keys) {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
        throw invalid();
    }
    const record = value;
    const actual = Reflect.ownKeys(record);
    if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)))
        throw invalid();
    return record;
}
function canonicalUuid(value) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value))
        throw invalid();
    return value;
}
function canonicalInstant(value) {
    if (typeof value !== "string")
        throw invalid();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
        throw invalid();
    return value;
}
function boundedText(value, maximumBytes) {
    if (typeof value !== "string")
        throw invalid();
    const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (normalized.length === 0 || utf8ByteLength(normalized, maximumBytes + 1) > maximumBytes)
        throw invalid();
    return normalized;
}
function utf8ByteLength(value, stopAfter) {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit <= 0x7f)
            bytes += 1;
        else if (codeUnit <= 0x7ff)
            bytes += 2;
        else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length &&
            value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
            bytes += 4;
            index += 1;
        }
        else
            bytes += 3;
        if (bytes >= stopAfter)
            return bytes;
    }
    return bytes;
}
function invalid() {
    return new TypeError("CAMPUS_ORGANIZER_INVALID");
}
//# sourceMappingURL=campus-organizers.js.map