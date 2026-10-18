export function parseLogoutAuthorityReceipt(value) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw invalidLogoutAuthorityReceipt();
    }
    const record = value;
    const keys = Reflect.ownKeys(record);
    if (keys.length !== 2 ||
        !keys.includes("status") ||
        !keys.includes("authorityGeneration") ||
        record.status !== "revoked" ||
        !Number.isSafeInteger(record.authorityGeneration) ||
        record.authorityGeneration <= 0) {
        throw invalidLogoutAuthorityReceipt();
    }
    return {
        status: "revoked",
        authorityGeneration: record.authorityGeneration,
    };
}
function invalidLogoutAuthorityReceipt() {
    return new TypeError("Invalid logout authority receipt");
}
export function parseNativeLogoutAuthorityReceiptV2(value) {
    const keys = ['schemaVersion', 'status', 'accountOwner', 'deviceId', 'authorityGeneration'];
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
        throw invalidLogoutAuthorityReceipt();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value'))) {
        throw invalidLogoutAuthorityReceipt();
    }
    const record = value;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (record.schemaVersion !== 2 || record.status !== 'revoked' ||
        typeof record.accountOwner !== 'string' || !uuid.test(record.accountOwner) ||
        typeof record.deviceId !== 'string' || !uuid.test(record.deviceId) ||
        !Number.isSafeInteger(record.authorityGeneration) || record.authorityGeneration <= 0) {
        throw invalidLogoutAuthorityReceipt();
    }
    return { schemaVersion: 2, status: 'revoked', accountOwner: record.accountOwner, deviceId: record.deviceId, authorityGeneration: record.authorityGeneration };
}
//# sourceMappingURL=auth-lifecycle.js.map