import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Window-chrome controls for the fully hidden sidebar (frame shell.leading seat). */
import { IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './HeaderLeadingControls.module.css';
/**
 * Sidebar-open and New Session controls in the frame's window-chrome seat.
 * On macOS desktop a collapsed sidebar hides entirely (no rail), taking both
 * controls off screen; this occupant puts them back beside the traffic
 * lights. The frame mounts the seat only in that state and owns its
 * placement, so the occupant renders unconditionally.
 * @param props - Injected sidebar actions plus the sidebar locale seat.
 * @returns the two window-chrome controls.
 */
export function HeaderLeadingControls({ toggleSidebar, startSession, useShortcuts, renderSlot, t }) {
    const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'));
    const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'));
    return (_jsxs("div", { className: css.controls, children: [_jsx(Tooltip, { label: t('toggle.open'), shortcutKeys: shortcut?.keys, delayMs: 500, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('toggle.open'), "aria-keyshortcuts": shortcut?.aria, onClick: () => { toggleSidebar(); }, children: _jsx(IconPanelLeftOutlineRegular, { size: 16 }) }) }), renderSlot('shell.leading.action', {}), _jsx(Tooltip, { label: t('session.new.label'), shortcutKeys: newShortcut?.keys, delayMs: 500, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('session.new.label'), "aria-keyshortcuts": newShortcut?.aria, onClick: () => { startSession(); }, children: _jsx(IconNewChatOutlineRegular, { size: 16 }) }) })] }));
}
//# sourceMappingURL=HeaderLeadingControls.js.map