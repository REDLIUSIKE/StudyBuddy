import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target } from '@studybuddy/contracts';
export interface CanvasController {
    readonly id: string;
    readonly owned?: boolean;
    ready(): Promise<void>;
    state(): Promise<{
        canvasId: string;
        revision: number;
    }>;
    flush(): Promise<void>;
    command?(name: 'generationStatus' | 'cancelGeneration', args: Record<string, string>, signal: AbortSignal): Promise<unknown>;
    close(): Promise<void>;
}
export interface CanvasLease {
    readonly controller: CanvasController;
    state(): ReturnType<CanvasController['state']>;
    release(): Promise<void>;
}
interface Options {
    assert(caller: Caller): void;
    find(caller: Caller, target: Target): Promise<CanvasController | null>;
    create(caller: Caller, target: Target): Promise<CanvasController>;
}
/** One controller per account/document. Releases preserve common pages until an explicit handoff or logout. */
export declare class CapabilityCanvasViews {
    private readonly options;
    private readonly rows;
    private closing;
    constructor(options: Options);
    private assert;
    acquire(caller: Caller, target: Target): Promise<CanvasLease>;
    handoff(caller: Caller, target: Target, successorRef?: string): Promise<void>;
    close(): Promise<void>;
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=views.d.ts.map