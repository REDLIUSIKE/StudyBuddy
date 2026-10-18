import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Root-scoped controller for the right Sidebar's Session content. */
import { useLayoutEffect } from 'react';
import css from './SidebarRight.module.css';
function SessionView({ view, visible, SessionProvider, renderSlot, mountView, width, viewportWidth, canShow }) {
    useLayoutEffect(() => mountView(view.reference), [mountView, view.reference]);
    const active = visible && view.selected;
    return _jsx("div", { className: css.session, hidden: !active, "data-sidebar-right-session": view.sessionId, children: _jsx(SessionProvider, { session: view.reference, children: renderSlot('rightbar.session', { width, viewportWidth, canShow, active, retainTab: view.retainTab }) }) });
}
/**
 * Keep independent Session subtrees and hide those outside the selected Conversation.
 * @param props - frame geometry, view targets and the authorized Session renderer.
 * @returns the foreground and retained background Sidebars.
 */
export function RightbarRoot({ useActiveSession, useViews, useGlobalPanel, ...props }) {
    const visible = useActiveSession(sessionId => sessionId !== undefined);
    const views = useViews(value => value);
    const global = useGlobalPanel(value => value);
    return _jsxs(_Fragment, { children: [views.map(view => _jsx(SessionView, { ...props, view: view, visible: visible && global === null }, view.sessionId)), global !== null && _jsx("div", { className: css.global, style: { width: props.canShow ? props.width : Math.min(360, props.viewportWidth) }, children: props.renderSlot('rightbar.global', { width: props.width, viewportWidth: props.viewportWidth, canShow: props.canShow }, { entryKey: global }) })] });
}
//# sourceMappingURL=RightbarRoot.js.map