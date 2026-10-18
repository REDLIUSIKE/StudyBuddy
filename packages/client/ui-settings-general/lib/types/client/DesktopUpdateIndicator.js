import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Optional Electron status presentation; the native shell owns actions and Web owns visible copy. */
import { IconDownloadOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './DesktopUpdateIndicator.module.css';
const BUSY_PHASES = new Set([
    'checking', 'downloading', 'verifying', 'installing',
]);
function updateCopy(state, t) {
    const labels = {
        idle: '',
        checking: t('desktop.update.checking'),
        available: t('desktop.update.available'),
        downloading: t('desktop.update.progress', { percent: state.percent ?? 0 }),
        verifying: t('desktop.update.verifying'),
        installing: t('desktop.update.installing'),
        ready: t('desktop.update.ready'),
        error: t('desktop.update.retry'),
    };
    const label = labels[state.phase];
    if (state.phase === 'checking' || state.phase === 'verifying' || state.phase === 'installing') {
        return { label, detail: state.version ?? label };
    }
    if (state.phase === 'error') {
        const failures = {
            check: t('desktop.update.checkFailed'),
            'check-network': t('desktop.update.checkNetworkFailed'),
            download: t('desktop.update.downloadFailed'),
            'download-network': t('desktop.update.downloadNetworkFailed'),
            install: t('desktop.update.installFailed'),
            'install-network': t('desktop.update.installNetworkFailed'),
            'stop-failed': t('desktop.update.stopFailed'),
            'tasks-changed': t('desktop.update.tasksChanged'),
            'tasks-unavailable': t('desktop.update.tasksUnavailable'),
        };
        return { label, detail: failures[state.failure ?? 'install'] };
    }
    if (state.phase === 'downloading' && state.version !== undefined) {
        return { label, detail: t('desktop.update.downloadDetail', { percent: state.percent ?? 0, version: state.version }) };
    }
    return { label, detail: state.version === undefined
            ? label
            : t('desktop.update.versionDetail', { label, version: state.version }) };
}
/**
 * Render update status with connection-indicator geometry and brand-blue labels, including retries.
 * @param props - Connection priority, sidebar width, and localized bridge-failure copy.
 * @returns Desktop-only status beside the account button, or nothing in browsers.
 */
export function DesktopUpdateIndicator({ wide, hidden, t, view, onOpen }) {
    const { presentation: state, failed, opening } = view;
    if (!wide || hidden || (!failed && (state === undefined || state.phase === 'idle')))
        return null;
    const retryLabel = t('desktop.update.retry');
    const copy = state === undefined ? { label: retryLabel, detail: retryLabel } : updateCopy(state, t);
    const label = failed ? retryLabel : copy.label;
    const error = failed || state?.phase === 'error';
    const busy = opening || (state !== undefined && BUSY_PHASES.has(state.phase));
    return _jsx(Tooltip, { label: failed ? retryLabel : copy.detail, side: "top", children: _jsxs("button", { type: "button", className: css.indicator, "aria-label": label, "aria-disabled": busy, onClick: () => { if (!busy)
                onOpen(); }, children: [_jsx("span", { className: css.icon, "aria-hidden": "true", children: error ? _jsx("span", { className: css.errorDot })
                        : busy ? _jsx(IconLoadingOutlineRegular, { className: css.spinner, size: 14 }) : _jsx(IconDownloadOutlineRegular, { size: 14 }) }), _jsx("span", { children: label })] }) });
}
/**
 * @param props - Framework-bound carrier and connection state.
 * @returns A non-interactive brand-blue notification on the sidebar expand button.
 */
export function DesktopUpdateBadge({ useDesktopUpdate, useConnectionState, t }) {
    const { presentation: state, failed } = useDesktopUpdate(value => value);
    const connection = useConnectionState(value => value);
    if (((connection === 'disconnected' || connection === 'connecting') && state?.phase !== 'installing')
        || (!failed && (state === undefined || state.phase === 'idle')))
        return null;
    const retryLabel = t('desktop.update.retry');
    const copy = state === undefined ? { label: retryLabel, detail: retryLabel } : updateCopy(state, t);
    const label = failed ? retryLabel : copy.label;
    return _jsx(Tooltip, { label: failed ? label : copy.detail, side: "right", children: _jsx("span", { role: "img", "aria-label": label, className: css.badge }) });
}
//# sourceMappingURL=DesktopUpdateIndicator.js.map