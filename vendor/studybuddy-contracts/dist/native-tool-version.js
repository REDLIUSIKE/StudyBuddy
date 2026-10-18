import semver from 'semver';
/** Syntax only. Eligibility remains the exact manually reviewed adapter rule. */
export function parseExactNativeToolVersion(value) {
    if (typeof value !== 'string' || value.length > 128)
        throw new TypeError('NATIVE_TOOL_VERSION_INVALID');
    const parsed = semver.parse(value);
    if (parsed === null || parsed.raw !== value || parsed.version !== value.split('+')[0])
        throw new TypeError('NATIVE_TOOL_VERSION_INVALID');
    return { version: value, prerelease: parsed.prerelease.length > 0 };
}
export function compareExactNativeToolVersions(a, b) {
    parseExactNativeToolVersion(a);
    parseExactNativeToolVersion(b);
    return semver.compare(a, b);
}
//# sourceMappingURL=native-tool-version.js.map