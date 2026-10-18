import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Account sign-out confirmation with the current task impact. */
import { useState } from 'react';
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SignInDialog.module.css';
/** @param props - task impact at opening, localized copy, and account actions. @returns sign-out confirmation. */
export function SignOutDialog({ running, signOut, close, t }) {
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const dismiss = () => { if (!busy)
        close(); };
    const confirm = async () => {
        setBusy(true);
        setFailed(false);
        try {
            await signOut();
            close();
        }
        catch {
            setFailed(true);
        }
        finally {
            setBusy(false);
        }
    };
    return _jsxs(Modal, { open: true, headless: true, title: t('signOut'), onClose: dismiss, className: css.dialog, children: [_jsxs("div", { className: css.content, children: [_jsxs("div", { className: css.header, children: [_jsx("h2", { className: css.title, children: t('signOut') }), _jsx("button", { type: "button", className: css.close, "aria-label": t('close'), disabled: busy, onClick: dismiss, children: _jsx(IconCloseOutlineRegular, { size: 14 }) })] }), _jsx("p", { className: css.description, children: t(running === 'unknown' ? 'signOutUnknownDescription' : running ? 'signOutRunningDescription' : 'signOutDescription') }), failed && _jsx("p", { className: css.description, role: "alert", children: t('failed') })] }), _jsxs("div", { className: css.actions, children: [_jsx(Button, { variant: "outline", className: css.secondaryButton, disabled: busy, onClick: dismiss, children: t('cancel') }), _jsx(Button, { variant: "primary", className: css.primaryButton, disabled: busy, onClick: () => { void confirm(); }, children: t('signOut') })] })] });
}
//# sourceMappingURL=SignOutDialog.js.map