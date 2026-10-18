/** Shared provider display order for the composer and command model pickers. */
/**
 * Put StudyBuddy platform models first and owned personal routes last.
 * Account and official providers retain their priority among the remaining groups.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export declare function orderModelProviders<T extends {
    readonly id: string;
}>(groups: readonly T[]): T[];
/** Identify native personal routes for display grouping only.
 * @param id - Unchanged provider route from the Host catalog.
 * @returns Whether this route belongs in the personal models section. */
export declare function isPersonalModelProvider(id: string): boolean;
//# sourceMappingURL=provider-order.d.ts.map