export declare const DOMESTIC_MODEL_BRANDS: readonly ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo'];
/** Historical display identity; model invocation membership is validated separately. */
export type ModelBrand = string;
export type ModelFootprint = Readonly<{
    id: string;
    displayName: string;
    brand: ModelBrand;
    totalTokens: string;
}>;
export type CapabilityFootprint = Readonly<{
    id: string;
    displayName: string;
    kind: "skill" | "zhilian" | "campus_knowledge";
}>;
export type AiActivityMetrics = Readonly<{
    totalTokens: string;
    peakDayTokens: string;
    currentStreakDays: number;
    longestStreakDays: number;
    activeDays: number;
}>;
export type AiActivityDay = Readonly<{
    date: string;
    totalTokens: string;
    intensity: 0 | 1 | 2 | 3 | 4;
}>;
export type AiActivityFootprints = Readonly<{
    models: ModelFootprint[];
    capabilities: CapabilityFootprint[];
}>;
export type AiActivitySnapshot = Readonly<{
    snapshotVersion: string;
    freshness: "fresh" | "stale";
    metrics: AiActivityMetrics;
    days: ReadonlyArray<AiActivityDay>;
    footprints: AiActivityFootprints;
}>;
export type AiActivityShareRequest = Readonly<{
    snapshotVersion: string;
}>;
export type TokenShareSnapshot = Readonly<{
    avatarUrl: string;
    nickname: string;
    publicId: string;
    snapshotVersion: string;
    metrics: AiActivityMetrics;
    days: ReadonlyArray<AiActivityDay>;
    footprints: AiActivityFootprints;
}>;
export declare function parseAiActivitySnapshot(value: unknown): AiActivitySnapshot;
export declare function parseAiActivityShareRequest(value: unknown): AiActivityShareRequest;
export declare function parseTokenShareSnapshot(value: unknown): TokenShareSnapshot;
