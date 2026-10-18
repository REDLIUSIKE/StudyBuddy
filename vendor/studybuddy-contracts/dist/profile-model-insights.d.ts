export type ModelFunding = 'platform' | 'user_api' | 'unknown';
export type ModelInsightsPeriod = 'month' | '7d' | '30d' | 'all';
export type ProfileModelIntroduction = {
    provider: string;
    modelId: string;
    name: string;
    summary: string;
    tags: readonly string[];
    inputs: readonly string[];
    outputs: readonly string[];
    source: string;
};
export type ModelUsageQuantityTotal = {
    unit: 'character' | 'second';
    quantity: string | null;
    reportedRequests: number;
    pendingRequests: number;
};
export type ModelUsageTotals = {
    requests: number;
    reportedRequests: number;
    pendingRequests: number;
    input: string | null;
    output: string | null;
    total: string | null;
    cacheRead: string | null;
    cacheWrite: string | null;
    reasoning: string | null;
    chargedAmount: string | null;
    confirmedChargedAmount: string;
    unpricedRequests: number;
    nonTokenUsage?: ModelUsageQuantityTotal[];
};
export type ProfileModelUsage = {
    observedAt: string;
    period: ModelInsightsPeriod;
    timeZone: 'Asia/Shanghai';
    start: string | null;
    endExclusive: string;
    currency: 'CNY';
    models: {
        identity: string;
        providerId: string;
        modelId: string;
        modelName: string;
    }[];
    rows: {
        identity: string;
        providerId: string;
        modelId: string;
        modelName: string;
        funding: ModelFunding;
        usage: ModelUsageTotals;
    }[];
    quarantinedRequests: number;
    coverage: string[];
};
export type ProfileModelPriceTier = {
    label: string;
    condition: string;
    unit: 'million_tokens' | 'request';
    input: string | null;
    output: string | null;
    cacheRead: string | null;
    cacheWrite: string | null;
    cacheWrite1h: string | null;
    request: string | null;
};
export type ProfileModelMediaPrice = {
    label: string;
    condition: string;
    amount: string;
    unit: 'image' | 'million_output_tokens' | 'character' | 'second';
    ratePer?: number;
};
export type ProfileModelPrices = {
    observedAt: string;
    source: 'primary_backend_active_pricing';
    rows: {
        identity: string;
        providerId: string;
        providerName: string;
        modelId: string;
        modelName: string;
        status: 'confirmed' | 'unconfirmed';
        currency: 'CNY' | null;
        priceVersion: string | null;
        configurationVersion: string | null;
        tiers: ProfileModelPriceTier[];
        mediaCurrency?: 'CNY';
        mediaPrices?: ProfileModelMediaPrice[];
        profile?: ProfileModelIntroduction;
        catalogRevision?: string;
        catalogSourceSha256?: string;
    }[];
};
export declare function parseProfileModelUsage(v: unknown): ProfileModelUsage;
export declare function parseProfileModelPrices(v: unknown): ProfileModelPrices;
