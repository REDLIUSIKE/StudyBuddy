import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
/** The tab kind this package owns. */
export const TEXTPREVIEW_KIND = 'text';
/** This implementation's identity in the tab system: the key its body registers under. */
export const TEXTPREVIEW_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview';
/**
 * The tab title for one `file:` address: its decoded basename.
 *
 * The whole address stays the content identity, so two files with one name in
 * different directories are two tabs; only the chip text is shortened. Decoding
 * is per segment, matching how the address was built, so a name carrying `#`,
 * `?`, or a space reads as itself.
 * @param address - a `file:`-shaped address.
 * @returns the decoded last path segment, or the address itself when it has none.
 */
export function basenameOf(address) {
    const name = address.slice(address.lastIndexOf('/') + 1);
    if (name === '')
        return address;
    try {
        return decodeURIComponent(name);
    }
    catch {
        // A malformed percent sequence is still a name; showing it raw beats refusing the address.
        return name;
    }
}
/**
 * The text type's registry definition.
 * @returns the definition to register.
 */
export function textDefinition() {
    return {
        id: TEXTPREVIEW_ID,
        kind: TEXTPREVIEW_KIND,
        patterns: ['dsh-resource://file/**'],
        priority: 'fallback',
        canOpen: address => parseFileAddress(address)?.scope === 'session',
        title: basenameOf,
    };
}
//# sourceMappingURL=definition.js.map