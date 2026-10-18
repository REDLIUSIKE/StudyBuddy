/**
 * Explain a failed plan read in the current locale.
 * @param t - Plan namespace translator.
 * @param failure - Failure reported by the resource provider.
 * @returns localized plan copy, or the external failure's diagnostic.
 */
export function planFailureLine(t, failure) {
    switch (failure.code) {
        case 'plan/invalid-address': return t('preview.invalidAddress');
        case 'plan/unavailable': return t('preview.historyUnavailable');
        case 'plan/not-found': return t('preview.notFound');
        // Transport failures, including plan/read-failed, retain the carrier's diagnostic.
        default: return failure.message;
    }
}
//# sourceMappingURL=failure-line.js.map