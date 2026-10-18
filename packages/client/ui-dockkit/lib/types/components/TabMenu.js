import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The per-tab context menu, opened by a secondary press on the chip. It carries
 * the close gesture and whatever the embedder appends; the copy and float
 * gestures have no menu item — copying is an embedder API, floating is a drag
 * released clear of the surface. A menu that would hold no item at all renders
 * no popup, so a secondary press on a chip with nothing to offer shows nothing.
 * Presentational — it renders what its props supply and dismisses itself on
 * outside presses or an unmodified Escape, returning menu focus to its tab.
 *
 * It renders in a portal, positioned against the control that opened it. The tab
 * strip clips its overflow on purpose (so it never becomes a scroll container
 * that claims a drag), and a menu drawn inside the strip would be clipped with
 * it; a portal puts it above every clipping ancestor. React still bubbles the
 * portal's synthetic events through the strip, which is why the press guards
 * below remain necessary.
 */
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusWithoutRing, modalSelector, observeComposition } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './dockkit.module.css';
/** Gap between the opening control and the menu, and the viewport margin kept clear. */
const MENU_GAP = 4;
/** Where the menu sits, or `undefined` before the first measurement. */
function placeMenu(anchor, menu) {
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    // Below the control, aligned to its left edge; flipped to its right edge when
    // that would run off the viewport, as it does for the last tab in a column
    // against the window's right side.
    const left = rect.left + width + MENU_GAP > window.innerWidth
        ? Math.max(MENU_GAP, rect.right - width)
        : rect.left;
    return { top: rect.bottom + MENU_GAP, left };
}
/** The actions menu body, anchored to the control that opened it. */
export function TabMenu({ labels, anchor, onClose, onDismiss, extras }) {
    const self = useRef(null);
    const [position, setPosition] = useState(undefined);
    const hasItems = onClose !== undefined || Children.toArray(extras).some(item => item !== '');
    useLayoutEffect(() => {
        if (self.current === null)
            return;
        setPosition(placeMenu(anchor, self.current));
    }, [anchor, hasItems]);
    useEffect(() => {
        const menu = self.current;
        /* v8 ignore next -- the ref is attached by effect time: the menu renders unconditionally. */
        if (menu === null)
            return undefined;
        const document = menu.ownerDocument;
        const composition = observeComposition(document);
        const onKeyDown = (event) => {
            if (composition.guards(event) || event.defaultPrevented || event.key !== 'Escape'
                || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
                return;
            const top = [...document.querySelectorAll(modalSelector)].at(-1);
            if (top !== menu)
                return;
            event.preventDefault();
            if (event.repeat)
                return;
            const restoreFocus = menu.contains(document.activeElement);
            onDismiss();
            if (restoreFocus)
                focusWithoutRing(anchor);
        };
        document.addEventListener('keydown', onKeyDown, true);
        // A press anywhere but inside the menu dismisses it; one with no element
        // target (dispatched to the window itself) counts as outside.
        const onPointerDown = (event) => {
            if (event.target instanceof Node && menu.contains(event.target))
                return;
            onDismiss();
        };
        // Capture phase: a press on a tab chip starts a drag on its own handler,
        // so the menu must be gone before that handler runs.
        window.addEventListener('pointerdown', onPointerDown, true);
        return () => {
            composition.dispose();
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('pointerdown', onPointerDown, true);
        };
    }, [anchor, onDismiss, hasItems]);
    if (!hasItems)
        return null;
    return createPortal(_jsxs(MenuSurface, { className: css.menu, ref: self, role: "menu", "data-dockkit-tab-menu": true, 
        // Unplaced for one layout pass: measured, then positioned.
        style: position ?? { visibility: 'hidden', top: 0, left: 0 }, 
        // React bubbles a portal's events to its tab chip, so both halves of a
        // press must stop here: the press would otherwise start a tab drag and
        // capture the pointer, which retargets the release and swallows this
        // item's click; the click would otherwise also focus a tab the item may
        // have removed.
        onPointerDown: (event) => { event.stopPropagation(); }, onClick: (event) => { event.stopPropagation(); }, children: [onClose !== undefined && (_jsx("button", { type: "button", role: "menuitem", className: css.menuItem, "data-dockkit-menu-close": true, onClick: onClose, children: labels.closeTab })), extras] }), document.body);
}
//# sourceMappingURL=TabMenu.js.map