import { jsx as _jsx } from "react/jsx-runtime";
import { PlatformOverlay } from "./PlatformOverlay.js";
/**
 * @param props - the native commands, the live page request, and its dismissal.
 * @returns the native Platform container, or null while no page is requested.
 */
export function AccountPlatformHost({ platform, usePage, closePage, t }) {
    const claim = usePage(current => current);
    if (claim === null)
        return null;
    return _jsx(PlatformOverlay, { bridge: platform, page: claim.page, backLabel: t('backToHarness'), loadingLabel: t('loading'), failureLabel: t('platformFailed'), retryLabel: t('platformRetry'), onClose: closePage });
}
//# sourceMappingURL=AccountPlatformHost.js.map