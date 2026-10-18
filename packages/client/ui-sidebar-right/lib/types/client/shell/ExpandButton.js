import { jsx as _jsx } from "react/jsx-runtime";
import { Button, IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ExpandButton.module.css';
/** The expand control while the panel is collapsed; nothing while it is shown. */
export function ExpandButton({ sessionId, useStore, actions, t, useShortcuts }) {
    // A session with no surface yet is collapsed: the panel seat materializes the
    // surface on its own mount, and until then there is nothing expanded.
    const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'sidebar.right.toggle'));
    const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false);
    if (expanded)
        return null;
    return (_jsx(Tooltip, { label: t('chrome.expand'), shortcutKeys: shortcut?.keys, side: "bottom", delayMs: 500, children: _jsx(Button, { size: "sm", className: css.button, "aria-label": t('chrome.expandAria'), "aria-keyshortcuts": shortcut?.aria, "data-sidebar-right-expand": true, onClick: () => { actions.setExpanded(sessionId, true); }, children: _jsx(IconPanelLeftOutlineRegular, { className: css.icon }) }) }));
}
//# sourceMappingURL=ExpandButton.js.map