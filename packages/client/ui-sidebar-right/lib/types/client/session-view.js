/** Owns its reference until retirement finishes or the Sidebar plugin shuts down. */
export class SidebarSessionView {
    sessionId;
    onDispose;
    onTabRelease;
    /** Session reference released exclusively by this View. */
    reference;
    tabs = new Map();
    mounts = 0;
    retired = false;
    disposed = false;
    /**
     * @param sessionId - Session displayed by this view.
     * @param sessions - allocator for this view's independent reference.
     * @param onDispose - removes this view from the collection's index before reference release.
     * @param onTabRelease - reconsiders retention after a body releases its hold.
     */
    constructor(sessionId, sessions, onDispose, onTabRelease) {
        this.sessionId = sessionId;
        this.onDispose = onDispose;
        this.onTabRelease = onTabRelease;
        this.reference = sessions.retain(sessionId, { source: 'sidebarView' });
        void this.reference.ready.catch((error) => { console.error('Sidebar Session opening failed:', error); });
    }
    /** Whether an initialized retained body still needs this view. */
    get hasRetainedTabs() {
        return this.tabs.size > 0;
    }
    /**
     * Keep a retired View's reference until its committed roots finish unmounting.
     * @returns cleanup to call once for this root; the final cleanup releases a retired View.
     */
    mount() {
        this.mounts += 1;
        return () => {
            this.mounts -= 1;
            if (this.retired && this.mounts === 0)
                this.dispose();
        };
    }
    /**
     * Hold an initialized body until unmount or occurrence cancellation.
     * @param tabId - initialized body identity.
     * @param signal - occurrence lifetime; closing and undoing a tab creates a new lifetime.
     * @returns idempotent release of this body's hold.
     */
    retainTab = (tabId, signal) => {
        if (signal.aborted || this.disposed)
            return () => { };
        this.tabs.set(tabId, (this.tabs.get(tabId) ?? 0) + 1);
        let held = true;
        const release = () => {
            if (!held)
                return;
            held = false;
            signal.removeEventListener('abort', release);
            const count = this.tabs.get(tabId);
            if (count === 1)
                this.tabs.delete(tabId);
            else
                this.tabs.set(tabId, count - 1);
            this.onTabRelease(this);
        };
        signal.addEventListener('abort', release, { once: true });
        return release;
    };
    /** End a withdrawn view after its existing committed mounts finish. */
    retire() {
        this.retired = true;
        if (this.mounts === 0)
            this.dispose();
    }
    /** Release once; plugin shutdown does not wait for remaining React mounts. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.retired = true;
        this.onDispose(this);
        this.reference.release();
    }
}
//# sourceMappingURL=session-view.js.map