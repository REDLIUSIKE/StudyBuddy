/** The shell receives an opaque guest lease; Main owns its process and session access. */
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents } from 'electron';
import type { StudyBuddyAuth } from './services.ts';
import { AigcRuntime } from './aigc-runtime.ts';
import type { AigcBridge } from './aigc-bridge.ts';
import type { EmbeddedLease } from '@studybuddy/contracts';
interface Options {
    auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>;
    runtime: Pick<AigcRuntime, 'ensure' | 'requestHeaders' | 'revoke'>;
    bridge?: AigcBridge;
    preload?: string;
    revokeGateway?(): Promise<void>;
    prepareCanvas?(scope: EmbeddedLease['scope'], directory: string, controllerRef: string): Promise<void>;
    fromPartition(partition: string): Session;
}
/** Local page admission and account cleanup use the same existing guest manager. */
export declare class StudyBuddyAigc {
    private readonly options;
    private readonly guests;
    private readonly selections;
    private readonly revisions;
    private readonly routes;
    private readonly questions;
    constructor(options: Options);
    private releaseQuestions;
    private presentQuestion;
    /** Identify the separately reserved local guest without weakening other managers.
     * @param owner - Trusted shell window contents.
     * @param src - Initial reserved source.
     * @param partition - Optional attachment partition.
     * @returns Whether this manager owns the reservation. */
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    /** Bind this manager alongside the existing remote and browser managers.
     * @param window - Trusted desktop window.
     * @param attachInput - Existing shell input ownership callback.
     * @param reservation - Other managers' reservation predicate. */
    bind(window: BrowserWindow, attachInput: (guest: WebContents, id: string) => () => void, reservation: (src: string, partition?: string) => boolean): void;
    /** Fence local access, destroy the guest and await the private child exit.
     * @returns Completion without deleting saved account projects. */
    revoke(): Promise<void>;
    /** Register only lease/theme operations for a validated shell owner.
     * @param ipc - Main's IPC registry.
     * @param assertOwner - Existing shell/frame authorization validator. */
    register(ipc: IpcMain, assertOwner: (event: IpcMainInvokeEvent) => void): void;
}
export {};
//# sourceMappingURL=aigc.d.ts.map