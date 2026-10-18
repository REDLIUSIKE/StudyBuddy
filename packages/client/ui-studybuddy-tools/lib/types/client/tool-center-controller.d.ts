import type { OwnedScope, ToolViewLease, EmbeddedTheme, ToolSurfaceBounds } from '@studybuddy/contracts';
export interface ToolsSurfaceHost {
    acquire(target?: 'tools' | 'labs'): Promise<ToolViewLease>;
    release(lease: string): Promise<void>;
    resize(lease: string, bounds: ToolSurfaceBounds): Promise<void>;
    setVisible(lease: string, visible: boolean): Promise<void>;
    setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
    subscribeInvalid(listener: (lease: string) => void): () => void;
}
export interface ToolCenterSnapshot {
    scope: OwnedScope | null;
    lease: ToolViewLease | null;
    busy: boolean;
    errorCode: string | null;
}
export declare class ToolCenterController {
    #private;
    private readonly host;
    constructor(host: ToolsSurfaceHost | undefined);
    getSnapshot: () => ToolCenterSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    private report;
    setScope(scope: OwnedScope | null): void;
    acquire: () => Promise<void>;
    /** Serialized visibility/bounds updates; stale queued projections cannot reattach old views. */
    project: (value: {
        bounds: ToolSurfaceBounds | null;
        visible: boolean;
    }) => Promise<void>;
    setTheme: (theme: EmbeddedTheme) => Promise<void>;
    retry: () => Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=tool-center-controller.d.ts.map