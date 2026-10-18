/** Desktop transaction cleanup that unlinks directory links without visiting their targets. */
/**
 * Remove an owned directory and its contents, unlinking root and nested links.
 * Missing roots are ignored; existing roots must be directories or links.
 * @param path - Owned directory or link to remove; link targets are preserved.
 */
export declare function removeOwnedDirectory(path: string): void;
//# sourceMappingURL=owned-directory.d.ts.map