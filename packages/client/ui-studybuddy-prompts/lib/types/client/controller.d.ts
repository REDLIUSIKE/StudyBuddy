export interface PromptRecord {
    id: string;
    title: string;
    body: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    owned: boolean;
    sourceId: string | null;
}
export interface PromptHost {
    invoke(method: 'mine' | 'square' | 'save' | 'publish', args: readonly unknown[]): Promise<unknown>;
}
export interface PromptSnapshot {
    scope: string | null;
    items: readonly PromptRecord[];
    publicItems: readonly PromptRecord[];
    busy: readonly string[];
    error: string | null;
    failureKind: 'mine' | 'square' | 'save' | 'publish' | null;
    hasMore: boolean;
    squarePage: number;
    squareQuery: string;
}
/** React-free projection; account generations own all pending responses and retry identities. */
export declare class PromptController {
    private readonly host;
    private readonly state;
    private generation;
    private squareGeneration;
    private privateRevision;
    private publicRevision;
    private readonly retries;
    readonly getSnapshot: () => PromptSnapshot;
    readonly subscribe: (fn: () => void) => () => void;
    constructor(host: PromptHost | undefined);
    setScope(scope: string | null): void;
    loadMine(): Promise<void>;
    loadSquare(query?: string, page?: number): Promise<void>;
    save(input: {
        id: string;
        title: string;
        body: string;
        expectedRevision: number;
    }): Promise<PromptRecord>;
    publish(row: PromptRecord): Promise<PromptRecord>;
    dispose(): void;
    private requestId;
    private update;
    private run;
}
//# sourceMappingURL=controller.d.ts.map