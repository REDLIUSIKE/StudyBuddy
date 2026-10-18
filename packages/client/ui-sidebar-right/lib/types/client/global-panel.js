import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Root presentation that temporarily covers, rather than replaces, Session previews. */
export class GlobalRightPanel {
    layout;
    source = createSnapshotStore(null);
    sessionVisible = true;
    session = { shown: false, track: false, fullscreen: false };
    constructor(layout) {
        this.layout = layout;
    }
    /** @param key - registered root panel key. */
    open(key) {
        this.source.set(key);
        this.layout.openRightbar(true, false);
    }
    /** Restore the current context without navigating to a previous Session. */
    close() {
        this.source.set(null);
        this.presentSession();
    }
    /** @param visible - whether the main column currently displays Conversation. */
    setSessionVisible(visible) {
        this.sessionVisible = visible;
        if (this.source.getSnapshot() === null && !visible)
            this.layout.closeRightbar();
    }
    /** @param presentation - active Session's committed presentation. */
    reportSession(presentation) {
        if (this.source.getSnapshot() !== null)
            return;
        this.session = presentation;
        this.presentSession();
    }
    presentSession() {
        if (this.sessionVisible && this.session.shown)
            this.layout.openRightbar(this.session.track, this.session.fullscreen);
        else
            this.layout.closeRightbar();
    }
}
//# sourceMappingURL=global-panel.js.map