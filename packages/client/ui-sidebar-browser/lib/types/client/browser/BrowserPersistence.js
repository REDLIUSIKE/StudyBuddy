/**
 * Read the selected address from a saved navigation record.
 * @param state - saved navigation.
 * @returns its last selected address, if any.
 */
export function currentBrowserTarget(state) {
    return state === undefined || state.index < 0 ? undefined : state.entries[state.index];
}
/**
 * Checkpoint an observed address without serializing native history.
 * @param target - current address.
 * @param revision - navigation generation.
 * @returns an address-only checkpoint.
 */
export function browserAddressCheckpoint(target, revision) {
    return { entries: [target], index: 0, request: { target, revision },
        navigation: { status: 'known', revision }, failure: undefined };
}
//# sourceMappingURL=BrowserPersistence.js.map