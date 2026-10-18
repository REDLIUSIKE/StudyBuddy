import { randomUUID } from '@deepseek-ai/dsh-util-crypto';
import { findTabPane } from '@deepseek-ai/dsh-client-ui-dockkit';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Every session's occurrences. */
export class TabDomain {
    navigator;
    pin;
    bySession = new Map();
    /**
     * @param navigator - where tab actions go, aimed at the tab's session; the navigation controller.
     * @param pin - `ctx.resources.pin`, called once per occurrence at its first sync.
     */
    constructor(navigator, pin) {
        this.navigator = navigator;
        this.pin = pin;
    }
    /**
     * Reconcile one session's occurrences with its committed layout.
     *
     * Called by the seat after every commit, and only then: aborting a vanished
     * record runs the types' cleanup, which writes their stores.
     * @param sessionId - the session whose layout committed.
     * @param layout - that session's layout as committed.
     */
    sync(sessionId, layout) {
        const held = this.session(sessionId);
        for (const [tabId, occurrence] of held) {
            if (layout.tabs[tabId] !== undefined)
                continue;
            held.delete(tabId);
            occurrence.controller.abort();
        }
        for (const tab of Object.values(layout.tabs)) {
            const occurrence = held.get(tab.id) ?? this.hold(sessionId, tab.id, { address: tab.contentId, params: undefined, revision: 0 });
            const pane = findTabPane(layout, tab.id);
            occurrence.paneId = pane.host === 'dock' ? pane.id : undefined;
            if (occurrence.pinned)
                continue;
            occurrence.pinned = true;
            this.pin(occurrence.navigation.getSnapshot().address, occurrence.signal);
        }
    }
    /**
     * Read an occurrence created by navigation or committed-store reconciliation.
     * @param sessionId - the session the record is in.
     * @param tab - the record being drawn.
     * @returns its occurrence.
     * @throws when the record has not been reconciled or has disappeared.
     */
    occurrence(sessionId, tab) {
        const occurrence = this.bySession.get(sessionId)?.get(tab.id);
        if (occurrence === undefined)
            throw new Error(`sidebarRight: tab "${tab.id}" has no committed occurrence in session "${sessionId}"`);
        return occurrence;
    }
    /**
     * Record that an `open` settled on a tab.
     *
     * A record the layout has not yet shown the seat gets its occurrence here, so
     * the body's first render already carries the opener's `params`.
     * @param sessionId - the session opened into.
     * @param tabId - the tab the open settled on.
     * @param target - the address and the opener's params.
     */
    navigate(sessionId, tabId, target) {
        const existing = this.session(sessionId).get(tabId);
        if (existing === undefined) {
            this.hold(sessionId, tabId, { ...target, revision: 1 });
            return;
        }
        existing.navigation.set({ ...target, revision: existing.navigation.getSnapshot().revision + 1 });
    }
    /** Abort every occurrence of every session; the package is unloading. */
    dispose() {
        for (const held of this.bySession.values()) {
            for (const occurrence of held.values())
                occurrence.controller.abort();
        }
        this.bySession.clear();
    }
    session(sessionId) {
        let held = this.bySession.get(sessionId);
        if (held === undefined) {
            held = new Map();
            this.bySession.set(sessionId, held);
        }
        return held;
    }
    hold(sessionId, tabId, navigation) {
        const controller = new AbortController();
        const { navigator } = this;
        // Where an open from this tab lands, read at call time because the tab may
        // have been dragged since: `replaceTab: true` names this tab; otherwise the
        // pane holding it, unless the caller named another.
        const place = (placement) => ({
            ...placement.replaceTab === true
                ? { replaceTab: tabId }
                : held.paneId === undefined ? {} : { paneId: held.paneId },
            ...placement.paneId === undefined ? {} : { paneId: placement.paneId },
            ...placement.preferNewPane === undefined ? {} : { preferNewPane: placement.preferNewPane },
            ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },
        });
        const held = {
            id: randomUUID(),
            sessionId,
            tabId,
            controller,
            commands: {},
            signal: controller.signal,
            navigation: createSnapshotStore(navigation),
            paneId: undefined,
            pinned: false,
            tabActions: {
                bindCommands: (commands) => {
                    if (controller.signal.aborted)
                        return () => { };
                    held.commands = commands;
                    const release = () => {
                        if (held.commands === commands)
                            held.commands = {};
                        controller.signal.removeEventListener('abort', release);
                    };
                    controller.signal.addEventListener('abort', release, { once: true });
                    return release;
                },
                openResource: (address, options = {}) => {
                    navigator.openResourceIn(sessionId, address, { ...place(options), params: options.params });
                },
                openTab: (kind, options = {}) => {
                    navigator.openTabIn(sessionId, kind, { ...place(options), params: options.params });
                },
                close: () => { navigator.closeIn(sessionId, tabId); },
            },
        };
        this.session(sessionId).set(tabId, held);
        return held;
    }
}
//# sourceMappingURL=tab-domain.js.map