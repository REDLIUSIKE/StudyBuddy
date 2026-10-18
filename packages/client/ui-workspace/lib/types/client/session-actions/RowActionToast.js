import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The `shell.overlay` entry for Workspace and Session notices.
 * One notice is visible at a time; a parent rerender does not extend its hold.
 */
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { assertNever } from '@deepseek-ai/dsh-util-values';
/**
 * Hold for the notices that take longer to read than a one-line warning: the
 * archive and fork recovery actions, and a refused Session creation quoting the Host's reason.
 */
const LONG_TOAST_HOLD_MS = 6000;
/**
 * Render an operation notice, retaining recovery actions for six seconds.
 * @param props - notice and viewing sources, dismissal and recovery callbacks, and localized copy.
 * @returns the notice on display, or null.
 */
export function RowActionToast({ useToast, useStore, dismissToast, undoArchive, showArchived, openForkSource, t }) {
    const toast = useToast(current => current);
    const archivedRowsVisible = useStore(state => (state.archivedFilter ?? 'default') !== 'default');
    if (toast === null)
        return null;
    if (toast.kind === 'forkRequiresOpen') {
        return (_jsx(Toast, { text: t('toast.forkRequiresOpen'), icon: _jsx(IconWarningOutlineRegular, {}), holdMs: LONG_TOAST_HOLD_MS, actions: [{
                    label: t('toast.openForkSource'),
                    onClick: () => { dismissToast(); openForkSource(toast.sessionId); },
                }], onDone: dismissToast }, `toast-${String(toast.seq)}`));
    }
    if (toast.kind === 'archived' || toast.kind === 'stoppedAndArchived') {
        const { sessionId } = toast;
        return (_jsx(Toast, { text: t(toast.kind === 'archived' ? 'toast.archived' : 'toast.stoppedAndArchived'), tone: "success", holdMs: LONG_TOAST_HOLD_MS, actions: [
                { label: t('toast.archivedUndo'), onClick: () => { dismissToast(); undoArchive(sessionId); } },
                ...archivedRowsVisible ? [] : [
                    { prefix: t('toast.archivedOr'), label: t('toast.archivedFilter'), onClick: () => { dismissToast(); showArchived(); } },
                ],
            ], onDone: dismissToast }, `toast-${String(toast.seq)}`));
    }
    if (toast.kind === 'createFailed') {
        return (_jsx(Toast, { text: t('toast.createFailed', { message: toast.message }), icon: _jsx(IconWarningOutlineRegular, {}), holdMs: LONG_TOAST_HOLD_MS, onDone: dismissToast }, `toast-${String(toast.seq)}`));
    }
    return (_jsx(Toast, { text: plainNoticeText(toast, t), icon: _jsx(IconWarningOutlineRegular, {}), onDone: dismissToast }, `toast-${String(toast.seq)}`));
}
/** The copy of one plain warning, keyed by the notice kind the union closes over. */
function plainNoticeText(toast, t) {
    switch (toast.kind) {
        case 'pinFailed': return t('toast.pinFailed');
        case 'unpinFailed': return t('toast.unpinFailed');
        case 'defaultWorkspaceFailed': return t('defaultWorkspace.failed');
        case 'archivedNotOpenable': return t('toast.archivedNotOpenable');
        /* v8 ignore next 2 -- closed-union backstop; only reached if a notice kind is forged */
        default:
            return assertNever(toast);
    }
}
//# sourceMappingURL=RowActionToast.js.map