/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController {
    panels;
    hasMainPanel;
    panelInfo;
    navigation = new AbortController();
    /**
     * @param panels - actions of the instance shared with the root entry.
     * @param hasMainPanel - checks the live main-slot registry for a panel id.
     * @param panelInfo - root store's shared central-panel selection source.
     */
    constructor(panels, hasMainPanel, panelInfo) {
        this.panels = panels;
        this.hasMainPanel = hasMainPanel;
        this.panelInfo = panelInfo;
    }
    /** Select a global panel or return to the Conversation. */
    selectPanel(panelId) {
        if (panelId !== null && !this.hasMainPanel(panelId)) {
            throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`);
        }
        this.navigation.abort();
        this.panels.selectPanel(panelId);
    }
    /** @returns the new pending navigation's cancellation signal. */
    beginNavigation() {
        this.navigation.abort();
        this.navigation = new AbortController();
        return this.navigation.signal;
    }
    /** Invalidate pending navigations when the layout owner is unloaded. */
    dispose() {
        this.navigation.abort();
    }
    /** Toggle the sidebar panel (closed ⟷ contract default width). */
    toggleSidebar() {
        this.panels.toggleSidebar();
    }
    /** Collapse without reopening a sidebar that was already closed. */
    collapseSidebar() {
        this.panels.collapseSidebar();
    }
    /** Report the right panel's track and fullscreen presentation. */
    openRightbar(track, fullscreen) {
        this.panels.openRightbar(track, fullscreen);
    }
    /** Report the right panel as hidden: no track, no handle. */
    closeRightbar() {
        this.panels.closeRightbar();
    }
}
//# sourceMappingURL=service.js.map