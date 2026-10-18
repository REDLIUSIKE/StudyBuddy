/** Test-owned workspaces face: the renderer standard-kit observable plus recorded actions. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { workspaceSnapshot } from "./fixtures.js";
/**
 * Workspaces test double. Implements the same IWorkspaces face features
 * receive as `ctx.workspaces`, so a production face change breaks this
 * double at compile time. Every action records into {@link
 * TestWorkspaces.calls}; defaults are inert echoes — feature tests needing
 * richer behavior replace them via {@link TestWorkspaces.stub}.
 */
export class TestWorkspaces {
    stabilize;
    /** The useWorkspaces standard feed. */
    list;
    /** Calls observed on the action face, newest last. */
    calls = [];
    /** Replaceable action seat: feature tests may stub richer behavior. */
    stubs = new Map();
    /**
     * @param stabilize - the owning runtime's act wrapper.
     */
    constructor(stabilize) {
        this.stabilize = stabilize;
        this.list = createSnapshotStore({ ...workspaceSnapshot() });
    }
    /**
     * Update the workspace list state through an immer draft.
     * @param mutate - draft mutator.
     */
    async update(mutate) {
        await this.stabilize(() => { this.list.update(mutate); });
    }
    /**
     * Replace an action's behavior (the recorded call is still appended first).
     * @param method - Controller action name (e.g. 'create').
     * @param impl - replacement behavior.
     */
    stub(method, impl) {
        this.stubs.set(method, impl);
    }
    /**
     * Create a Workspace (recorded). The default echoes a view derived from
     * the input; stub for failure or list-coupled flows.
     * @param input - the Host create payload.
     * @returns the created Workspace view.
     */
    async create(input) {
        this.calls.push({ method: 'create', args: [input] });
        const stub = this.stubs.get('create');
        if (stub !== undefined)
            return await stub(input);
        return {
            workspaceId: `ws-${input.path}`,
            title: input.path,
            path: input.path,
            sessionIds: [],
        };
    }
    /** Record named project creation; the test must supply its directory authority.
     * @param input - exact project request.
     * @returns the test-owned project view. */
    async createProject(input) {
        this.calls.push({ method: 'createProject', args: [input] });
        const stub = this.stubs.get('createProject');
        if (stub === undefined)
            throw new Error('TestWorkspaces: stub createProject before allocating a project');
        return await stub(input);
    }
    /** Record source registration without granting a fabricated filesystem path.
     * @param input - source path.
     * @returns the test-owned source identity. */
    async registerSource(input) {
        this.calls.push({ method: 'registerSource', args: [input] });
        const stub = this.stubs.get('registerSource');
        if (stub === undefined)
            throw new Error('TestWorkspaces: stub registerSource before registering a source');
        return await stub(input);
    }
    /** Record projectless preparation; the test supplies the resulting target.
     * @param input - stable preparation request.
     * @returns the test-owned directory and Session identity. */
    async prepareChat(input) {
        this.calls.push({ method: 'prepareChat', args: [input] });
        const stub = this.stubs.get('prepareChat');
        if (stub === undefined)
            throw new Error('TestWorkspaces: stub prepareChat before preparing a chat');
        return await stub(input);
    }
    /**
     * Initialize the default Workspace through a test stub; defaults to an ineligible first use.
     * @param signal - caller lifetime.
     * @returns the stubbed Workspace, or undefined when initialization is ineligible.
     */
    async initializeDefault(signal) {
        this.calls.push({ method: 'initializeDefault', args: [signal] });
        const stub = this.stubs.get('initializeDefault');
        return await stub?.(signal);
    }
    /**
     * Rename a Workspace (recorded). The default echoes a minimal view.
     * @param workspaceId - target workspace.
     * @param title - new title.
     * @returns the updated view.
     */
    async rename(workspaceId, title) {
        this.calls.push({ method: 'rename', args: [workspaceId, title] });
        const stub = this.stubs.get('rename');
        if (stub !== undefined)
            return await stub(workspaceId, title);
        return { workspaceId, title, path: `/${title}`, sessionIds: [] };
    }
    /**
     * Delete a Workspace (recorded; default no-op).
     * @param workspaceId - target workspace.
     */
    async delete(workspaceId) {
        this.calls.push({ method: 'delete', args: [workspaceId] });
        await this.stubs.get('delete')?.(workspaceId);
    }
    /**
     * Move a Workspace in display order (recorded; default no-op).
     * @param workspaceId - Workspace to move.
     * @param beforeWorkspaceId - Anchor; omitted appends.
     */
    async insertBefore(workspaceId, beforeWorkspaceId) {
        this.calls.push({ method: 'insertBefore', args: [workspaceId, beforeWorkspaceId] });
        await this.stubs.get('insertBefore')?.(workspaceId, beforeWorkspaceId);
    }
    /**
     * Move an accounted session (recorded). The default echoes a minimal view.
     * @param workspaceId - target workspace.
     * @param sessionId - session to move.
     * @param beforeSessionId - anchor; omitted appends.
     * @returns the updated view.
     */
    async insertSessionBefore(workspaceId, sessionId, beforeSessionId) {
        this.calls.push({ method: 'insertSessionBefore', args: [workspaceId, sessionId, beforeSessionId] });
        const stub = this.stubs.get('insertSessionBefore');
        if (stub !== undefined)
            return await stub(workspaceId, sessionId, beforeSessionId);
        return { workspaceId, title: '', path: '', sessionIds: [sessionId] };
    }
    /**
     * Archive a session (recorded). The default mirrors the production face's
     * observable effect: the id joins the list state's archive set.
     * @param sessionId - session to archive.
     */
    async archiveSession(sessionId) {
        this.calls.push({ method: 'archiveSession', args: [sessionId] });
        const stub = this.stubs.get('archiveSession');
        if (stub !== undefined) {
            await stub(sessionId);
            return;
        }
        await this.update((draft) => {
            draft.archivedSessionIds = [...draft.archivedSessionIds, sessionId];
        });
    }
    /**
     * Unarchive a session (recorded). The default mirrors the production face's
     * observable effect: the id leaves the list state's archive set.
     * @param sessionId - session to unarchive.
     */
    async unarchiveSession(sessionId) {
        this.calls.push({ method: 'unarchiveSession', args: [sessionId] });
        const stub = this.stubs.get('unarchiveSession');
        if (stub !== undefined) {
            await stub(sessionId);
            return;
        }
        await this.update((draft) => {
            draft.archivedSessionIds = draft.archivedSessionIds.filter(id => id !== sessionId);
        });
    }
    /**
     * Pin a session (recorded). The default mirrors the production face's
     * observable effect: the id leads the list state's pin set.
     * @param sessionId - session to pin.
     */
    async pinSession(sessionId) {
        this.calls.push({ method: 'pinSession', args: [sessionId] });
        const stub = this.stubs.get('pinSession');
        if (stub !== undefined) {
            await stub(sessionId);
            return;
        }
        await this.update((draft) => {
            draft.pinnedSessionIds = [
                sessionId,
                ...draft.pinnedSessionIds.filter(id => id !== sessionId),
            ];
        });
    }
    /**
     * Unpin a session (recorded). The default mirrors the production face's
     * observable effect: the id leaves the list state's pin set.
     * @param sessionId - session to unpin.
     */
    async unpinSession(sessionId) {
        this.calls.push({ method: 'unpinSession', args: [sessionId] });
        const stub = this.stubs.get('unpinSession');
        if (stub !== undefined) {
            await stub(sessionId);
            return;
        }
        await this.update((draft) => {
            draft.pinnedSessionIds = draft.pinnedSessionIds.filter(id => id !== sessionId);
        });
    }
}
//# sourceMappingURL=workspaces.js.map