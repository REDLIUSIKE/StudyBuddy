/** Private search wire contract. A decoded UUID is identity, never authorization. */
declare const searchOperationBrand: unique symbol;
export type SearchOperationIdV1 = string & {
    readonly [searchOperationBrand]: 'SearchOperationIdV1';
};
export type SearchStateV1 = 'reserved' | 'dispatched' | 'unknown' | 'completed' | 'empty' | 'failed' | 'result_expired';
export type ToolSearchRequestV1 = Readonly<{
    operationId: SearchOperationIdV1;
    textQuery: string;
    maxResults: number;
}>;
export type ToolSearchSourceV1 = Readonly<{
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
    chunks: readonly string[];
}>;
export type ToolSearchResultV1 = Readonly<{
    operationId: SearchOperationIdV1;
    state: SearchStateV1;
    sources: readonly ToolSearchSourceV1[];
    truncated: boolean;
    chargeCny: string;
    resultExpiresAt: string | null;
}>;
export declare function parseToolSearchRequestV1(value: unknown): ToolSearchRequestV1;
export declare function parseToolSearchResultV1(value: unknown): ToolSearchResultV1;
export {};
