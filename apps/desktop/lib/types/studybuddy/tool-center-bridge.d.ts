import type { IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { type SkillSafetyLabsMethod, type ToolNavigationNotice, type ToolViewLease } from '@studybuddy/contracts';
export interface SkillSafetyLabsBridge {
    invoke(owner: ToolViewLease, method: SkillSafetyLabsMethod, args: unknown[]): Promise<unknown>;
    release(owner: ToolViewLease): void;
}
import type { NativeAccountClient } from './native-account-client.ts';
import { ToolCenterViews } from './tool-center-views.ts';
/** @param path System picker result. @returns An absolute real directory without a linked ancestor. */
export declare function validateToolWorkingDirectory(path: string): Promise<string>;
export declare class ToolCenterBridge {
    private readonly views;
    private readonly native;
    private readonly picker;
    private readonly opener;
    private readonly navigate;
    private readonly safety?;
    private readonly grants;
    private readonly streams;
    private readonly subscriptions;
    constructor(views: ToolCenterViews, native: Pick<NativeAccountClient, 'invoke'> & Partial<Pick<NativeAccountClient, 'subscribeInstallEvents' | 'subscribeInstallStream'>>, picker: (window: BrowserWindow) => Promise<string | null>, opener: (url: string) => Promise<void>, navigate: (notice: ToolNavigationNotice) => void, safety?: SkillSafetyLabsBridge | undefined);
    state(event: IpcMainInvokeEvent): {
        owner: ToolViewLease;
        state: ReturnType<ToolCenterViews['checked']>['state'];
    };
    invoke(event: IpcMainInvokeEvent, id: unknown, method: unknown, args: unknown): Promise<unknown>;
    navigation(event: IpcMainInvokeEvent, id: unknown, target: unknown): void;
    subscribe(event: IpcMainInvokeEvent, id: unknown): Promise<void>;
    unsubscribe(event: IpcMainInvokeEvent, id: unknown): void;
    private stop;
    release(owner: ToolViewLease): void;
}
//# sourceMappingURL=tool-center-bridge.d.ts.map