import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { useEffect, useRef, useState } from 'react';
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives/src/Toast.tsx';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx';
/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export function Welcome({ api }) {
    const { messages: m } = api;
    const [expiryNotice, setExpiryNotice] = useState(false);
    const [page, setPage] = useState('entry');
    const pageRef = useRef('entry');
    const visiblePage = useRef('entry');
    const [attempt, setAttempt] = useState(null);
    const attemptRef = useRef(null);
    const [starting, setStarting] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState({ status: 'idle' });
    const copyState = copyFeedback.status;
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const mounted = useRef(true);
    const revision = useRef(0);
    const input = useRef(null);
    const keyButton = useRef(null);
    const focusEntry = useRef(false);
    function navigate(next) {
        pageRef.current = next;
        setPage(next);
    }
    function showAccount(state) {
        if (pageRef.current === 'key' || (state.attempt === null && pageRef.current === 'entry'))
            return;
        attemptRef.current = state.attempt;
        setAttempt(state.attempt);
        setStarting(false);
        setCopyFeedback({ status: 'idle' });
        navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'entry' : 'account');
    }
    useEffect(() => {
        mounted.current = true;
        document.documentElement.lang = api.id;
        document.title = m.welcomeTitle;
        const takeNotice = () => {
            void api.takeNotice().then((notice) => {
                if (mounted.current && notice === 'session-expired')
                    setExpiryNotice(true);
            }).catch((_closedChannel) => {
                // A closed Welcome IPC channel must not interrupt the sign-in page.
            });
        };
        takeNotice();
        const stop = api.onAccountState((state) => {
            revision.current++;
            takeNotice();
            showAccount(state);
        });
        return () => { mounted.current = false; stop(); };
    }, [api, m.welcomeTitle]);
    useEffect(() => {
        if (page === 'entry' && visiblePage.current !== 'entry')
            void api.analytics?.('auth_page_view', {});
        visiblePage.current = page;
        if (page === 'key')
            input.current?.focus();
        else if (page === 'entry' && focusEntry.current) {
            focusEntry.current = false;
            keyButton.current?.focus();
        }
    }, [page, api]);
    useEffect(() => {
        if (copyState !== 'copied' && copyState !== 'failed')
            return;
        const timer = setTimeout(() => { setCopyFeedback({ status: 'idle' }); }, 2000);
        return () => { clearTimeout(timer); };
    }, [copyFeedback]);
    async function saveKey(event) {
        event.preventDefault();
        if (busyRef.current)
            return;
        void api.analytics?.('api_key_save_click', {});
        const value = draft.trim();
        if (!/^[\x21-\x7e]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)
            || ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) && value.at(-1) === value[0])) {
            setError(value === '' ? m.welcomeKeyBlank : m.welcomeKeyInvalid);
            input.current?.focus();
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await api.saveApiKey(value);
            if (!mounted.current)
                return;
            if (result.ok)
                setDraft('');
            else
                setError(m.welcomeKeyFailed);
        }
        catch {
            if (mounted.current)
                setError(m.welcomeKeyFailed);
        }
        finally {
            busyRef.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    async function skip() {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setBusy(true);
        try {
            await api.skip();
            if (mounted.current)
                setDraft('');
        }
        catch {
            if (mounted.current)
                setError(m.welcomeContinueFailed);
        }
        finally {
            busyRef.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    async function start() {
        navigate('account');
        setStarting(true);
        setAttempt(null);
        attemptRef.current = null;
        const current = ++revision.current;
        try {
            const state = await api.startSignIn();
            if (mounted.current && revision.current === current)
                showAccount(state);
        }
        catch {
            if (mounted.current && revision.current === current)
                setStarting(false);
        }
    }
    async function cancel() {
        if (cancelling || attemptRef.current === null)
            return;
        setCancelling(true);
        const current = ++revision.current;
        try {
            const state = await api.cancelSignIn(attemptRef.current.id);
            if (mounted.current && revision.current === current)
                showAccount(state);
        }
        catch {
            // The current attempt remains visible so cancellation can be retried.
        }
        finally {
            if (mounted.current)
                setCancelling(false);
        }
    }
    async function copyLink() {
        const current = attemptRef.current;
        if (current?.phase !== 'waiting-browser' || (copyState === 'busy' || copyState === 'copied'))
            return;
        setCopyFeedback({ status: 'busy' });
        try {
            await api.copySignInLink(current.id);
            if (mounted.current && attemptRef.current === current)
                setCopyFeedback({ status: 'copied' });
        }
        catch {
            if (mounted.current && attemptRef.current === current)
                setCopyFeedback({ status: 'failed' });
        }
    }
    const phase = starting ? 'initializing' : attempt?.phase ?? 'failed';
    const waiting = phase === 'waiting-browser';
    const failed = phase === 'expired' || phase === 'failed';
    const title = phase === 'initializing' ? m.welcomeAuthStarting
        : waiting ? m.welcomeAuthWaiting : phase === 'expired' ? m.welcomeAuthExpired
            : phase === 'failed' ? m.welcomeAuthFailed : m.welcomeAuthExchanging;
    const heading = page === 'entry' ? 'welcome-heading' : page === 'key' ? 'key-title' : 'auth-status';
    return _jsxs(_Fragment, { children: [expiryNotice && _jsx(Toast, { text: m.welcomeSessionExpired, onDone: () => { setExpiryNotice(false); } }), _jsx("div", { className: "titlebar", "aria-hidden": "true" }), _jsxs("main", { className: "welcome", "aria-labelledby": heading, children: [_jsx("img", { className: "brand", src: "assets/welcome-brand.svg", alt: m.welcomeBrand, width: "472", height: "40" }), _jsxs("div", { id: "tagline", className: "tagline", hidden: page !== 'entry', children: [_jsxs("h1", { id: "welcome-heading", children: [_jsx("span", { children: m.welcomeTaglineBefore }), _jsx("em", { children: m.welcomeTaglineBrand }), _jsx("span", { children: m.welcomeTaglineAfter })] }), _jsx("p", { id: "welcome-description", children: m.welcomeDescription })] }), _jsxs("form", { id: "key-form", className: "key-form", hidden: page !== 'key', noValidate: true, onSubmit: (event) => { void saveKey(event); }, "aria-busy": busy, children: [_jsxs("header", { className: "key-heading", children: [_jsx("h1", { id: "key-title", children: m.welcomeKeyTitle }), _jsx("p", { id: "key-description", children: m.welcomeKeyDescription })] }), _jsxs("div", { className: "key-field", children: [_jsx("label", { className: "visually-hidden", htmlFor: "key-input", children: m.welcomeKeyPlaceholder }), _jsx("input", { ref: input, id: "key-input", type: "password", autoComplete: "new-password", autoCapitalize: "off", spellCheck: false, required: true, "aria-describedby": "key-description key-error", "aria-invalid": error !== '', placeholder: m.welcomeKeyPlaceholder, value: draft, disabled: busy, onChange: (event) => { setDraft(event.target.value); setError(''); } }), _jsx("p", { id: "key-error", className: "key-error", role: "alert", hidden: error === '', children: error })] })] }), _jsxs("section", { id: "auth-page", className: `key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`, hidden: page !== 'account', "aria-live": "polite", children: [_jsx("h1", { id: "auth-status", children: title }), _jsx("p", { id: "auth-description", hidden: !waiting && phase !== 'expired', children: waiting ? m.welcomeAuthWaitingDescription : m.welcomeAuthExpiredDescription }), _jsx("button", { id: "auth-copy", className: "copy-link", type: "button", hidden: !waiting, disabled: !waiting || (copyState === 'busy' || copyState === 'copied'), onClick: () => { void copyLink(); }, children: copyState === 'copied' ? m.welcomeAuthCopied : copyState === 'failed' ? m.welcomeAuthCopyFailed : m.welcomeAuthCopyLink })] }), _jsxs("div", { id: "auth-actions", className: "actions", hidden: page !== 'account', children: [_jsx("button", { id: "auth-loading", className: "primary", type: "button", hidden: failed, disabled: true, "aria-label": m.welcomeAuthExchanging, children: _jsx(StateDot, { state: "ongoing", size: 16, className: "welcome-loading" }) }), _jsx("button", { id: "auth-retry", className: "primary", type: "button", hidden: !failed, onClick: () => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start(); }, children: m.welcomeAuthRetry }), _jsx("button", { id: "auth-api-key", className: "secondary", type: "button", hidden: !failed, onClick: () => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key'); }, children: m.welcomeApiKey }), _jsx("button", { id: "auth-cancel", className: "secondary", type: "button", hidden: failed, disabled: cancelling || phase === 'committing' || phase === 'succeeded' || (phase === 'initializing' && !attempt?.id), onClick: () => { void cancel(); }, children: m.welcomeAuthCancel })] }), _jsxs("div", { id: "entry-actions", className: "actions", hidden: page !== 'entry', children: [_jsx("button", { id: "sign-in", className: "primary", type: "button", onClick: () => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start(); }, children: m.welcomeSignIn }), _jsx("button", { ref: keyButton, id: "api-key", className: "secondary", type: "button", onClick: () => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key'); }, children: m.welcomeApiKey })] }), _jsxs("div", { id: "key-actions", className: "actions", hidden: page !== 'key', children: [_jsx("button", { id: "save-key", className: "primary", type: "submit", form: "key-form", disabled: busy || draft.trim() === '', children: m.welcomeKeySave }), _jsx("button", { id: "skip-key", className: "secondary", type: "button", disabled: busy, onClick: () => { void skip(); }, children: m.welcomeKeyLater }), _jsx("button", { id: "back-to-login", className: "back", type: "button", disabled: busy, onClick: () => {
                                    if (busyRef.current)
                                        return;
                                    setDraft('');
                                    setError('');
                                    focusEntry.current = true;
                                    navigate('entry');
                                }, children: m.welcomeKeyBack })] })] })] });
}
//# sourceMappingURL=WelcomePage.js.map