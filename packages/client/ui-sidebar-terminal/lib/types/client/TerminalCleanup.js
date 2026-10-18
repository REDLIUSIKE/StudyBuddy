import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './TerminalCleanup.module.css';
/**
 * Render failed cleanup tasks without recreating or blocking any sidebar tab.
 * @param props - root overlay hooks, retry command and localized copy.
 * @returns a compact alert stack, empty when no close has failed.
 */
export function TerminalCleanup({ useCloseFailures, retryClose, t }) {
    const failures = useCloseFailures(value => value);
    if (failures.length === 0)
        return null;
    return _jsx("div", { className: css.stack, children: failures.map(failure => _jsxs("div", { className: css.notice, role: "alert", children: [_jsx("span", { children: t('cleanupFailed', { title: failure.title, message: failure.message }) }), _jsx("button", { type: "button", onClick: () => { retryClose(failure.id); }, children: t('retry') })] }, failure.id)) });
}
//# sourceMappingURL=TerminalCleanup.js.map