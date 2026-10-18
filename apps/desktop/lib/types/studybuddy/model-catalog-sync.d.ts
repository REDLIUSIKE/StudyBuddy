/** Main-owned refresh of approved catalogs; credentials and model admission stay in their existing owners. */
import type { OwnedScope } from '@studybuddy/contracts';
interface SyncResult {
    schemaVersion: 1;
    records: readonly {
        toolId: string;
        state: string;
        catalogRevision: string | null;
        errorCode: string | null;
    }[];
}
interface Dependencies {
    scope(): OwnedScope | null;
    platform(scope: OwnedScope): Promise<void>;
    tools(scope: OwnedScope): Promise<SyncResult>;
    changed(scope: OwnedScope): void;
    failed(source: 'platform' | 'tools'): void;
    schedule(callback: () => void, delay: number): () => void;
}
/** Poll only the current account, retry independent authorities, and await owned work on shutdown. */
export declare class ModelCatalogSync {
    private readonly deps;
    private stopped;
    private cancel;
    private pending;
    constructor(deps: Dependencies);
    /** Start tools immediately; startup can retain ownership of the first platform setup. */
    start(options?: {
        platformAlreadyLoading?: boolean;
    }): void;
    private arm;
    private current;
    private refresh;
    /** Cancel future work and wait for the current account-fenced refresh to settle. */
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=model-catalog-sync.d.ts.map