export type MyAiTab = 'profile' | 'sources' | 'models' | 'leaderboard';
interface ViewState {
    tab: MyAiTab;
    walletOpen: boolean;
    rechargeOpen: boolean;
    sourceEditorOpen: boolean;
    usageKind: 'platform' | 'user_api';
}
export declare function createMyAiViewStore(): import("@deepseek-ai/dsh-client-store").EngineStoreHandle<ViewState, {
    selectTab: (draft: ViewState, tab: MyAiTab) => void;
    setWalletOpen: (draft: ViewState, open: boolean) => void;
    setRechargeOpen: (draft: ViewState, open: boolean) => void;
    setSourceEditorOpen: (draft: ViewState, open: boolean) => void;
    setUsageKind: (draft: ViewState, kind: ViewState["usageKind"]) => void;
    resetForScope: (draft: ViewState) => ViewState & {
        tab: string;
        walletOpen: boolean;
        rechargeOpen: boolean;
        sourceEditorOpen: boolean;
        usageKind: string;
    };
}>;
export {};
//# sourceMappingURL=view-store.d.ts.map