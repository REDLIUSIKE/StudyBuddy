import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** One global balance action opens the retained recharge flow directly. */
import { Button, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { moneyText } from "./account-controller.js";
import css from './WalletButton.module.css';
export function WalletButton({ useAccount, openRecharge, t }) {
    const state = useAccount(value => value);
    return _jsxs(Button, { size: "sm", variant: "ghost", className: css.trigger, disabled: state.scope === null, title: state.stale || state.status === 'error' ? t('stale') : t('recharge'), onClick: openRecharge, children: [_jsx("span", { className: css.label, children: t('wallet') }), _jsx("span", { className: css.amount, children: moneyText(state.summary?.availableBalance) }), _jsx(IconChevronDownOutlineRegular, { size: 12 })] });
}
//# sourceMappingURL=WalletButton.js.map