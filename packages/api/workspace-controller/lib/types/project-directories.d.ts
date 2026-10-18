import type { Context } from '@deepseek-ai/cordis';
import type { ChatPrepareRequest, ChatPrepareValue, ProjectCreateRequest, SourceFolderView, WorkspaceValue } from './types.ts';
/** One profile owns all source registrations and allocation intents through this instance. */
export declare class ProjectDirectories {
    private readonly ctx;
    private readonly documents;
    private readonly managedRoot?;
    private domain;
    private tail;
    private disposed;
    /**
     * @param ctx - current profile's Workspace and StorageDomain services.
     * @param documents - OS-aware Documents resolver; no directories are created by it.
     * @param managedRoot - optional fully qualified product-root override.
     */
    constructor(ctx: Context, documents: () => Promise<string>, managedRoot?: string | undefined);
    /**
     * Canonicalize and register one source without making a visible project.
     * @param request - user-picked directory.
     * @returns its stable current-profile identity; unavailable paths reject.
     */
    registerSource(request: {
        path: string;
    }): Promise<SourceFolderView>;
    /**
     * Prepare and durably register one confirmed named project.
     * @param request - stable request id, name, and current-profile source identities.
     * @returns the exact project; failures retain recoverable intent and never remove user files.
     */
    createProject(request: ProjectCreateRequest): Promise<WorkspaceValue>;
    /**
     * Allocate one ordinary-chat directory, without a visible Workspace or Session.
     * @param request - retry identity for this preparation.
     * @returns one stable generated cwd/Session identity.
     */
    prepareChat(request: ChatPrepareRequest): Promise<ChatPrepareValue>;
    private open;
    private target;
    private ensureManaged;
    private validateSources;
    private conflict;
    private unavailable;
    private enqueue;
}
//# sourceMappingURL=project-directories.d.ts.map