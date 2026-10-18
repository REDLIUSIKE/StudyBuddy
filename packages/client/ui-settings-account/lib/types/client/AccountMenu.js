import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Sidebar account launcher and locally authoritative sign-out action. */
import { useEffect, useRef, useState } from 'react';
import { Toast, Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium, } from '@deepseek-ai/dsh-client-ui-primitives';
import { SignOutDialog } from "./SignOutDialog.js";
import { SignInDialog } from "./SignInDialog.js";
import { LogoutIcon } from "./LogoutIcon.js";
import { AccountAvatar } from "./AccountAvatar.js";
import { AccountNoticeCard } from "./AccountNotice.js";
import css from './AccountMenu.module.css';
/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({ subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen, useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount, bonusNoticeShown, bonusNoticeDismissed, contactUs, showLogin, start, cancel, t, }) {
    const anchor = useRef(null);
    // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
    // re-renders, section switches and tab switches inside one open must not read again.
    const settingsWasOpen = useRef(false);
    useEffect(() => {
        if (settingsOpen && !settingsWasOpen.current)
            void refreshAccount();
        settingsWasOpen.current = settingsOpen;
    }, [refreshAccount, settingsOpen]);
    const account = useAccount(state => state);
    const colorScheme = useTheme(snapshot => snapshot.active.colorScheme);
    const signedIn = account.view?.status === 'credential-stored';
    const [signInNotice, setSignInNotice] = useState(0);
    useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1); }), [subscribeModelSignInRequired]);
    const [expiryNotice, setExpiryNotice] = useState(false);
    useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true); }), [subscribeSessionExpired]);
    const profile = account.details?.profile;
    const label = profile === undefined ? null : profile.status === 'ready'
        ? profile.value.name ?? profile.value.contact ?? t('signedIn') : t('signedIn');
    const [open, setOpen] = useState(false);
    const trigger = useRef(null);
    const [busy, setBusy] = useState(false);
    const [signOutImpact, setSignOutImpact] = useState();
    const requestSignOut = async () => {
        setBusy(true);
        try {
            setSignOutImpact(await hasRunningAccountTasks());
            setOpen(false);
        }
        catch (_error) {
            setSignOutImpact('unknown');
            setOpen(false);
        }
        finally {
            setBusy(false);
        }
    };
    // The plugin's start publishes `loginFailed` before it rejects, so the dialog owns the report.
    const beginSignIn = () => { setOpen(false); void start().catch(() => undefined); };
    return _jsxs("div", { ref: anchor, className: css.root, children: [signInNotice > 0 && _jsx(Toast, { text: t('modelSignInRequired'), onDone: () => { setSignInNotice(0); } }, signInNotice), expiryNotice && _jsx(Toast, { text: t('sessionExpired'), onDone: () => { setExpiryNotice(false); } }), signedIn && account.notice && _jsx(AccountNoticeCard, { notice: account.notice, anchor: anchor, title: t('bonusNoticeTitle'), closeLabel: t('close'), onShown: bonusNoticeShown, onDismiss: bonusNoticeDismissed }, account.notice.orderId), _jsx(Menu, { open: open, side: "top", portal: true, autoFocus: true, className: css.anchor, listClassName: signedIn ? undefined : css.signedOutMenu, anchor: _jsxs("button", { ref: trigger, type: "button", className: css.trigger, "data-collapsed": !wide, "data-signed-out": !signedIn, "aria-label": t('menu'), "aria-haspopup": "menu", "aria-expanded": open, onClick: () => { setOpen(value => !value); }, children: [signedIn
                            ? _jsx("span", { className: css.avatar, children: _jsx(AccountAvatar, { url: profile?.status === 'ready' ? profile.value.avatarUrl : null }) })
                            : _jsx(IconEllipsisOutlineMedium, { size: 14 }), wide && _jsx("span", { className: css.label, children: signedIn ? label : t('more') })] }), items: [
                    { id: 'settings', label: t('settings'), icon: _jsx(IconSettingsOutlineMedium, { size: 16 }),
                        ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
                    { id: 'contact', label: t('contactUs'), icon: _jsx(IconPaperPlaneOutlineMedium, { size: 16 }) },
                    ...(signedIn ? [{ id: 'signout', label: t('signOut'), icon: _jsx(LogoutIcon, {}), disabled: busy }]
                        : [{ id: 'signin', label: t('signIn'), icon: _jsx(IconUserOutlineMedium, { size: 16 }) }]),
                ], onClose: () => { setOpen(false); }, onSelect: (id) => {
                    if (id === 'settings') {
                        setOpen(false);
                        trigger.current?.focus();
                        openSettings();
                    }
                    else if (id === 'contact') {
                        setOpen(false);
                        contactUs();
                    }
                    else if (id === 'signin')
                        beginSignIn();
                    else
                        void requestSignOut();
                } }), account.loginVisible && !account.onboarding && _jsx(SignInDialog, { account: account, colorScheme: colorScheme, start: start, cancel: cancel, t: t, close: () => { showLogin(false); }, useApiKey: () => { showLogin(false); openOnboarding('deepseek-official'); } }), signedIn && signOutImpact !== undefined && _jsx(SignOutDialog, { running: signOutImpact, signOut: signOut, close: () => { setSignOutImpact(undefined); }, t: t })] });
}
//# sourceMappingURL=AccountMenu.js.map