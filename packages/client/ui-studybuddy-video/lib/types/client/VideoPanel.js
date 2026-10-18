import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './VideoPanel.module.css';
/** Existing Studio stays in its isolated guest beside the native Conversation. */
export function VideoPanel({ usePage, attachGuest, attachNative, desktop, retry, t }) {
    const page = usePage(value => value), left = useRef(null), right = useRef(null);
    useLayoutEffect(() => left.current ? attachGuest(left.current) : undefined, [attachGuest]);
    useLayoutEffect(() => right.current ? attachNative(right.current) : undefined, [attachNative]);
    return _jsxs("section", { className: css.panel, "aria-label": t('title'), children: [_jsxs("div", { className: css.surface, children: [!desktop ? _jsx("p", { className: css.status, children: t('desktop') }) : !page.scope ? _jsx("p", { className: css.status, children: t('signedOut') }) : page.errorCode ? _jsxs("div", { className: css.status, role: "alert", children: [t('failed'), " ", _jsx(Button, { onClick: () => { void retry(); }, children: t('retry') })] }) : page.busy ? _jsx("p", { className: css.status, role: "status", children: t('loading') }) : null, _jsx("div", { ref: left, className: css.surface, style: { height: '100%' } })] }), _jsx("div", { ref: right, className: css.nativeTarget })] });
}
export function VideoPanelIcon({ size }) {
    return _jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("circle", { cx: "6", cy: "6", r: "3" }), _jsx("circle", { cx: "6", cy: "18", r: "3" }), _jsx("path", { d: "m8.4 7.8 12 12M8.4 16.2 21 3M14 10l7-7" })] });
}
//# sourceMappingURL=VideoPanel.js.map