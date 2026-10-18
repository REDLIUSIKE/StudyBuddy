/**
 * Build the request identity for one account call.
 * @param locale - active UI language; the Host reduces it to the Platform wire locale.
 * @param version - client build version inlined by the bundle.
 * @returns the metadata the account Remote methods carry.
 * @throws Error when the build carries no version, instead of reporting an empty one.
 */
export function accountClientMetadata(locale, version) {
    if (version === undefined || version === '')
        throw new Error('account: this client build carries no DSH_CLIENT_VERSION');
    return {
        version,
        locale,
        // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    };
}
//# sourceMappingURL=client-metadata.js.map