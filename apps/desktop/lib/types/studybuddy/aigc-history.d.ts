export interface AigcHistory {
    file: string;
    sha256: string;
    label: string;
    messages: unknown[];
    records: unknown[];
    allRecords: unknown[];
}
export declare function listAigcHistory(directory: string): Promise<{
    file: string;
    label: string;
    size: number;
}[]>;
export declare function readAigcHistory(directory: string, file: string): Promise<AigcHistory>;
/** Bounded historical text is durable model context, never an approval or an execution transcript. */
export declare function aigcHistoryContext(history: AigcHistory): string;
//# sourceMappingURL=aigc-history.d.ts.map