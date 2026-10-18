import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { hasOnboardingCredit } from "./onboarding-balance.js";
import { OnboardingSurface } from "./OnboardingSurface.js";
import { OnboardingWelcomeStep } from "./OnboardingWelcomeStep.js";
import { OnboardingCreditStep } from "./OnboardingCreditStep.js";
import { OnboardingPurposeStep } from "./OnboardingPurposeStep.js";
import { OnboardingProcessStep } from "./OnboardingProcessStep.js";
import { OnboardingConfirmation } from "./OnboardingConfirmation.js";
import backIcon from './assets/onboarding-back.svg';
import css from './DesktopOnboarding.module.css';
const onboardingPages = {
    welcome: 'onboarding_welcome',
    credit: 'onboarding_recharge',
    purpose: 'onboarding_use_case',
    process: 'onboarding_process',
    done: undefined,
};
/**
 * @param props - durable choices, account state, localized copy and the shared recharge page channel.
 * @returns the active first-run page.
 */
export function DesktopOnboarding({ state, account, openPlatformPage, update, complete, retry, t, locale, track, exiting = false, }) {
    const [dialog, setDialog] = useState(null);
    const heading = useRef(null);
    const page = useRef(null);
    // The one shared native host owns the recharge page; this flow holds only its
    // own request, released when the flow unmounts.
    const releaseRecharge = useRef(undefined);
    useEffect(() => () => { releaseRecharge.current?.(); releaseRecharge.current = undefined; }, []);
    const progress = state.progress;
    const targetStep = progress.step;
    const [step, setStep] = useState(targetStep);
    const busy = state.status === 'loading' || state.status === 'saving' || exiting || step !== targetStep;
    useEffect(() => {
        if (step === targetStep)
            return;
        const element = page.current;
        if (!state.visible || element?.animate === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setStep(targetStep);
            return;
        }
        const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 40, fill: 'forwards', easing: 'ease-out' });
        void animation.finished.then(() => { setStep(targetStep); }, (_error) => {
            // A newer step or unmount cancels this visual transition.
        });
        return () => { animation.cancel(); };
    }, [targetStep, step, state.visible]);
    useEffect(() => { heading.current?.focus(); }, [step]);
    const pageName = onboardingPages[step];
    const shownPage = useRef(null);
    useEffect(() => {
        if (!state.visible || pageName === undefined || exiting) {
            shownPage.current = null;
            return;
        }
        if (state.status === 'loading')
            return;
        if (shownPage.current === pageName)
            return;
        shownPage.current = pageName;
        track?.('onboarding_page_view', { page_name: pageName });
    }, [state.visible, state.status, step, pageName, exiting, track]);
    const shownPopup = useRef(null);
    useEffect(() => {
        if (dialog === null || !state.visible || state.status === 'loading' || step === 'done') {
            shownPopup.current = null;
            return;
        }
        if (shownPopup.current === dialog)
            return;
        shownPopup.current = dialog;
        track?.('onboarding_popup_view', { popup_name: dialog === 'skip' ? 'skip_setting' : 'skip_charge' });
    }, [dialog, track, state.visible, state.status, step]);
    const popupClick = (button_name) => {
        track?.('onboarding_popup_click', { popup_name: dialog === 'skip' ? 'skip_setting' : 'skip_charge', button_name });
    };
    if (state.visible && state.status === 'loading')
        return _jsx(OnboardingSurface, { children: _jsx("div", { className: css.loading, role: "status", children: t('onboardingLoading') }) });
    if (!state.visible || pageName === undefined)
        return null;
    const click = (button_name) => {
        const selected_content = step === 'purpose' && progress.purpose !== null ? { office: 'office', development: 'code', both: 'code_office' }[progress.purpose]
            : step === 'process' && progress.process !== null ? { compact: 'focus_result', standard: 'key_detail', detailed: 'full_process' }[progress.process] : undefined;
        track?.('onboarding_page_click', { page_name: pageName, button_name, ...selected_content === undefined ? {} : { selected_content } });
    };
    const go = (next) => { void update({ step: next }); };
    const canRecharge = openPlatformPage !== undefined;
    const recharge = () => {
        setDialog(null);
        releaseRecharge.current?.();
        // Every control that reaches this is disabled without the callback.
        releaseRecharge.current = openPlatformPage?.('top-up', () => { releaseRecharge.current = undefined; });
    };
    const later = () => {
        const balance = account.details?.balance;
        if (balance?.status === 'ready' && !hasOnboardingCredit(balance))
            setDialog('credit');
        else
            go('purpose');
    };
    const purposeNext = () => {
        if (progress.purpose === 'office')
            void complete('completed');
        else
            go('process');
    };
    return _jsxs(_Fragment, { children: [_jsx(OnboardingSurface, { exiting: exiting, children: _jsxs("section", { ref: page, className: `${css.page} ${dialog !== null ? css.blurred : ''}`, "data-desktop-onboarding": step, lang: locale, "aria-labelledby": "desktop-onboarding-title", "aria-busy": busy, children: [step === 'welcome' && _jsx(OnboardingWelcomeStep, { t: t, locale: locale, heading: heading, busy: busy, onStart: () => { click('next'); go('credit'); } }), step === 'credit' && _jsx(OnboardingCreditStep, { t: t, locale: locale, heading: heading, busy: busy, funded: state.creditFunded, canRecharge: canRecharge, onContinue: () => { click('continue'); go('purpose'); }, onRecharge: () => { click('charge'); recharge(); }, onLater: () => { click('later'); later(); } }), step === 'purpose' && _jsx(OnboardingPurposeStep, { t: t, heading: heading, busy: busy, purpose: progress.purpose, onSelect: (purpose) => { void update({ purpose }); }, onContinue: () => { click('next'); purposeNext(); } }), step === 'process' && _jsx(OnboardingProcessStep, { t: t, heading: heading, busy: busy, process: progress.process, onSelect: (process) => { void update({ process }); }, onComplete: () => { click('next'); void complete('completed'); } }), state.error !== null && _jsxs("div", { className: css.status, role: "alert", children: [t('onboardingSaveFailed'), _jsx(Button, { disabled: busy, onClick: () => { void retry(); }, children: t('onboardingRetry') })] }), step !== 'welcome' && _jsxs("footer", { className: css.navigation, children: [_jsxs("button", { type: "button", disabled: busy, onClick: () => { click('back'); go(step === 'credit' ? 'welcome' : step === 'purpose' ? 'credit' : 'purpose'); }, children: [_jsx("span", { className: css.backIcon, style: { maskImage: `url(${backIcon})` }, "aria-hidden": "true" }), t('onboardingBack')] }), _jsx("button", { type: "button", disabled: busy, onClick: () => { click('skip'); setDialog(step === 'credit' ? 'credit-skip' : 'skip'); }, children: t('onboardingSkip') })] })] }, step) }), dialog !== null && _jsx(OnboardingConfirmation, { kind: dialog, t: t, busy: busy, canRecharge: canRecharge, onClose: () => { popupClick('close'); setDialog(null); }, onContinueSetup: () => { popupClick('setting'); setDialog(null); }, onContinue: () => { popupClick('know'); setDialog(null); go('purpose'); }, onRecharge: () => { popupClick('charge'); recharge(); }, onSkip: () => { popupClick(dialog === 'skip' ? 'enter' : 'know'); void complete('skipped').then(() => { setDialog(null); }); } })] });
}
//# sourceMappingURL=DesktopOnboarding.js.map