/** Shared provider display order for the composer and command model pickers. */
/**
 * Put StudyBuddy platform models first and owned personal routes last.
 * Account and official providers retain their priority among the remaining groups.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders(groups) {
    return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id));
}
function providerRank(id) {
    if (id === 'studybuddy-platform')
        return 0;
    if (id === 'deepseek-account')
        return 1;
    if (id === 'deepseek-official')
        return 2;
    if (isPersonalModelProvider(id))
        return 4;
    return 3;
}
/** Identify native personal routes for display grouping only.
 * @param id - Unchanged provider route from the Host catalog.
 * @returns Whether this route belongs in the personal models section. */
export function isPersonalModelProvider(id) {
    return id.startsWith('builtin-') || id.startsWith('local-');
}
//# sourceMappingURL=provider-order.js.map