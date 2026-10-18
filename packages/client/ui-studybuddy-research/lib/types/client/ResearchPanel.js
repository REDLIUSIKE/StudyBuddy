import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Main panel holds geometry; the native Conversation remains under the stable shell overlay. */
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ResearchPanel.module.css';
/** @param props - Owned guest state and geometry actions. @returns The workbench and native-column footprint. */
export function ResearchPanel({ usePage, attachGuest, attachNative, desktop, retry, t }) {
    const page = usePage(state => state), left = useRef(null), right = useRef(null);
    useLayoutEffect(() => left.current ? attachGuest(left.current) : undefined, [attachGuest]);
    useLayoutEffect(() => right.current ? attachNative(right.current) : undefined, [attachNative]);
    return _jsxs("section", { className: css.panel, "aria-label": t('title'), children: [_jsxs("div", { className: css.surface, children: [!desktop ? _jsx("p", { className: css.status, children: t('desktop') }) : !page.scope ? _jsx("p", { className: css.status, children: t('signedOut') })
                        : page.errorCode ? _jsxs("div", { className: css.status, role: "alert", children: [t('failed'), " ", _jsx(Button, { onClick: () => { void retry(); }, children: t('retry') })] })
                            : page.busy ? _jsx("p", { className: css.status, role: "status", children: t('loading') }) : null, _jsx("div", { ref: left, className: css.surface, style: { height: '100%' } })] }), _jsx("div", { ref: right, className: css.nativeTarget })] });
}
/** @param props - Existing sidebar icon size. @returns Research entry icon. */
export function ResearchPanelIcon({ size }) {
    return _jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "m8 3 6 6-3 3-6-6 3-3Zm5 7 2 2M14 5l2-2M4 17h8M7 17v4M3 21h18" }), _jsx("path", { d: "M15 10a6 6 0 0 1 3 11" }), _jsx("circle", { cx: "15", cy: "14", r: "2" })] });
}
//# sourceMappingURL=ResearchPanel.js.map