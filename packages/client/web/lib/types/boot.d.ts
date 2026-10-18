import type { ClientModuleCreateOptions } from '@deepseek-ai/dsh-client-modules/client';
import './base.css';
/** Module transport hook replaced by jsdom tests. */
export type BootSeams = Pick<ClientModuleCreateOptions, 'loadBundle'>;
/** Browser boot entry consumed by `apps/web`. */
export declare class AppWebEntry {
    private readonly container;
    private readonly seams;
    private readonly page;
    private ctx;
    private stopDragRecall;
    private modules;
    private manifest;
    /**
     * Draw the boot page; {@link run} starts the loader.
     * @param container - Application mount point.
     * @param seams - Optional module transport replacement.
     */
    constructor(container: HTMLElement, seams?: BootSeams);
    /**
     * Load and activate every client entry, then hand the mount point to the
     * UI renderer. Plugin failures remain visible on the boot page.
     * @param onFailure - Optional carrier-owned fatal presentation; keeps the boot page visible.
     * @returns Resolves after application mount or failure reporting.
     */
    run(onFailure?: (reason: unknown) => void): Promise<void>;
    /** Dispose the client plugin tree and whichever page owns the mount point. */
    dispose(): Promise<void>;
    /** Prefetch stage-one bundles and their dynamic requests before concurrent plugin imports. */
    private prefetchImmediateTier;
}
//# sourceMappingURL=boot.d.ts.map