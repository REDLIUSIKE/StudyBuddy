import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { SidebarSessionView } from "./session-view.js";
/** Selects and retires views; the Sidebar plugin's injected dependencies own global teardown. */
export class SidebarSessionViews {
    sessions;
    /** Selected and retained View targets observed by the root renderer. */
    source = createSnapshotStore([]);
    views = new Map();
    viewsByReference = new Map();
    selected;
    closed = false;
    constructor(sessions) {
        this.sessions = sessions;
    }
    /**
     * Change the foreground Session while preserving retained background Views.
     * @param sessionId - main selection, or absence.
     */
    select(sessionId) {
        if (this.closed || this.selected === sessionId)
            return;
        this.selected = sessionId;
        if (sessionId !== undefined && !this.views.has(sessionId)) {
            const view = new SidebarSessionView(sessionId, this.sessions, (disposed) => {
                this.viewsByReference.delete(disposed.reference);
            }, (released) => { this.prune(released); });
            this.views.set(sessionId, view);
            this.viewsByReference.set(view.reference, view);
        }
        for (const view of this.views.values())
            this.prune(view);
        this.publish();
    }
    /**
     * Bind a committed root; release retired references after that root unmounts.
     * @param reference - framework target published by this owner.
     * @returns releases this committed mount.
     */
    mount(reference) {
        const view = this.viewsByReference.get(reference);
        if (view === undefined) {
            if (this.closed)
                return () => { };
            throw new Error('Sidebar Session view reference is no longer owned');
        }
        return view.mount();
    }
    /** Plugin shutdown releases every view, including any awaiting a React unmount. */
    dispose() {
        this.closed = true;
        this.views.clear();
        this.source.set([]);
        for (const view of this.viewsByReference.values())
            view.dispose();
    }
    prune(view) {
        if (view.sessionId === this.selected || view.hasRetainedTabs || this.views.get(view.sessionId) !== view)
            return;
        this.views.delete(view.sessionId);
        // Render targets must be withdrawn before an unmounted view can release its reference.
        this.publish();
        view.retire();
    }
    publish() {
        this.source.set([...this.views.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId)).map(view => ({
            sessionId: view.sessionId, reference: view.reference, selected: view.sessionId === this.selected, retainTab: view.retainTab,
        })));
    }
}
//# sourceMappingURL=session-views.js.map