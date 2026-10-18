/** Account/plugin owners cancel their own work; prepared pages retain their existing owners. */
export interface PagePreloadTask {
    id: string;
    priority: number;
    prepare(): Promise<unknown>;
}
/** One idle queue per renderer: first screen first, then bounded, spaced preparation. */
export declare class PagePreloader {
    #private;
    register(tasks: readonly PagePreloadTask[]): () => void;
    private clearScheduled;
    private schedule;
    private run;
}
/** Register fixed pages for the current scope; cancel on scope replacement and plugin disposal. */
export declare const preloadPages: (tasks: readonly PagePreloadTask[]) => (() => void);
//# sourceMappingURL=page-preload.d.ts.map