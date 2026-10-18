import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { StudyBuddyAuth, StudyBuddyFetch } from './services.ts';
/** Fixed routes; no arbitrary URL or author can cross the preload boundary. */
export declare function promptRequest(method: unknown, args: unknown): {
    path: string;
    body?: unknown;
};
/** Private credential owner, using the existing authenticated account generation. */
export declare class StudyBuddyPrompts {
    private readonly auth;
    private readonly fetcher;
    constructor(auth: StudyBuddyAuth, fetcher: StudyBuddyFetch);
    invoke(method: unknown, args: unknown): Promise<unknown>;
    /** @param ipc - original main-process IPC owner. @param assertSender - authenticated main-frame validator. */
    register(ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, assertSender: (event: IpcMainInvokeEvent) => void): () => void;
}
//# sourceMappingURL=prompts.d.ts.map