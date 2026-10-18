import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** General settings row and persistent shell notice for API log uploads. */
import { Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './UploadRow.module.css';
/**
 * Render the accepted API upload state.
 * @param props - settings hooks, writer and localized copy.
 * @returns the bottom preference row.
 */
export function UploadRow({ useUpload, useMutation, setEnabled, t }) {
    const upload = useUpload(value => value);
    const busy = useMutation(value => value.busy);
    return _jsxs("div", { className: css.row, children: [_jsxs("div", { children: [_jsx("div", { className: css.title, children: t('title') }), _jsx("div", { className: css.description, children: t('description') })] }), _jsx(Switch, { checked: upload.value?.enabled === true, label: t('title'), disabled: busy || upload.status !== 'ready' || !upload.writable, onChange: (enabled) => { void setEnabled(enabled); } })] });
}
/**
 * Keep the save outcome visible after settings closes.
 * @param props - mutation hook, dismissal and localized copy.
 * @returns the current toast, or nothing.
 */
export function UploadToast({ useMutation, dismiss, t }) {
    const state = useMutation(value => value);
    if (state.notice === null)
        return null;
    return _jsx(Toast, { text: t(state.notice), onDone: dismiss, ...state.notice === 'saved' ? { tone: 'success' } : {} }, state.sequence);
}
//# sourceMappingURL=UploadRow.js.map