import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import Wrench from 'lucide-react/dist/esm/icons/wrench.mjs';
import css from './ToolCenterPanel.module.css';
export function ToolCenterPanel({ useTools, desktop, attach, retry, t, laboratory }) {
    const state = useTools(value => value), container = useRef(null);
    useEffect(() => (container.current ? attach(container.current) : undefined), [attach]);
    return (_jsxs("section", { className: css.panel, "aria-label": t(laboratory ? 'labsPanel' : 'panel'), children: [!desktop ? (_jsx("p", { role: "status", children: t(laboratory ? 'labsDesktop' : 'desktop') })) : !state.scope ? (_jsx("p", { role: "status", children: t('signedOut') })) : state.errorCode ? (_jsxs("div", { role: "alert", children: [t(laboratory ? 'labsFailed' : 'failed'), ' ', _jsx(Button, { onClick: () => {
                            void retry();
                        }, children: t('retry') })] })) : state.busy ? (_jsx("p", { role: "status", children: t(laboratory ? 'labsLoading' : 'loading') })) : null, _jsx("div", { className: css.surface, ref: container })] }));
}
export function ToolsPanelIcon({ size }) {
    return _jsx(Wrench, { size: size, strokeWidth: 1.5, "aria-hidden": "true" });
}
export function LabsPanelIcon({ size }) {
    return _jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "M9 3h6M10 3v6l-5.6 9.3A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.6-2.7L14 9V3M7.2 14h9.6" }) });
}
//# sourceMappingURL=ToolCenterPanel.js.map