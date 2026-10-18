/**
 * Create idle navigation state without a page target.
 * @returns state before any page has been requested.
 */
export function emptyBrowserFrame() {
    return { target: undefined, address: 'empty', loading: false, canGoBack: false, canGoForward: false,
        error: undefined, sandboxEnabled: undefined };
}
//# sourceMappingURL=BrowserFrame.js.map