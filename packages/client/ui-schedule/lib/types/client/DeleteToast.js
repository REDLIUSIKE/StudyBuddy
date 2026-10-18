import { jsx as _jsx } from "react/jsx-runtime";
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Create the one deletion-outcome store the overlay entry shows.
 * @returns the observable notice with its report and dismiss actions.
 */
export function createDeleteToastSource() {
    let state = null;
    let seq = 0;
    const listeners = new Set();
    const publish = (next) => {
        state = next;
        for (const listener of listeners)
            listener();
    };
    return {
        hooks: {
            toast: {
                getSnapshot: () => state,
                subscribe(listener) {
                    listeners.add(listener);
                    return () => { listeners.delete(listener); };
                },
            },
        },
        report: (outcome) => {
            if (outcome === 'pending')
                return;
            publish({ kind: outcome === 'deleted' ? 'deleted' : 'deleteFailed', seq: ++seq });
        },
        dismiss: () => { publish(null); },
    };
}
/**
 * Render the current deletion notice: a success banner for a confirmed
 * deletion, a warning for one that could not be confirmed, or nothing.
 * @param props - the notice hook, its dismissal, and the locale seat.
 * @returns the banner on display, or null.
 */
export function ScheduleDeleteToast({ useToast, dismiss, t }) {
    const toast = useToast(current => current);
    if (toast === null)
        return null;
    return toast.kind === 'deleted'
        ? _jsx(Toast, { text: t('toast.deleted'), tone: "success", onDone: dismiss }, `schedule-delete-${String(toast.seq)}`)
        : _jsx(Toast, { text: t('toast.deleteFailed'), icon: _jsx(IconWarningOutlineRegular, {}), onDone: dismiss }, `schedule-delete-${String(toast.seq)}`);
}
//# sourceMappingURL=DeleteToast.js.map