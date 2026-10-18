import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { OnboardingIllustration } from "./OnboardingIllustration.js";
import art from './assets/onboarding-recharge.png';
import artDark from './assets/onboarding-recharge-dark.png';
import artZh from './assets/onboarding-recharge-zh.png';
import artZhDark from './assets/onboarding-recharge-zh-dark.png';
import css from './DesktopOnboarding.module.css';
/** @param props - credit facts, localized content and recharge/navigation actions. @returns the credit step. */
export function OnboardingCreditStep({ t, locale, heading, busy, funded, canRecharge, onContinue, onRecharge, onLater }) {
    return _jsxs("div", { className: `${css.content} ${css.credit}`, children: [_jsx(OnboardingIllustration, { className: css.creditIllustration, src: locale === 'zh' ? artZh : art, darkSrc: locale === 'zh' ? artZhDark : artDark }), _jsxs("div", { className: css.copy, children: [_jsx("h1", { id: "desktop-onboarding-title", ref: heading, tabIndex: -1, children: t('onboardingCredit') }), _jsx("p", { className: css.heroDescription, children: t('onboardingCreditDescription') }), _jsxs("div", { className: css.creditActions, children: [_jsx(Button, { className: css.action, variant: "primary", disabled: busy || (!funded && !canRecharge), onClick: funded ? onContinue : onRecharge, children: t(funded ? 'onboardingContinue' : 'onboardingTopUp') }), _jsx(Button, { variant: "outline", className: `${css.action} ${css.laterAction}`, disabled: busy || (funded && !canRecharge), onClick: funded ? onRecharge : onLater, children: t(funded ? 'onboardingFundedTopUp' : 'onboardingLater') })] })] })] });
}
//# sourceMappingURL=OnboardingCreditStep.js.map