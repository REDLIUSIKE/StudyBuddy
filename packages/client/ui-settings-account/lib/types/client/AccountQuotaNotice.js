import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Account-owned take-over of the frame-wide quota notice for account balances. */
import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Toast, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * @param props - the claimed notice, account state, and the shared Platform page channel.
 * @returns the balance Modal, nothing while awaiting account state or a Platform page's return, or the fallback Toast.
 */
export function AccountQuotaNotice({ matched, openPlatformPage, useAccount, usePlatformPage, t }) {
    const { dismiss, keepOpen, message } = matched;
    const accountStatus = useAccount(snapshot => snapshot.view?.status);
    const accountFailed = useAccount(snapshot => snapshot.failed);
    const signedIn = accountStatus === 'credential-stored';
    const platformPage = usePlatformPage(current => current);
    const [opened, setOpened] = useState(false);
    const previousSignedIn = useRef(signedIn);
    // Both claims are tied to this entry's lifetime: an unmount that the notice
    // never asked for (a higher-priority chain entry, plugin reload, or a crash)
    // must not strand the hold or leave the shared page mounted.
    const releaseHold = useRef(undefined);
    const releasePage = useRef(undefined);
    const releaseClaims = () => {
        releasePage.current?.();
        releasePage.current = undefined;
        releaseHold.current?.();
        releaseHold.current = undefined;
    };
    useEffect(() => releaseClaims, []);
    useEffect(() => {
        // The notice outlives the panel that raised it, so only a real sign-out takes
        // the balance surface down; the first, still unloaded snapshot must not.
        if (previousSignedIn.current && !signedIn) {
            releaseClaims();
            dismiss();
        }
        previousSignedIn.current = signedIn;
    }, [dismiss, signedIn]);
    // Await the first account snapshot without letting a Toast timer discard the
    // notice before the native account action becomes available. A terminal stream
    // failure ends that wait and leaves the generic warning available.
    if (accountStatus === undefined && !accountFailed && openPlatformPage !== undefined)
        return null;
    // Signed out, unavailable, or without the native host, use generic notice copy.
    if (!signedIn || openPlatformPage === undefined) {
        return _jsx(Toast, { text: message, icon: _jsx(IconWarningOutlineRegular, { size: 18 }), onDone: dismiss });
    }
    // Defer the Modal until the native page closes; do not mount hidden focus or
    // Escape handlers under the opaque view.
    if (opened || platformPage !== null)
        return null;
    return _jsx(Modal, { open: true, title: t('quotaTitle'), closeLabel: t('close'), onClose: dismiss, description: t('quotaDescription'), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: dismiss, children: t('cancel') }), _jsx(Button, { variant: "primary", onClick: () => {
                        // Retain the notice before its page mounts; a later failure would
                        // otherwise republish it and remount this entry.
                        releaseHold.current = keepOpen();
                        releasePage.current = openPlatformPage('top-up', () => { releasePage.current = undefined; dismiss(); });
                        setOpened(true);
                    }, children: t('quotaTopUp') })] }) });
}
//# sourceMappingURL=AccountQuotaNotice.js.map