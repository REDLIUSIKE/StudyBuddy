import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Work-purpose selection with controlled, independently selectable cards. */
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, FileTypeIcon, IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import officeIcon from './assets/onboarding-office.svg';
import codeIcon from './assets/onboarding-code.svg';
import css from './DesktopOnboarding.module.css';
/** @param props - selected purposes, localized copy and persistence callbacks. @returns the purpose step. */
export function OnboardingPurposeStep({ t, heading, busy, purpose, onSelect, onContinue }) {
    const selected = (value) => purpose === value || purpose === 'both';
    const toggle = (value) => {
        if (busy)
            return;
        const office = value === 'office' ? !selected('office') : selected('office');
        const development = value === 'development' ? !selected('development') : selected('development');
        onSelect(office && development ? 'both' : office ? 'office' : development ? 'development' : null);
    };
    return _jsxs("div", { className: `${css.content} ${css.purpose}`, children: [_jsxs("div", { className: css.copy, children: [_jsxs("h1", { id: "desktop-onboarding-title", ref: heading, tabIndex: -1, children: [t('onboardingPurposePrefix'), " ", _jsx("em", { className: css.brand, children: t('onboardingBrand') }), " ", t('onboardingPurposeSuffix')] }), _jsx("p", { className: css.subtitle, children: t('onboardingPurposeDescription') })] }), _jsx("div", { className: css.purposeCards, children: ['office', 'development'].map(value => _jsx(PurposeCard, { purpose: value, checked: selected(value), t: t, onToggle: () => { toggle(value); } }, value)) }), _jsx("div", { className: css.primaryAction, children: purpose !== null && _jsx(Button, { className: css.action, variant: "primary", "aria-disabled": busy, onClick: () => { if (!busy)
                        onContinue(); }, children: t('onboardingContinue') }) })] });
}
function PurposeCard({ purpose, checked, t, onToggle }) {
    const previous = useRef(checked);
    const [entering, setEntering] = useState(false);
    useLayoutEffect(() => {
        setEntering(checked && !previous.current);
        previous.current = checked;
    }, [checked]);
    const titleKey = purpose === 'office' ? 'onboardingOffice' : 'onboardingDevelopment';
    return _jsxs("div", { className: `${css.card} ${checked ? css.selected : ''} ${purpose === 'office' ? css.officeCard : ''}`, children: [_jsxs("div", { className: css.cardTop, children: [checked ? _jsx("span", { className: `${css.fileIcons} ${entering ? css.iconsEntering : ''}`, "aria-hidden": "true", children: (purpose === 'office' ? ['word', 'ppt', 'excel', 'pdf', 'image'] : ['typescript', 'javascript', 'sql', 'python', 'cpp'])
                            .map(kind => _jsx(FileTypeIcon, { kind: kind, size: 28 }, kind)) }) : _jsx("img", { src: purpose === 'office' ? officeIcon : codeIcon, width: 40, height: 40, alt: "" }), _jsxs("label", { className: css.cardCheckbox, children: [_jsx("input", { type: "checkbox", "aria-label": t(titleKey), checked: checked, onChange: onToggle }), _jsx("span", { className: css.indicator, "aria-hidden": "true", children: _jsx(IconCheckOutlineRegular, {}) })] })] }), _jsx("span", { className: css.cardTitle, children: t(titleKey) }), _jsx("span", { className: css.cardDescription, children: t(purpose === 'office' ? 'onboardingOfficeDescription' : 'onboardingDevelopmentDescription') })] });
}
//# sourceMappingURL=OnboardingPurposeStep.js.map