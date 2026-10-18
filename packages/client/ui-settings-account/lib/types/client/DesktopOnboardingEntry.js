import { jsx as _jsx } from "react/jsx-runtime";
/** Framework-hook projection into the desktop introduction's pure view. */
import { useEffect, useLayoutEffect, useState } from 'react';
import { OnboardingSurface } from "./OnboardingSurface.js";
import { DesktopOnboarding } from "./DesktopOnboarding.js";
/**
 * Read shared state through framework hooks; sessions do not control activation.
 * @param props - shell overlay bindings and account-owned actions.
 * @returns the unfinished flow, retained briefly after successful completion unless motion is reduced.
 */
export function DesktopOnboardingEntry({ useOnboarding, useAccount, ...props }) {
    const locale = props.t('onboardingArtworkLocale');
    const state = useOnboarding(value => value);
    const account = useAccount(value => value);
    useLayoutEffect(() => {
        if (!state.visible)
            return;
        const bridge = globalThis.dshOnboarding;
        bridge?.setActive(true);
        return () => { bridge?.setActive(false); };
    }, [state.visible]);
    const [lastVisible, setLastVisible] = useState(state.visible ? state : null);
    const done = !state.visible && state.progress.step === 'done'
        && account.view?.status === 'credential-stored';
    const pendingCompletion = done && state.status === 'saving';
    const completed = done && state.status === 'ready';
    const exiting = completed && lastVisible !== null
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    useLayoutEffect(() => {
        if (state.visible)
            setLastVisible(state);
        else if (!completed && !pendingCompletion)
            setLastVisible(null);
    }, [state, completed, pendingCompletion]);
    useEffect(() => {
        if (!exiting)
            return;
        // Matches OnboardingSurface's exit animation; cleanup also covers sign-out.
        const timer = window.setTimeout(() => { setLastVisible(null); }, 180);
        return () => { window.clearTimeout(timer); };
    }, [exiting]);
    const displayed = state.visible ? state : exiting || pendingCompletion ? lastVisible : null;
    if (displayed === null)
        return state.status === 'loading'
            ? _jsx(OnboardingSurface, { children: _jsx("div", { role: "status", children: props.t('onboardingLoading') }) }) : null;
    return _jsx(DesktopOnboarding, { ...props, locale: locale, state: pendingCompletion ? { ...displayed, status: 'saving' } : displayed, account: account, exiting: exiting });
}
//# sourceMappingURL=DesktopOnboardingEntry.js.map