import type { RechargeSnapshot } from './recharge-controller.ts';
import { type AccountSnapshot } from './account-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
export declare function RechargeDialog({ state, account, actions, open, onClose, t }: {
    state: RechargeSnapshot;
    account: AccountSnapshot;
    actions: AccountFace['recharge'];
    open: boolean;
    onClose: () => void;
    t: (key: AccountLocaleKey) => string;
}): import("react").JSX.Element;
//# sourceMappingURL=RechargeDialog.d.ts.map