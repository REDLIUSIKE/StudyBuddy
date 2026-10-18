import type { BrowserWindow, IpcMainInvokeEvent, Session, WebContents } from 'electron';
import type { EmbeddedLease, EmbeddedTheme } from '@studybuddy/contracts';
import type { MainSession, StudyBuddyAuth, StudyBuddyFetch } from './services.ts';
import { type GrowthSaveStatus } from './growth-image.ts';
/** A ticket issuer may return only the existing authenticated profile entry. */
export declare function validateProfileEntry(value: unknown): string;
/** Profile and existing campus flows remain inside their own web origin. */
export declare function profileNavigationAllowed(value: string): boolean;
/** Theme transfer accepts only resolved stylesheet tokens, never arbitrary guest scripts. */
export declare function validateEmbeddedTheme(value: unknown): EmbeddedTheme;
/** Main-owned capabilities contributed by a specific embedded business page. */
export interface EmbeddedGuestIssue {
    entryUrl: string;
    requestAllowed?(url: string): boolean;
    requestHeaders?(url: string): Readonly<Record<string, string>>;
    startup?: {
        bindingId: string;
        operationId: string;
    };
    invoke?(command: string, input: Record<string, unknown>, page: string, send: (channelId: string, payload: unknown) => void): Promise<unknown>;
    dispose?(): Promise<void>;
}
/** Separate instances retain separate ticket issuers, routes, preloads and partitions. */
export interface EmbeddedGuestOptions {
    target: 'zhilian' | 'skills' | 'aigc' | 'research' | 'video';
    validateEntry(value: unknown): string;
    navigationAllowed(value: string): boolean;
    issue?(session: MainSession, owner: WebContents): Promise<EmbeddedGuestIssue>;
    preload?: string;
    navigate?(owner: WebContents, guest: WebContents, lease: EmbeddedLease, url: string): Promise<void>;
    /** Owner validates an exact external allowlist; guest navigation remains denied. */
    openExternal?(url: string): Promise<void>;
}
/** Account lifetime owns the partition; release waits for destruction and wipes its browser storage. */
export declare class StudyBuddyEmbeddedGuests {
    #private;
    private readonly auth;
    private readonly fetcher;
    private readonly fromPartition;
    private readonly saveGrowth?;
    private readonly invalidated?;
    private readonly options?;
    constructor(auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>, fetcher: StudyBuddyFetch, fromPartition: (partition: string) => Session, saveGrowth?: ((owner: WebContents, version: string) => Promise<GrowthSaveStatus>) | undefined, invalidated?: ((owner: WebContents, lease: string) => void) | undefined, options?: EmbeddedGuestOptions | undefined);
    private get prefix();
    private allowed;
    owns(owner: WebContents, id: string): boolean;
    checkedGuest(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): {
        lease: EmbeddedLease;
        issued: EmbeddedGuestIssue;
        guest: WebContents;
    };
    setVisible(owner: WebContents, id: string, visible: boolean): Promise<void>;
    /** Theme and geometry updates do not start another page-resume transaction. */
    private applyVisibility;
    recognizes(owner: WebContents, src: string, partition?: string): boolean;
    private sameScope;
    acquire(owner: WebContents, view?: 'profile' | 'models'): Promise<EmbeddedLease>;
    private create;
    release(owner: WebContents, id: unknown): Promise<void>;
    revoke(notify?: boolean): Promise<void>;
    setTheme(owner: WebContents, id: unknown, value: unknown): Promise<void>;
    private applyTheme;
    bind(window: BrowserWindow, attachInput: (guest: WebContents, id: string) => () => void, browserReservation: (src: string, partition?: string) => boolean): void;
    private exportGrowth;
    private configureSession;
    /** Only a live focused Research root document can request its microphone; every other capture remains denied. */
    private researchMicrophoneAllowed;
    /** Only the live foreground editor main frame may request video fullscreen; generated film frames stay excluded. */
    private videoFullscreenAllowed;
    /** Only the live foreground AIGC or Skill main frame may write sanitized clipboard content. */
    private clipboardWriteAllowed;
}
//# sourceMappingURL=embedded-guests.d.ts.map