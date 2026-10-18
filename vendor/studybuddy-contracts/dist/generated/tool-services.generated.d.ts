export declare const TOOL_SERVICES: readonly [{
    readonly providerId: "kimi";
    readonly serviceId: "search_pro";
    readonly displayName: "Kimi Search Pro";
    readonly protocols: readonly ["moonshot_search_pro"];
    readonly profile: {
        readonly provider: "kimi";
        readonly serviceId: "search_pro";
        readonly name: "Kimi Search Pro";
        readonly summary: "搜索网页并返回来源、摘要与相关正文片段。";
        readonly tags: readonly ["联网搜索", "来源引用"];
        readonly inputs: readonly ["文字"];
        readonly outputs: readonly ["来源", "正文片段"];
        readonly source: "https://platform.kimi.com/docs/api/tools-search-pro";
    };
    readonly officialEvidence: readonly ["https://platform.kimi.com/docs/api/tools-search-pro", "https://platform.kimi.com/docs/pricing/websearch"];
    readonly clientMembership: readonly ["harness-search", "native-tools-search"];
    readonly pricing: {
        readonly kind: "request";
        readonly currency: "CNY";
        readonly unit: "request";
        readonly authority: "live-frozen-primary-backend-tool-service-config";
    };
}];
