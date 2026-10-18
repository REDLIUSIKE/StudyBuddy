/**
 * Read pane and tab identity from live owner markup, including an embedding iframe.
 * @param element - focused or pointer-activated element in the product document.
 * @param sessionId - Session currently drawn by the sidebar.
 * @param layout - current committed layout for that Session.
 * @param occurrence - current occurrence lookup for a committed tab.
 * @returns the captured page, or undefined for stale, hidden, or outside elements.
 */
export function sidebarTargetFromElement(element, sessionId, layout, occurrence) {
    if (element === null || !element.isConnected)
        return undefined;
    const owner = element.closest('[data-sidebar-right-session]');
    if (owner?.dataset.sidebarRightSession !== sessionId)
        return undefined;
    const container = element.closest('[data-dockkit-pane], [data-dockkit-float]');
    const paneId = (container?.dataset.dockkitPane ?? container?.dataset.dockkitFloat);
    if (paneId === undefined || container?.closest('[hidden], [aria-hidden="true"]') !== null)
        return undefined;
    const pane = layout.nodes[paneId];
    if (pane?.kind !== 'pane' || (pane.host === 'dock' && !layout.expanded))
        return undefined;
    const tabElement = element.closest('[data-dockkit-tab], [data-sidebar-right-tab]');
    const tabId = (tabElement?.dataset.dockkitTab ?? tabElement?.dataset.sidebarRightTab ?? pane.activeTabId);
    if (tabId !== undefined && (!pane.tabs.includes(tabId) || layout.tabs[tabId] === undefined))
        return undefined;
    const held = tabId === undefined ? undefined : occurrence(tabId);
    const marker = element.closest('[data-sidebar-right-occurrence]')
        ?? tabElement?.querySelector('[data-sidebar-right-occurrence]');
    if (marker !== null && marker !== undefined && marker.dataset.sidebarRightOccurrence !== held?.id)
        return undefined;
    return { sessionId, paneId, host: pane.host, tabId, occurrence: held,
        navigationRevision: held?.navigation.getSnapshot().revision };
}
/**
 * Find a visible pane of one Session, preferring the requested pane over the active fallback.
 * @param document - product document containing docked and floating panes.
 * @param sessionId - Session whose panes may receive focus.
 * @param paneId - preferred pane before an operation changed the layout.
 * @returns a surviving visible pane, or undefined when the Session has none.
 */
export function visibleSidebarPane(document, sessionId, paneId) {
    const panes = [...document.querySelectorAll('[data-dockkit-pane], [data-dockkit-float]')]
        .filter((pane) => {
        const owner = pane.closest('[data-sidebar-right-session]');
        return owner?.dataset.sidebarRightSession === sessionId
            && pane.closest('[hidden], [aria-hidden="true"]') === null
            && (pane.hasAttribute('data-dockkit-float') || owner.hasAttribute('data-sidebar-right-open'));
    });
    return panes.find(pane => (pane.dataset.dockkitPane ?? pane.dataset.dockkitFloat) === paneId)
        ?? panes.find(pane => pane.hasAttribute('data-dockkit-pane-active') || pane.hasAttribute('data-dockkit-float-active')) ?? panes[0];
}
/**
 * Observe pane focus and retain it when its DOM node is replaced, preserving text selections.
 * @param document - product document whose sidebar owns the listener lifetime.
 * @returns disposer for every document/window listener.
 */
export function observeSidebarFocus(document) {
    let active = true;
    let focused;
    const removal = new MutationObserver(() => {
        if (focused === undefined || focused.element.isConnected)
            return;
        const previous = focused;
        focused = undefined;
        removal.disconnect();
        if (document.activeElement !== document.body)
            return;
        const moved = previous.occurrence === undefined ? undefined
            : [...document.querySelectorAll('[data-sidebar-right-occurrence]')]
                .find(marker => marker.dataset.sidebarRightOccurrence === previous.occurrence)
                ?.closest('[data-dockkit-pane], [data-dockkit-float]');
        const paneId = (moved?.dataset.dockkitPane ?? moved?.dataset.dockkitFloat);
        visibleSidebarPane(document, previous.sessionId, paneId ?? previous.paneId)?.focus({ preventScroll: true });
    });
    const capture = () => {
        removal.disconnect();
        focused = undefined;
        const element = document.activeElement;
        const pane = element?.closest('[data-dockkit-pane], [data-dockkit-float]');
        if (element === null || pane === undefined || pane === null)
            return;
        const owner = pane.closest('[data-sidebar-right-session]');
        const sessionId = owner?.dataset.sidebarRightSession;
        const paneId = (pane.dataset.dockkitPane ?? pane.dataset.dockkitFloat);
        if (owner === null || sessionId === undefined || paneId === undefined)
            return;
        const tab = element.closest('[data-dockkit-tab]')
            ?? pane.querySelector('[role="tab"][aria-selected="true"], [data-dockkit-float-title]');
        const marker = element.closest('[data-sidebar-right-occurrence]')
            ?? tab?.querySelector('[data-sidebar-right-occurrence]');
        focused = { element, sessionId, paneId, occurrence: marker?.dataset.sidebarRightOccurrence };
        removal.observe(owner, { childList: true, subtree: true });
        // Observe removal of the whole Session seat as well as its tab bodies.
        if (owner.parentElement !== null)
            removal.observe(owner.parentElement, { childList: true });
    };
    const focusout = (event) => {
        if (event.relatedTarget === null && focused?.element.isConnected) {
            focused = undefined;
            removal.disconnect();
        }
    };
    const pointer = (event) => {
        const element = event.composedPath().find(value => value instanceof Element);
        if (!(element instanceof Element))
            return;
        const pane = element.closest('[data-sidebar-right-session] [data-dockkit-pane], [data-sidebar-right-session] [data-dockkit-float]');
        if (pane === null) {
            focused = undefined;
            removal.disconnect();
        }
        const control = element.closest('button, input, textarea, select, a, [contenteditable], [tabindex], iframe');
        if (pane !== null && (control === null || control === pane)) {
            pane.focus({ preventScroll: true });
        }
    };
    const blur = () => { queueMicrotask(() => { if (active)
        capture(); }); };
    document.addEventListener('focusin', capture);
    document.addEventListener('focusout', focusout);
    document.addEventListener('pointerdown', pointer, true);
    document.defaultView?.addEventListener('blur', blur);
    document.defaultView?.addEventListener('focus', capture);
    capture();
    return () => {
        active = false;
        removal.disconnect();
        document.removeEventListener('focusin', capture);
        document.removeEventListener('focusout', focusout);
        document.removeEventListener('pointerdown', pointer, true);
        document.defaultView?.removeEventListener('blur', blur);
        document.defaultView?.removeEventListener('focus', capture);
    };
}
//# sourceMappingURL=focus.js.map