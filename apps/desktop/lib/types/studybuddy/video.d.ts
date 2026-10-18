import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents, OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import type { StudyBuddyAuth } from './services.ts';
import { VideoRuntime } from './video-runtime.ts';
import { VideoBridge } from './video-bridge.ts';
import { type VideoPixelImage } from './video-reference-image.ts';
interface Options {
    auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>;
    runtime: VideoRuntime;
    bridge: VideoBridge;
    preload: string;
    fromPartition(partition: string): Session;
    prepared: boolean;
    imageFromBytes(bytes: Uint8Array): VideoPixelImage;
    showOpenDialog(owner: WebContents, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
}
/** Studio lives in an isolated guest; native Session identity and references stay in Main. */
export declare class StudyBuddyVideo {
    private readonly options;
    private readonly guests;
    private readonly selected;
    private readonly revisions;
    private readonly requestedProjects;
    private readonly references;
    constructor(options: Options);
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    bind(window: BrowserWindow, attach: (guest: WebContents, id: string) => () => void, reserved: (src: string, partition?: string) => boolean): void;
    revoke(): Promise<void>;
    register(ipc: IpcMain, assertOwner: (event: IpcMainInvokeEvent) => void, assertShellOwner: (event: IpcMainInvokeEvent) => void): void;
}
export {};
//# sourceMappingURL=video.d.ts.map