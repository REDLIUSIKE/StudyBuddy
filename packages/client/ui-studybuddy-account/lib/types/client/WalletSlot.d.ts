/** One global wallet and recharge dialog over the same account Controller and view store. */
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { AccountFace } from './face.ts';
import type { createMyAiViewStore } from './view-store.ts';
export type WalletSlotProps = PropsRuntime<'shell.actions'> & PropsLocale<'studybuddy.account'> & InjectFace<AccountFace> & PropsStore<ReturnType<typeof createMyAiViewStore>>;
export declare function WalletSlot({ t, useAccount, useRecharge, useStore, actions, openRecharge, recharge }: WalletSlotProps): import("react").JSX.Element;
//# sourceMappingURL=WalletSlot.d.ts.map