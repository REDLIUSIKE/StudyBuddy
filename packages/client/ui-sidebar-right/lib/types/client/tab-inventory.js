/** Metadata inventory of saved and adopted layouts without mounting their content. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { readSidebarLayout, sidebarPersistence } from "./persistence.js";
/** Derived membership only; layout stores remain the persisted authority. */
export class SidebarTabInventory {
    sessions = new Map();
    snapshot = createSnapshotStore([]);
    /** Read-only metadata observable shared with content providers. */
    source = this.snapshot;
    /** Read saved layouts once before the root service is published. */
    constructor() {
        try {
            if (typeof localStorage === 'undefined')
                return;
            const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
            for (const key of keys) {
                if (key === null || !key.startsWith(`${sidebarPersistence}.`))
                    continue;
                const sessionId = key.slice(sidebarPersistence.length + 1);
                const saved = readSidebarLayout(sessionId);
                if (saved !== undefined)
                    this.sessions.set(sessionId, Object.values(saved.layout.tabs).map(tab => ({
                        sessionId, tabId: tab.id, kind: tab.kind, contentId: tab.contentId,
                    })));
            }
            this.publish();
        }
        catch (_storageUnavailable) { /* Adopted in-memory layouts still publish their open tabs. */ }
    }
    /**
     * Replace membership from the authoritative in-window store.
     * @param sessionId - adopted Session.
     * @param tabs - current committed records.
     */
    update(sessionId, tabs) {
        this.sessions.set(sessionId, tabs.map(tab => ({ sessionId, tabId: tab.id, kind: tab.kind, contentId: tab.contentId })));
        this.publish();
    }
    /**
     * Forget a permanently cleared scope.
     * @param sessionId - removed Session scope.
     */
    remove(sessionId) { this.sessions.delete(sessionId); this.publish(); }
    publish() {
        const next = [...this.sessions.values()].flat();
        if (JSON.stringify(next) !== JSON.stringify(this.snapshot.getSnapshot()))
            this.snapshot.set(next);
    }
}
//# sourceMappingURL=tab-inventory.js.map