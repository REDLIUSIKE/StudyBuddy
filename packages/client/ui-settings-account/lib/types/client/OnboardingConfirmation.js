import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Credit and setup confirmations with contained keyboard focus. */
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './DesktopOnboarding.module.css';
/** @param props - confirmation action, localized copy and navigation callbacks. @returns a focus-contained dialog. */
export function OnboardingConfirmation({ kind, t, busy, canRecharge, onClose, onContinueSetup, onContinue, onRecharge, onSkip }) {
    const credit = kind !== 'skip';
    const title = t(credit ? 'onboardingNoCreditTitle' : 'onboardingSkipTitle');
    return _jsx(Modal, { open: true, headless: true, backdropBlur: false, title: title, onClose: onClose, children: _jsxs("div", { className: css.confirmation, children: [_jsxs("div", { className: css.confirmationHeading, children: [_jsx("h2", { children: title }), _jsx("button", { type: "button", className: css.confirmationClose, "aria-label": t('close'), onClick: onClose, children: _jsx(IconCloseOutlineRegular, { size: 14 }) })] }), _jsx("p", { children: t(credit ? 'onboardingNoCreditDescription' : 'onboardingSkipDescription') }), _jsxs("div", { className: css.confirmationActions, children: [_jsx(Button, { className: css.dialogButton, variant: "outline", disabled: busy, onClick: kind === 'credit-skip' ? onSkip : kind === 'credit' ? onContinue : onContinueSetup, children: t(credit ? 'onboardingUnderstood' : 'onboardingKeepSetting') }), _jsx(Button, { className: css.dialogButton, variant: "primary", disabled: busy || (credit && !canRecharge), onClick: credit ? onRecharge : onSkip, children: t(credit ? 'onboardingGoTopUp' : 'onboardingEnter') })] })] }) });
}
//# sourceMappingURL=OnboardingConfirmation.js.map