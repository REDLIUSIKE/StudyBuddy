import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Errors report an actionable state while keeping private diagnostics out of the page. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MyAiPanel.module.css';
export function ErrorNotice({ code, t, retry }) {
    if (!code)
        return null;
    const key = code === 'NATIVE_SAVE_JOURNAL_MISSING' ? 'saveJournalMissing' : code === 'NATIVE_SOURCE_FIELDS_REQUIRED' ? 'sourceFieldsRequired' : code === 'NATIVE_VERIFICATION_REQUIRED' ? 'verifyFirst' : code === 'NATIVE_SAVE_RECOVERY_REQUIRED' || code === 'NATIVE_RESULT_UNKNOWN' ? 'pending' : code === 'NATIVE_USAGE_BINDING_CHANGED' ? 'recordMismatch' : code === 'AUTH_REQUIRED' || code === 'ACCOUNT_SCOPE_CHANGED' ? 'authenticationRequired' : code === 'BUSINESS_UNAVAILABLE' ? 'unavailable' : code === 'RECHARGE_PAYMENT_CLOSED' ? 'paymentClosed' : code === 'RECHARGE_CREATION_PENDING' ? 'creationPending' : 'error';
    return _jsxs("div", { className: css.error, role: "alert", children: [_jsx("span", { children: t(key) }), retry && _jsx(Button, { size: "sm", variant: "outline", onClick: retry, children: t('retry') })] });
}
//# sourceMappingURL=ErrorNotice.js.map