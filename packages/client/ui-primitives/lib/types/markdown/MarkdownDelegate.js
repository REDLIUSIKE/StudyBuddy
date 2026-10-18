import { jsx as _jsx } from "react/jsx-runtime";
/** Consumer-owned navigation for Markdown links. */
import { createContext, useContext, useMemo } from 'react';
const MarkdownDelegateContext = createContext({});
/**
 * Scope Markdown navigation without threading callbacks through renderers.
 * Nested providers replace the enclosing capabilities. Handler changes reach cached links.
 * @param props - Child tree and its file and HTTP(S) link handlers.
 * @returns the scoped child tree.
 */
export function MarkdownDelegateProvider({ children, openExternalLink, openFile, fileImages, }) {
    const delegate = useMemo(() => ({ openExternalLink, openFile, fileImages }), [openExternalLink, openFile, fileImages]);
    return (_jsx(MarkdownDelegateContext.Provider, { value: delegate, children: children }));
}
/**
 * Read the nearest Markdown navigation capabilities.
 * @returns Owner callbacks, or an empty delegate outside a provider.
 */
export function useMarkdownDelegate() {
    return useContext(MarkdownDelegateContext);
}
//# sourceMappingURL=MarkdownDelegate.js.map