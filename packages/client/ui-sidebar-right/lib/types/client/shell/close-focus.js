/** Focus continuity after page operations replace docked or floating pane elements. */
import { flushSync } from 'react-dom';
import { visibleSidebarPane } from "../focus.js";
/**
 * Focus the page selected by an open or split after its DOM has committed.
 * @param document - product document owning the input focus.
 * @param sessionId - Session whose page is opening.
 * @param open - synchronous operation returning its selected pane, or undefined when unchanged.
 */
export function openWithPaneFocus(document, sessionId, open) {
    let paneId;
    flushSync(() => { paneId = open(); });
    if (paneId !== undefined)
        visibleSidebarPane(document, sessionId, paneId)?.focus({ preventScroll: true });
}
/**
 * Commit a focused page's removal before focusing a surviving visible pane.
 * @param document - product document owning the input focus.
 * @param sessionId - Session whose page is closing.
 * @param paneId - pane whose page is closing; preferred if it survives.
 * @param close - synchronous cleanup and layout removal; errors preserve focus.
 */
export function closeWithPaneFocus(document, sessionId, paneId, close) {
    const before = document.activeElement;
    const owner = before?.closest('[data-sidebar-right-session]');
    const source = before?.closest('[data-dockkit-pane], [data-dockkit-float]');
    const retain = owner?.dataset.sidebarRightSession === sessionId
        && (source?.dataset.dockkitPane ?? source?.dataset.dockkitFloat) === paneId;
    flushSync(close);
    if (!retain || (document.activeElement !== document.body && document.activeElement !== before))
        return;
    visibleSidebarPane(document, sessionId, paneId)?.focus({ preventScroll: true });
}
//# sourceMappingURL=close-focus.js.map