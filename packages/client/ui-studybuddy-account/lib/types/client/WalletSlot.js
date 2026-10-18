import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { WalletButton } from "./WalletButton.js";
import { RechargeDialog } from "./RechargeDialog.js";
export function WalletSlot({ t, useAccount, useRecharge, useStore, actions, openRecharge, recharge }) {
    const open = useStore(value => value.rechargeOpen), state = useRecharge(value => value), account = useAccount(value => value);
    return _jsxs(_Fragment, { children: [_jsx(WalletButton, { t: t, useAccount: useAccount, openRecharge: openRecharge }), _jsx(RechargeDialog, { t: t, state: state, account: account, actions: recharge, open: open, onClose: () => { actions.setRechargeOpen(false); } })] });
}
//# sourceMappingURL=WalletSlot.js.map