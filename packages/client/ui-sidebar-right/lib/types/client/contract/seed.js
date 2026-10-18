/**
 * Resolve the default page from the registered entry count.
 * @param tabs - current tab registry.
 * @returns the sole entry, or the guide when there are zero or multiple entries.
 */
export function defaultSeed(tabs) {
    const [only, ...others] = tabs.guide();
    const single = only !== undefined && others.length === 0;
    const kind = single ? only.kind : GUIDE_KIND;
    const definition = tabs.get(kind);
    if (definition === undefined)
        throw new Error(`sidebarRight: default tab kind "${kind}" is not registered`);
    return { kind, title: definition.title(pageAddress(kind)) };
}
/** The guide tab's kind. */
export const GUIDE_KIND = 'guide';
/**
 * The address a page tab is recorded under: `sidebar://<kind>`. The scheme is
 * this package's bookkeeping for `openTab`, spelled here and nowhere else; a
 * caller names the kind and never sees or composes the address.
 * @param kind - the page type's kind.
 * @returns the page's address.
 */
export function pageAddress(kind) {
    return `sidebar://${kind}`;
}
//# sourceMappingURL=seed.js.map