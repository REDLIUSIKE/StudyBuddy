import type { Session, WebContentsView, WebPreferences } from 'electron';
import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target } from '@studybuddy/contracts';
import type { AigcDomainRuntime } from '../aigc-domain-runtime.ts';
import type { CanvasController } from './views.ts';
interface Options {
    runtime: AigcDomainRuntime;
    assert(caller: Caller): void;
    directory(caller: Caller, target: Target, signal: AbortSignal): Promise<string>;
    create(options: {
        webPreferences: WebPreferences;
    }): WebContentsView;
    session(partition: string): Session;
}
/** Loads the existing canvas app using the same account runtime and Electron engine, without taking focus. */
export declare class AigcCanvasControllers {
    private readonly options;
    private readonly owned;
    private readonly views;
    constructor(options: Options);
    private read;
    private controller;
    find(caller: Caller, target: Target): Promise<CanvasController | null>;
    create(caller: Caller, target: Target): Promise<CanvasController>;
    close(): Promise<void>;
    open(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
}
export {};
//# sourceMappingURL=canvas-controller.d.ts.map