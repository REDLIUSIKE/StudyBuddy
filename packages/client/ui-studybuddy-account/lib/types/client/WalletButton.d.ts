import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import { type AccountSnapshot } from './account-controller.ts';
import type { AccountLocaleKey } from './locales.ts';
export declare function WalletButton({ useAccount, openRecharge, t }: {
    useAccount: SnapshotSelectorHook<AccountSnapshot>;
    openRecharge: () => void;
    t: (key: AccountLocaleKey) => string;
}): import("react").JSX.Element;
//# sourceMappingURL=WalletButton.d.ts.map