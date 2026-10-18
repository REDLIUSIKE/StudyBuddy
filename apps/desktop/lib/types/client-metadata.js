/**
 * Read the client build version inlined by the Desktop build.
 * @returns the version embedded in this application build.
 * @throws Error when the build carries no client version, instead of reporting a guessed one.
 */
export function desktopClientVersion() {
    const version = process.env.DSH_CLIENT_VERSION;
    if (version === undefined || version === '') {
        throw new Error('desktop account: this application build carries no DSH_CLIENT_VERSION');
    }
    return version;
}
/**
 * Sample the Desktop client identity for one Platform request.
 * @param locale - current resolved Desktop language.
 * @returns this call's build version, the raw active language, and the UTC offset in whole seconds east.
 */
export function desktopClientMetadata(locale) {
    return {
        version: desktopClientVersion(),
        locale,
        // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    };
}
//# sourceMappingURL=client-metadata.js.map