/**
 * Navigation parameters, typed by what is being opened.
 *
 * Two declaration-merged maps. `SidebarRightResourceParamsMap` is keyed by
 * resource type — the segment after `dsh-resource://` — and filled by the
 * package that owns that type (the `file` provider adds `file: { line?: number }`);
 * `SidebarRightTabParamsMap` is keyed by tab kind and filled by a page type that
 * takes parameters (the Browser page adds `browser: { url?: string }`). Values are JSON-shaped by
 * convention; nothing validates them at run time, because caller and body meet
 * at a typed same-process boundary. A body narrows `navigation.params` by the
 * scheme and type of `navigation.address`.
 *
 * The unions below are spelled as indexed accesses over a record rather than as
 * `A | B`: in a program where no package has augmented a map, both sides of such
 * a union resolve to `undefined`, which the type-aware lint reads as a duplicated
 * constituent. The indexed access names the same union without the pair.
 */
export {};
//# sourceMappingURL=params.js.map