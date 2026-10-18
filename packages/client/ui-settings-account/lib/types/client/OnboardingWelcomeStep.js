import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { OnboardingIllustration } from "./OnboardingIllustration.js";
import art from './assets/onboarding-welcome.png';
import artDark from './assets/onboarding-welcome-dark.png';
import artZh from './assets/onboarding-welcome-zh.png';
import artZhDark from './assets/onboarding-welcome-zh-dark.png';
import css from './DesktopOnboarding.module.css';
/** @param props - localized content, focus target and navigation. @returns the welcome step. */
export function OnboardingWelcomeStep({ t, locale, heading, busy, onStart }) {
    return _jsxs("div", { className: `${css.content} ${css.welcome}`, children: [_jsxs("div", { className: css.copy, children: [_jsxs("h1", { id: "desktop-onboarding-title", ref: heading, tabIndex: -1, children: [t('onboardingWelcome'), " ", _jsx("em", { className: css.brand, children: t('onboardingBrand') })] }), _jsx("p", { className: css.heroDescription, children: t('onboardingIntroduction') }), _jsx(Button, { variant: "primary", className: `${css.action} ${css.start}`, disabled: busy, onClick: onStart, children: t('onboardingStart') })] }), _jsx("div", { className: css.welcomeIllustration, "aria-hidden": "true", children: _jsx(OnboardingIllustration, { className: css.welcomeArtwork, src: locale === 'zh' ? artZh : art, darkSrc: locale === 'zh' ? artZhDark : artDark }) })] });
}
//# sourceMappingURL=OnboardingWelcomeStep.js.map