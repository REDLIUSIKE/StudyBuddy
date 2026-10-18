import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button, IconWarningOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './TaskManagerPage.module.css';
/**
 * Render the catalog's loading and query-failure states.
 *
 * An empty panel centers a bare spinner while loading and the failure with its
 * retry; a panel that already shows content keeps a compact notice for a failed
 * refresh, and stays silent while a refresh loads, so the retained rows remain
 * readable. Deletion outcomes are not catalog states: the app-wide toast
 * announces them.
 * @param props - query state, whether content is shown, the retry action, and localized copy.
 * @returns the applicable states, or nothing while the catalog is ready.
 */
export function CatalogFeedback({ status, populated, onRetry, t }) {
    return _jsxs(_Fragment, { children: [status === 'loading' && !populated && _jsx("div", { className: css.empty, role: "status", "aria-label": t('list.loading'), children: _jsx(StateDot, { state: "ongoing" }) }), status === 'error' && (populated
                ? _jsxs("div", { className: css.notice, children: [_jsx("p", { role: "alert", children: t('list.error') }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => { void onRetry(); }, children: t('list.retry') })] })
                : _jsxs("div", { className: css.empty, children: [_jsx(IconWarningOutlineRegular, { size: 24, className: css.emptyGlyph }), _jsx("p", { role: "alert", className: css.emptyTitle, children: t('list.error') }), _jsx(Button, { variant: "outline", className: css.emptyAction, onClick: () => { void onRetry(); }, children: t('list.retry') })] }))] });
}
//# sourceMappingURL=CatalogFeedback.js.map