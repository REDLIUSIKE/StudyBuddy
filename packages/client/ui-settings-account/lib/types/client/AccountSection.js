import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Account settings renders safe Host state and explicit login actions. */
import { Big } from 'big.js';
import { useEffect, useRef, useState } from 'react';
import { Button, IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatBalance } from "./formatBalance.js";
import { AccountAvatar } from "./AccountAvatar.js";
import { authorizeUrlWithTheme } from "./authorize-url.js";
import css from './AccountSection.module.css';
/** @param props - localized actions, account subscription, and the shared Platform page channel. @returns account settings UI. */
export function AccountSection({ t, useAccount, useTheme, start, cancel, openPlatformPage }) {
    const { view: state, details, failed: streamFailed } = useAccount(value => value);
    const colorScheme = useTheme(snapshot => snapshot.active.colorScheme);
    // The shared host owns the native view; this page holds only its own request,
    // and only while it is the latest owner.
    const releasePage = useRef(undefined);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const profile = details?.profile?.status === 'ready' ? details.profile.value : undefined;
    const wallets = details?.balance?.status === 'ready' ? details.balance.value : undefined;
    const bonusWallets = details?.balance?.status === 'ready'
        ? details.balance.bonusWallets.filter(wallet => new Big(wallet.balance).gt(0)) : [];
    const showBonusRow = details?.balance?.status !== 'ready' || bonusWallets.length > 0;
    const attempt = state?.attempt;
    const active = attempt !== null && attempt !== undefined
        && ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(attempt.phase);
    const signedIn = state?.status === 'credential-stored';
    useEffect(() => () => { releasePage.current?.(); releasePage.current = undefined; }, []);
    useEffect(() => {
        if (signedIn)
            return;
        releasePage.current?.();
        releasePage.current = undefined;
    }, [signedIn]);
    const showPage = (open, page) => {
        releasePage.current?.();
        releasePage.current = open(page, () => { releasePage.current = undefined; });
    };
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
    /**
     * @param event - click on a Platform destination link.
     * @returns nothing; on Desktop the embedded page replaces the pending navigation.
     */
    const openUsage = (event) => {
        if (openPlatformPage !== undefined && signedIn) {
            event.preventDefault();
            showPage(openPlatformPage, 'usage');
        }
    };
    /**
     * The Platform entry the balance rows share with the Usage action: an embedded page on
     * Desktop, a new tab elsewhere. A wallet read that failed still reaches the same
     * destination, so the user can inspect the balance the Harness could not load; the
     * destination comes from the account links, not from the wallet response.
     * @param label - localized link copy.
     * @param className - link treatment for the row that renders it, absent when the sheet has no such rule.
     * @returns the Platform anchor.
     */
    const platformLink = (label, className) => (_jsx("a", { className: className, href: state?.links.usageUrl, "aria-disabled": state === undefined, target: "_blank", rel: "noreferrer", onClick: openUsage, children: label }));
    const status = failed || streamFailed || attempt?.phase === 'failed' ? t('failed')
        : attempt?.phase === 'expired' ? t('expired')
            : active ? t(attempt.phase === 'initializing' ? 'initializing' : attempt.phase === 'waiting-browser' ? 'waiting' : 'completing')
                : signedIn ? profile?.contact ?? t(details?.profile === undefined ? 'loading' : 'profileUnavailable') : t('signInDescription');
    if (!signedIn && !active)
        return (_jsx("section", { className: css.signedOut, "aria-label": t('nav'), children: _jsxs("div", { className: css.signedOutContent, children: [_jsxs("div", { className: css.signedOutCopy, children: [_jsx("span", { className: css.signedOutTitle, children: t('settingsSignedOutTitle') }), _jsx("span", { className: css.signedOutDescription, role: "status", children: failed || streamFailed ? t('failed') : t('settingsSignedOutDescription') })] }), _jsx(Button, { variant: "primary", className: css.signInButton, disabled: busy || state === undefined, onClick: () => { void run(start); }, children: t('signIn') })] }) }));
    return (_jsxs("section", { className: css.section, "aria-label": t('nav'), children: [_jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.identity, children: [_jsx("span", { className: css.avatar, children: _jsx(AccountAvatar, { url: signedIn ? profile?.avatarUrl : null }) }), _jsxs("div", { className: css.identityCopy, children: [_jsx("span", { className: css.name, children: signedIn ? profile?.name ?? t('signedIn') : t('signedOut') }), _jsx("span", { className: css.status, role: "status", children: status })] })] }), signedIn && _jsxs("a", { className: css.accountInfo, href: new URL('/', state.links.usageUrl).href, target: "_blank", rel: "noopener noreferrer", children: [t('accountInfo'), _jsx(IconRightUpOutlineRegular, { size: 12 })] })] }), active && _jsxs("div", { className: css.actions, children: [attempt.authorizeUrl && _jsx("a", { className: css.linkButton, href: authorizeUrlWithTheme(attempt.authorizeUrl, colorScheme), target: "_blank", rel: "noreferrer", children: t('open') }), _jsx(Button, { variant: "outline", disabled: busy || attempt.phase === 'committing', onClick: () => { void run(() => cancel(attempt.id)); }, children: t('cancel') })] }), _jsxs("div", { className: css.balanceCard, children: [_jsxs("div", { className: css.row, children: [_jsx("span", { children: t('balance') }), signedIn && wallets !== undefined && wallets.length > 0
                                ? _jsx("span", { className: css.amount, children: wallets.map(wallet => _jsx("span", { children: formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$') }, wallet.currency)) })
                                : !signedIn || details?.balance === undefined
                                    ? _jsx("span", { className: css.unavailable, children: t(!signedIn ? 'balanceSignedOut' : 'loading') })
                                    : platformLink(t('balanceUnavailable'), css.unavailableLink)] }), signedIn && showBonusRow && _jsxs(_Fragment, { children: [_jsx("div", { className: css.divider }), _jsxs("div", { className: css.row, children: [_jsx("span", { children: t('bonusBalance') }), _jsx("span", { className: css.bonusValue, children: bonusWallets.length > 0
                                            ? _jsx("span", { className: css.amount, children: bonusWallets.map(wallet => _jsx("span", { children: formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$') }, wallet.currency)) })
                                            : details?.balance === undefined
                                                ? _jsx("span", { className: css.unavailable, children: t('loading') })
                                                : platformLink(t('balanceUnavailable'), css.unavailableLink) })] })] }), _jsx("div", { className: css.divider }), _jsxs("div", { className: css.row, children: [_jsx("span", { className: css.secondary, children: t('more') }), _jsxs("div", { className: css.links, children: [platformLink(t('usage'), css.linkButton), _jsx("a", { className: `${css.linkButton} ${css.primary}`, href: state?.links.topUpUrl, "aria-disabled": state === undefined, target: "_blank", rel: "noreferrer", onClick: (event) => { if (openPlatformPage !== undefined && signedIn) {
                                            event.preventDefault();
                                            showPage(openPlatformPage, 'top-up');
                                        } }, children: t('topUp') })] })] })] })] }));
}
//# sourceMappingURL=AccountSection.js.map