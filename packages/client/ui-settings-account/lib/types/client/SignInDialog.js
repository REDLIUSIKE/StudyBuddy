import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Account authorization dialog; errors allow retry after cancelling any active attempt. */
import { useEffect, useState } from 'react';
import { Button, IconCloseOutlineRegular, IconLoadingOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { authorizeUrlWithTheme } from "./authorize-url.js";
import css from './SignInDialog.module.css';
/** @param props - safe account state, localized copy, and user actions. @returns login dialog. */
export function SignInDialog({ account, colorScheme, start, cancel, close, useApiKey, t }) {
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [copyResult, setCopyResult] = useState(null);
    const attempt = account.view?.attempt;
    useEffect(() => { setCopyResult(null); }, [attempt?.id, attempt?.authorizeUrl]);
    useEffect(() => {
        if (copyResult === null)
            return;
        const timer = setTimeout(() => { setCopyResult(null); }, 2000);
        return () => { clearTimeout(timer); };
    }, [copyResult]);
    const authorizeUrl = attempt?.authorizeUrl;
    const phase = attempt?.phase;
    const active = busy || phase === 'initializing' || phase === 'waiting-browser' || phase === 'exchanging' || phase === 'committing';
    const expired = phase === 'expired';
    const localFailure = failed || account.loginFailed || account.failed;
    const error = localFailure || phase === 'failed';
    const failureKey = !localFailure
        && phase === 'failed' && attempt?.errorCode === 'no-response' ? 'noResponse' : 'failed';
    const waiting = active && !error;
    const committing = phase === 'committing';
    useEffect(() => { if (account.view?.status === 'credential-stored')
        close(); }, [account.view?.status, close]);
    const run = async (action) => {
        setBusy(true);
        setFailed(false);
        try {
            await action();
        }
        catch {
            setFailed(true);
        }
        finally {
            setBusy(false);
        }
    };
    const dismiss = () => {
        if (committing || busy)
            return;
        if (active && attempt)
            void run(async () => { await cancel(attempt.id); close(); });
        else
            close();
    };
    const retry = async () => {
        if (active && attempt)
            await cancel(attempt.id);
        await start();
    };
    const copyLink = async (authorizeUrl) => {
        try {
            await navigator.clipboard.writeText(authorizeUrlWithTheme(authorizeUrl, colorScheme));
            setCopyResult({ messageKey: 'copiedLink' });
        }
        catch {
            setCopyResult({ messageKey: 'copyFailed' });
        }
    };
    const title = error ? t('failureTitle') : active ? t('browserTitle') : expired ? t('timeoutTitle') : t('loginTitle');
    return _jsxs(Modal, { open: true, headless: true, title: title, onClose: dismiss, className: css.dialog, children: [_jsxs("div", { className: css.content, children: [_jsxs("div", { className: css.header, children: [_jsx("h2", { className: css.title, children: title }), _jsx("button", { type: "button", className: css.close, "aria-label": t('close'), onClick: dismiss, children: _jsx(IconCloseOutlineRegular, { size: 14 }) })] }), waiting ? _jsxs("p", { className: css.description, children: [t('browserPrompt'), _jsx("button", { type: "button", className: css.link, disabled: !authorizeUrl, onClick: authorizeUrl ? () => { void copyLink(authorizeUrl); } : undefined, children: t(copyResult?.messageKey ?? 'copyLink') }), t('browserDescription')] }) : _jsx("p", { className: css.description, children: error ? t(failureKey) : expired ? t('timeoutDescription') : t('loginDescription') })] }), _jsxs("div", { className: css.actions, children: [_jsx(Button, { variant: "outline", className: css.secondaryButton, disabled: committing || busy, onClick: active ? dismiss : useApiKey, children: t(active ? 'cancel' : 'addApiKey') }), _jsx(Button, { variant: "primary", className: css.primaryButton, disabled: busy || committing || waiting || account.view === undefined, "aria-label": waiting ? t('waiting') : undefined, onClick: () => { void run(retry); }, children: waiting ? _jsx(IconLoadingOutlineRegular, { className: css.spinner }) : t(expired || error ? 'retry' : 'signIn') })] })] });
}
//# sourceMappingURL=SignInDialog.js.map