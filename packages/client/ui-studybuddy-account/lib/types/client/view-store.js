/** Registration stores contain view state only; business facts remain in Controllers. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
export function createMyAiViewStore() {
    return defineStore({
        init: () => ({ tab: 'profile', walletOpen: false, rechargeOpen: false, sourceEditorOpen: false, usageKind: 'platform' }),
        actions: {
            selectTab: (draft, tab) => { draft.tab = tab; },
            setWalletOpen: (draft, open) => { draft.walletOpen = open; },
            setRechargeOpen: (draft, open) => { draft.rechargeOpen = open; draft.walletOpen = false; },
            setSourceEditorOpen: (draft, open) => { draft.sourceEditorOpen = open; },
            setUsageKind: (draft, kind) => { draft.usageKind = kind; },
            resetForScope: (draft) => Object.assign(draft, { tab: 'profile', walletOpen: false, rechargeOpen: false, sourceEditorOpen: false, usageKind: 'platform' }),
        },
    });
}
//# sourceMappingURL=view-store.js.map