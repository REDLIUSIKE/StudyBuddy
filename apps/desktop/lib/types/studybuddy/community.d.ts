import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents } from 'electron';
import { StudyBuddyEmbeddedGuests } from './embedded-guests.ts';
import { type SkillsRuntime } from './skill-native-client.ts';
import type { StudyBuddyAuth, StudyBuddyFetch } from './services.ts';
interface CommunityDependencies {
    auth: StudyBuddyAuth;
    fetch: StudyBuddyFetch;
    session(partition: string): Session;
    window(): BrowserWindow | undefined;
    runtime: SkillsRuntime;
    home(): string;
    version: string;
    preload: string;
    pick(window: BrowserWindow, command: string, input: Record<string, unknown>): Promise<string | null>;
    openPath(path: string): Promise<string>;
    openExternal(url: string): Promise<void>;
}
/** All remote requests are tied to the admitted guest's current main frame and account generation. */
export declare class StudyBuddyCommunity {
    private readonly deps;
    readonly zhilian: StudyBuddyEmbeddedGuests;
    readonly skills: StudyBuddyEmbeddedGuests;
    constructor(deps: CommunityDependencies);
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    bind(window: BrowserWindow, input: (guest: WebContents, id: string) => () => void, reservation: (src: string, partition?: string) => boolean): void;
    revoke(): Promise<void>;
    private manager;
    register(ipc: IpcMain, assertOwner: (event: IpcMainInvokeEvent) => void): void;
    private invoke;
}
export {};
//# sourceMappingURL=community.d.ts.map