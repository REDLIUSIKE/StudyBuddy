import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { Button, IconSkillOutlineRegular, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PagePanel.module.css';
export function PagePanel({ usePage, target, desktop, attach, retry, t }) {
    const state = usePage(value => value), container = useRef(null);
    useEffect(() => container.current ? attach(container.current) : undefined, [attach]);
    return _jsxs("section", { className: css.panel, "aria-label": t(target), children: [!desktop ? _jsx("p", { role: "status", children: t('desktop') }) : !state.scope ? _jsx("p", { role: "status", children: t('signedOut') })
                : state.errorCode ? _jsxs("div", { role: "alert", children: [t('failed'), " ", _jsx(Button, { onClick: () => { void retry(); }, children: t('retry') })] })
                    : state.busy ? _jsx("p", { role: "status", children: t('loading') }) : null, _jsx("div", { className: css.surface, ref: container })] });
}
export function SkillsPanelIcon({ size }) { return _jsx(IconSkillOutlineRegular, { size: size }); }
export function AigcPanelIcon({ size }) { return _jsx(IconSparkleRegular, { size: size }); }
//# sourceMappingURL=PagePanel.js.map