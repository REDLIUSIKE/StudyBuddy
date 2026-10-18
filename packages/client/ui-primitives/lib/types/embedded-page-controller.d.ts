/** Account-scoped page leases; the native owner wipes partitions on revocation. */
export interface EmbeddedPageScope {
    accountId: string;
    generation: number;
}
export interface EmbeddedPageLease {
    lease: string;
    partition: string;
    entryUrl: string;
    scope: EmbeddedPageScope;
}
export interface EmbeddedPageTheme {
    mode: 'light' | 'dark';
    variables: Record<string, string>;
}
export interface EmbeddedPageHost<T extends string> {
    acquire(target: T): Promise<EmbeddedPageLease>;
    release(lease: string): Promise<void>;
    setTheme(lease: string, theme: EmbeddedPageTheme): Promise<void>;
    setVisible?(lease: string, visible: boolean): Promise<void>;
    subscribeInvalid?(listener: (id: string) => void): () => void;
}
export interface EmbeddedPageSnapshot {
    scope: EmbeddedPageScope | null;
    lease: EmbeddedPageLease | null;
    busy: boolean;
    errorCode: string | null;
}
export declare class EmbeddedPageController<T extends string> {
    #private;
    readonly target: T;
    private readonly host;
    constructor(target: T, host: EmbeddedPageHost<T> | undefined);
    getSnapshot: () => EmbeddedPageSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Re-read lifecycle authority after awaits and external observer callbacks. */
    private active;
    setScope(scope: EmbeddedPageScope | null): void;
    acquire: () => Promise<void>;
    private acquireLease;
    setTheme: (theme: EmbeddedPageTheme) => Promise<void>;
    setVisible: (visible: boolean) => Promise<void>;
    reportFailure: (errorCode: string) => void;
    retry: () => Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=embedded-page-controller.d.ts.map