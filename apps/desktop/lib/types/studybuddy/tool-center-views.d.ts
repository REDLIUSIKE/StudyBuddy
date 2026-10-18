import type { BrowserWindow, IpcMainInvokeEvent, Session, WebContentsView, WebContentsViewConstructorOptions } from 'electron';
import type { AiAccountSummary, EmbeddedTheme, OwnedScope, ToolPageState, ToolSurfaceBounds, ToolViewLease, ToolSurfaceTarget } from '@studybuddy/contracts';
import type { VerifiedNativeRuntime } from './trusted-native-runtime.ts';
interface ViewDependencies {
    scope(): OwnedScope | null | undefined;
    owner(): BrowserWindow | undefined;
    runtime(): Promise<VerifiedNativeRuntime>;
    create(options: WebContentsViewConstructorOptions): WebContentsView;
    session(partition: string): Session;
    preload: string;
    summary?(scope: OwnedScope): Promise<AiAccountSummary | null>;
    invalidated?(lease: ToolViewLease): void;
    released?(lease: ToolViewLease): void;
}
export interface ToolViewRecord {
    target: ToolSurfaceTarget;
    lease: ToolViewLease;
    window: BrowserWindow;
    view: WebContentsView;
    browserSession: Session;
    state: ToolPageState;
    attached: boolean;
    visible: boolean;
    bounds: ToolSurfaceBounds;
    summaryRevision: number;
    off: () => void;
}
/**
 * @param value Viewport CSS rectangle.
 * @param zoom Parent renderer zoom.
 * @param content Electron content DIP limits.
 * @returns Clamped DIP bounds without another DPR multiplication.
 */
export declare function toolSurfaceBounds(value: unknown, zoom: number, content: {
    width: number;
    height: number;
}): ToolSurfaceBounds;
export declare class ToolCenterViews {
    private readonly dependencies;
    private readonly rows;
    private pending;
    private epoch;
    private disposed;
    constructor(dependencies: ViewDependencies);
    acquire(scope: OwnedScope, target?: ToolSurfaceTarget): Promise<ToolViewLease>;
    private create;
    get(id: unknown): ToolViewRecord;
    checked(event: IpcMainInvokeEvent, id?: unknown): ToolViewRecord;
    private publish;
    resize(id: string, value: ToolSurfaceBounds): Promise<void>;
    setVisible(id: string, visible: boolean): Promise<void>;
    setTheme(id: string, value: EmbeddedTheme): Promise<void>;
    private readSummary;
    /** Summary readback does not invalidate tool inventories. Omitted summaries signal a configuration change. */
    refresh(scope: OwnedScope, accountSummary?: AiAccountSummary | null): void;
    release(id: string): Promise<void>;
    revoke(): Promise<void>;
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=tool-center-views.d.ts.map