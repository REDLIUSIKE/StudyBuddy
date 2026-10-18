/** Retained local guests and their native project actions belong to the original account. */
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents } from 'electron';
import type { StudyBuddyAuth } from './services.ts';
import { ResearchRuntime } from './research-runtime.ts';
import { ResearchBridge } from './research-bridge.ts';
interface Options {
    userDataRoot: string;
    auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>;
    runtime: ResearchRuntime;
    bridge: ResearchBridge;
    preload: string;
    fromPartition(partition: string): Session;
    openExternal?(url: string): Promise<void>;
}
/** The public lease controls only guest lifetime and exact native project selection. */
export declare class StudyBuddyResearch {
    private readonly options;
    private readonly guests;
    private readonly revisions;
    private store;
    private intents;
    constructor(options: Options);
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    bind(window: BrowserWindow, attach: (guest: WebContents, id: string) => () => void, reserved: (src: string, partition?: string) => boolean): void;
    revoke(): Promise<void>;
    register(ipc: IpcMain, assertOwner: (event: IpcMainInvokeEvent) => void): void;
}
export {};
//# sourceMappingURL=research.d.ts.map