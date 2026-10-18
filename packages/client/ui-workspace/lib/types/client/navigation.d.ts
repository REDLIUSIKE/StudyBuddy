/** Workspace archive and directory UI capability. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { ClientRemote, DirectoryListing, RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { ISessions, SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client';
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ChatTargetState, DraftInitializationOptions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { RowToast } from './contract/slots.ts';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { WorkspaceViewStoreActions } from './stores.ts';
export type { ChatTargetState } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Optional content preparation for the resolved target Session. */
export type StartSessionOptions = DraftInitializationOptions;
/** Workspace archive and directory operations consumed by Client UI domains. */
export interface UiWorkspace {
    /** Read-only preparation state; a failed target must not enable the old composer. */
    readonly chatTarget: ObservableSnapshot<ChatTargetState>;
    /**
     * Prepare an exact project or ordinary chat and carry the unsent draft.
     * @param workspaceId - exact project, or null for outside-project work.
     * @returns completion; failures preserve the old Session and draft.
     */
    openChatTarget(workspaceId: WorkspaceId | null): Promise<void>;
    /**
     * Select a Session and show its Conversation as one UI navigation action.
     * @param target - known Session identity or durable direct-parent subagent address to display.
     */
    openSession(target: SessionTarget): void;
    /**
     * Connect a Workspace and open its Session unless a later navigation supersedes it.
     * @param workspaceId - target Workspace.
     * @param beforeOpen - optional synchronous preparation for the selected Session,
     * skipped after supersession; a throw aborts the open and releases the retained reference.
     * @returns completion; a superseded request may create a Session but does not open it.
     * @throws on failure; a refused creation is also shown through the Workspace
     * notice unless a later navigation or disposal superseded the request.
     */
    openWorkspace(workspaceId: WorkspaceId, beforeOpen?: (sessionId: SessionId) => void): Promise<void>;
    /**
     * Fork a Session without changing the current selection.
     * @param sessionId - source Session.
     * @param onCreated - observer before the optional child-title update.
     * @param options - optional permission to start source migration; omission preserves the Host default.
     * @returns the child SessionId after creation and inherited-title increment.
     */
    forkSession(sessionId: SessionId, onCreated?: (childId: SessionId) => void, options?: Pick<Parameters<ISessions['fork']>[0], 'allowMigration'>): Promise<SessionId>;
    /**
     * Resolve the reusable or newly created blank Session for a Workspace.
     * @param workspaceId - target Workspace.
     * @returns a Session already addressable through the Session Controller.
     */
    connectWorkspace(workspaceId: WorkspaceId): Promise<SessionId>;
    /**
     * Create a fresh Session, or reuse a blank when preparing an explicit draft. A creation the Host
     * refuses is shown through the Workspace notice and leaves the selection as it was.
     * @param workspaceId - exact project, null for ordinary, or absent to inherit current ownership only.
     * @param options - initial content; existing text or attachments are preserved unless clearPreviousDraft is true.
     */
    startSession(workspaceId?: WorkspaceId | null, options?: StartSessionOptions): void;
    /**
     * Archive a Session and clear it when it is the current selection.
     * @param sessionId - Session to archive.
     * @param options - `stopActivity` asks the Host to stop the Session's running work instead of refusing.
     */
    archiveSession(sessionId: SessionId, options?: {
        readonly stopActivity?: boolean;
    }): Promise<void>;
    /**
     * Unarchive a Session, restoring it to its recorded Workspace position.
     * @param sessionId - Session to unarchive.
     */
    unarchiveSession(sessionId: SessionId): Promise<void>;
    /**
     * Pin a Session on the Host, then lead it in its accounts' saved orders
     * (its Workspace group or Ungrouped, and the flat list). The order write
     * reads the memberships current at completion, so reorders that landed
     * while the Host call was pending keep their positions.
     * @param sessionId - Session to pin.
     */
    pinSession(sessionId: SessionId): Promise<void>;
    /**
     * Unpin a Session on the Host; saved positions stay as they are.
     * @param sessionId - Session to unpin.
     */
    unpinSession(sessionId: SessionId): Promise<void>;
    /**
     * Open the Host-native directory picker.
     * @returns the selected directory, or null when cancelled.
     */
    pickDirectory(): Promise<string | null>;
    /**
     * List one Host directory level.
     * @param path - directory path; absent selects the Host home.
     * @param signal - cancellation for a superseded scan.
     * @returns directory entries and breadcrumb ancestry.
     */
    listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing>;
    /**
     * Create a child directory.
     * @param path - existing parent directory.
     * @param name - child directory name.
     * @returns created absolute path.
     */
    createDirectory(path: string, name: string): Promise<string>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Cross-Controller Workspace navigation and directory UI capability. */
        uiWorkspace: UiWorkspace;
    }
}
/** Structured directory failure exposed to directory UI consumers. */
export declare class DirectoryBrowseError extends Error {
    readonly rpcError: RemoteFailure;
    readonly name = "DirectoryBrowseError";
    /** @param rpcError - Host directory business failure. */
    constructor(rpcError: RemoteFailure);
}
/** Implements Workspace archive and directory UI operations. */
declare class UiWorkspaceService extends Service implements UiWorkspace {
    private readonly directoryPicker;
    private readonly workspaces;
    private readonly sessions;
    private readonly view;
    private readonly notify;
    private readonly connecting;
    private readonly lifetime;
    private readonly selection;
    private mainReference;
    private pendingChatPreparation;
    /** Current exact-target preparation state for the Conversation composer. */
    readonly chatTarget: ObservableSnapshot<ChatTargetState>;
    /**
     * @param ctx - Client root Context.
     * @param directoryPicker - the directory-picking Remote namespace.
     * @param workspaces - pure Workspace Controller.
     * @param sessions - pure Session Controller.
     * @param view - the browser's viewing-store write set (one instance shared with its registration).
     * @param notify - show one notice through the Workspace notice channel.
     */
    constructor(ctx: Context, directoryPicker: ClientRemote['directoryPicker'], workspaces: IWorkspaces, sessions: ISessions, view: Pick<WorkspaceViewStoreActions, 'pinSessionOrder'>, notify: (toast: RowToast) => void);
    connectWorkspace(workspaceId: WorkspaceId): Promise<SessionId>;
    private connectBlank;
    private reuseOrCreateBlank;
    private reuseBlank;
    openSession(target: SessionTarget): void;
    openChatTarget(workspaceId: WorkspaceId | null): Promise<void>;
    private prepareChatTarget;
    private preserveDraftSelections;
    openWorkspace(workspaceId: WorkspaceId, beforeOpen?: (sessionId: SessionId) => void): Promise<void>;
    private openWorkspaceSession;
    forkSession(sessionId: SessionId, onCreated?: (childId: SessionId) => void, options?: Pick<Parameters<ISessions['fork']>[0], 'allowMigration'>): Promise<SessionId>;
    startSession(workspaceId?: WorkspaceId | null, options?: StartSessionOptions): void;
    private prepareDraft;
    private draftPreparationFailed;
    archiveSession(sessionId: SessionId, options?: {
        readonly stopActivity?: boolean;
    }): Promise<void>;
    unarchiveSession(sessionId: SessionId): Promise<void>;
    pinSession(sessionId: SessionId): Promise<void>;
    unpinSession(sessionId: SessionId): Promise<void>;
    pickDirectory(): Promise<string | null>;
    listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing>;
    createDirectory(path: string, name: string): Promise<string>;
    private watchNavigation;
    private restoreSelection;
    private initializeDefaultWorkspace;
    /** @returns true when an archived current selection was cleared. */
    private clearArchivedCurrent;
    private clearMain;
    private replaceMain;
}
export { UiWorkspaceService };
//# sourceMappingURL=navigation.d.ts.map