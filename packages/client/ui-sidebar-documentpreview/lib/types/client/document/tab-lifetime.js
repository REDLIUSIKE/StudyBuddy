/**
 * Release retained view state on tab closure or plugin disposal.
 * @param ctx - owning preview plugin context.
 * @returns a callback accepting the tab, its lifetime signal, and its store's forget action; repeated holds share one listener.
 */
export function retainDocumentTabs(ctx) {
    const retained = new Map();
    ctx.effect(() => () => { for (const forget of retained.values())
        forget(); });
    return (tabId, signal, forgetTab) => {
        if (signal.aborted) {
            forgetTab(tabId);
            return;
        }
        if (retained.has(signal))
            return;
        const forget = () => {
            signal.removeEventListener('abort', forget);
            retained.delete(signal);
            forgetTab(tabId);
        };
        retained.set(signal, forget);
        signal.addEventListener('abort', forget, { once: true });
    };
}
//# sourceMappingURL=tab-lifetime.js.map