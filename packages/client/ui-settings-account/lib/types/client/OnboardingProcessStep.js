import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import compactIcon from './assets/onboarding-compact.svg';
import standardIcon from './assets/onboarding-standard.svg';
import detailedIcon from './assets/onboarding-detailed.svg';
import css from './DesktopOnboarding.module.css';
const options = [
    { value: 'compact', titleKey: 'onboardingCompact', descriptionKey: 'onboardingCompactDescription', icon: compactIcon, size: 40 },
    { value: 'standard', titleKey: 'onboardingStandard', descriptionKey: 'onboardingStandardDescription', icon: standardIcon, size: 36 },
    { value: 'detailed', titleKey: 'onboardingDetailed', descriptionKey: 'onboardingDetailedDescription', icon: detailedIcon, size: 36 },
];
/** @param props - selected detail, localized copy and persistence callbacks. @returns the process step. */
export function OnboardingProcessStep({ t, heading, busy, process, onSelect, onComplete }) {
    const onKeyDown = (event, value) => {
        if (busy)
            return;
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (direction === 0)
            return;
        event.preventDefault();
        const nextIndex = (options.findIndex(option => option.value === value) + direction + options.length) % options.length;
        const next = options[nextIndex];
        onSelect(next.value);
        event.currentTarget.parentElement?.querySelector(`[data-process="${next.value}"]`)?.focus();
    };
    return _jsxs("div", { className: `${css.content} ${css.process}`, children: [_jsxs("div", { className: css.copy, children: [_jsx("h1", { id: "desktop-onboarding-title", ref: heading, tabIndex: -1, children: t('onboardingProcess') }), _jsx("p", { className: css.subtitle, children: t('onboardingProcessDescription') })] }), _jsx("div", { className: css.processCards, role: "radiogroup", "aria-labelledby": "desktop-onboarding-title", children: options.map(option => _jsxs("button", { type: "button", role: "radio", "data-process": option.value, "aria-checked": process === option.value, tabIndex: process === option.value || (process === null && option.value === 'compact') ? 0 : -1, className: `${css.card} ${process === option.value ? css.selected : ''}`, "aria-disabled": busy, onClick: () => { if (!busy)
                        onSelect(option.value); }, onKeyDown: (event) => { onKeyDown(event, option.value); }, children: [_jsx("span", { className: css.processIcon, children: _jsx("img", { src: option.icon, width: option.size, height: option.size, alt: "" }) }), _jsx("span", { className: css.cardTitle, children: t(option.titleKey) }), _jsx("span", { className: css.cardDescription, children: t(option.descriptionKey) })] }, option.value)) }), _jsx("div", { className: css.primaryAction, children: process !== null && _jsx(Button, { className: css.action, variant: "primary", "aria-disabled": busy, onClick: () => { if (!busy)
                        onComplete(); }, children: t('onboardingEnter') }) })] });
}
//# sourceMappingURL=OnboardingProcessStep.js.map