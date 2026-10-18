import { observeSidebarFocus } from "./focus.js";
import { registerSidebarShortcuts } from "./shortcuts.js";
import { GuideBody } from "./tabs/guide/GuideBody.js";
import { GuideTitle } from "./tabs/guide/GuideTitle.js";
import { ExpandButton } from "./shell/ExpandButton.js";
import { RightbarSeat } from "./shell/SidebarRight.js";
import { closeWithPaneFocus, openWithPaneFocus } from "./shell/close-focus.js";
import { RightbarRoot } from "./shell/RightbarRoot.js";
import { SidebarSessionViews } from "./session-views.js";
import { createSidebarRightController } from "./service.js";
import { SidebarRightTabRegistry } from "./tab-registry.js";
import { createSidebarRightStore } from "./stores.js";
import { en, zh } from "./locales.js";
import { GUIDE_ID, guideDefinition } from "./tabs/guide/definition.js";
import { guideTabInfoFactory, tabInfoFactory } from "./tab-info.js";
import { defaultSeed } from "./contract/seed.js";
import { GlobalRightPanel } from "./global-panel.js";
import { SidebarSessionSurfaces } from "./session-surfaces.js";
/** This package's copy namespace. */
const NS = 'sidebarRight';
/** Required browser services: the slot registry, the frame's panel actions, copy, and the resource model. */
export const inject = ['slots', 'layout', 'locale', 'resources', 'sessions', 'uiSession', 'shortcuts'];
/**
 * Client plugin body: provide the registry and the navigation face, register the
 * panel seat and the rail seat over one store with their extension children, and
 * register the guide type through the same public two-stage path any other type
 * uses.
 * @param ctx - client root context carrying the slot registry, the frame's face, and copy.
 */
export function apply(ctx) {
    // The registry and the face it backs are built here, at apply's top level,
    // and never inside an effect. A registry other packages register into cannot
    // have an effect-internal scope as its host: `register()` adds an effect to
    // this fiber, and doing that from another plugin's apply while the effect is
    // still the active scope stalls browser boot with no error at all. The
    // template this follows (ui-conversation's definition registry) is built at
    // its own apply top level for the same reason.
    const t = ctx.locale.bind(NS);
    const tabs = new SidebarRightTabRegistry(ctx);
    const current = ctx.uiSession.adapter.current;
    const surfaces = new SidebarSessionSurfaces({
        getSnapshot: () => ctx.layout.panelInfo.getSnapshot().activePanelId,
        subscribe: listener => ctx.layout.panelInfo.subscribe(listener),
    }, {
        getSnapshot: () => current.getSnapshot().key,
        subscribe: listener => current.subscribe(listener),
    });
    const disposeSurfaces = ctx.reflect.provide('sidebarRightSurfaces', surfaces);
    ctx.effect(() => () => { surfaces.dispose(); void disposeSurfaces(); }, 'ui-sidebar-right: Session surfaces');
    const views = new SidebarSessionViews(ctx.sessions);
    ctx.effect(() => {
        // Ordinary chat keeps its background subtree while an unrelated main panel is foreground.
        const sync = () => { views.select(surfaces.source.getSnapshot() ?? current.getSnapshot().key); };
        const unsubscribe = surfaces.source.subscribe(sync);
        const unsubscribeCurrent = current.subscribe(sync);
        sync();
        return () => { unsubscribe(); unsubscribeCurrent(); views.dispose(); };
    }, 'ui-sidebar-right: retained Session views');
    const layout = ctx.layout;
    const globalPanel = new GlobalRightPanel(layout);
    const disposeGlobal = ctx.reflect.provide('sidebarRightGlobal', globalPanel);
    ctx.effect(() => () => { globalPanel.close(); void disposeGlobal(); }, 'ui-sidebar-right: global presentation');
    // The automatic fullscreen rule as the seats last rendered it: the frame
    // hands them its width as owner props, and every seat reports the same rule.
    let autoFullscreen = false;
    const { controller, adopt, forget, show, measure } = createSidebarRightController(tabs, (address, signal) => { ctx.resources.pin(address, signal); }, {
        autoFullscreen: () => autoFullscreen,
        openWithFocus: (sessionId, open) => { openWithPaneFocus(document, sessionId, open); },
        closeWithFocus: (sessionId, paneId, close) => { closeWithPaneFocus(document, sessionId, paneId, close); },
    });
    // The Session on screen: the selected one while the Conversation fills the
    // main column. Both sources notify before React renders their change, so the
    // service names the arriving Session before any component of that commit
    // reads it, and its seat mints the Session's store in the same render.
    ctx.effect(() => {
        const sync = () => {
            const activeSession = surfaces.source.getSnapshot();
            globalPanel.setSessionVisible(layout.panelInfo.getSnapshot().activePanelId === null || activeSession !== undefined);
            show(activeSession);
        };
        const unsubscribeViews = views.source.subscribe(sync);
        const unsubscribePanel = layout.panelInfo.subscribe(sync);
        sync();
        return () => {
            unsubscribeViews();
            unsubscribePanel();
            show(undefined);
        };
    }, 'ui-sidebar-right: on-screen Session');
    const disposeRegistry = ctx.reflect.provide('sidebarRightTabs', tabs);
    const disposeService = ctx.reflect.provide('sidebarRight', controller);
    // Registered first, so it tears down last: the faces outlive every seat and
    // type that reaches for them. provide()'s disposer settles asynchronously;
    // teardown is synchronous fire-and-forget, matching ui-layout's root entry.
    // Unloading aborts every tab occurrence, which releases every pin.
    ctx.effect(() => () => {
        controller.tabDomain.dispose();
        void disposeService();
        void disposeRegistry();
    }, 'ui-sidebar-right: service faces');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-right: dictionaries');
    ctx.effect(() => registerSidebarShortcuts(ctx.shortcuts, controller, t, () => {
        void ctx.shortcuts.closeWindow().catch((error) => { console.error('Window close failed', error); });
    }), 'ui-sidebar-right: shortcuts');
    if (typeof document !== 'undefined')
        ctx.effect(() => observeSidebarFocus(document), 'ui-sidebar-right: focus');
    ctx.effect(() => {
        const handle = createSidebarRightStore(() => defaultSeed(tabs));
        // Each Session Context generation owns one Store. Background tab actions
        // use the latest adoption for that Session.
        const adoptions = new Map();
        const store = {
            ...handle,
            create: (scopeKey) => {
                const instance = handle.create(scopeKey);
                if (scopeKey !== undefined) {
                    const sessionId = scopeKey;
                    adoptions.get(sessionId)?.();
                    adoptions.set(sessionId, adopt(sessionId, instance));
                }
                return { ...instance, clearPersisted() {
                        instance.clearPersisted();
                        if (scopeKey !== undefined)
                            forget(scopeKey);
                    } };
            },
        };
        const injected = {
            syncPresentation({ shown, track, fullscreen }) {
                globalPanel.reportSession({ shown, track, fullscreen });
            },
            reportAutoFullscreen: (value) => { autoFullscreen = value; },
            splitPane: (paneId) => { controller.split(paneId); },
            toggleFullscreen: () => { const target = controller.commandTarget(); if (target !== undefined)
                controller.toggleFullscreen(target); },
            openTab: (kind, options) => { controller.openTab(kind, options); },
            hooks: {
                shortcuts: ctx.shortcuts.catalog,
                tabTypes: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.entries() },
            },
        };
        const disposeTypes = [tabs.register(guideDefinition(t))];
        const disposeSeat = ctx.slots.inject('rightbar', function* () {
            yield ctx.slots.register({
                name: 'rightbar',
                children: {
                    'rightbar.session': { kind: 'single', scope: 'session' },
                    'rightbar.global': { kind: 'keyed', scope: 'root' },
                },
                inject: () => ({
                    hooks: { views: views.source, globalPanel: globalPanel.source, activeSession: surfaces.source },
                    mountView: reference => views.mount(reference),
                }),
            }, RightbarRoot);
            yield ctx.slots.register({
                name: 'rightbar.session',
                locale: NS,
                children: {
                    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
                    'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
                    'sidebar.right.tab.menu.item': { kind: 'list', scope: 'session' },
                },
                store,
                inject: (sessionId) => ({
                    ...injected,
                    measureRoom: (canSplitPane) => { measure(sessionId, canSplitPane); },
                    closeTab: (tabId) => {
                        try {
                            controller.closeIn(sessionId, tabId);
                        }
                        catch (error) {
                            console.error('Sidebar tab close failed:', error);
                        }
                    },
                    keyedHooks: { tabNavigation: key => controller.tabDomain.occurrence(sessionId, { id: key }).navigation },
                    occurrence: tab => controller.tabDomain.occurrence(sessionId, tab),
                }),
            }, RightbarSeat);
        });
        // The expand button shares the panel's store: it only needs to know whether
        // the panel is expanded, and to ask for it to be. The header's corner seat
        // is its own place, past the utilities, so showing and hiding it moves
        // nothing else in the row.
        const disposeExpand = ctx.slots.inject('conversation.session.header.corner', () => ctx.slots.register({
            name: 'conversation.session.header.corner',
            locale: NS,
            store,
            inject: () => ({ hooks: { shortcuts: ctx.shortcuts.catalog } }),
        }, ExpandButton));
        // Stage two for the guide: it declares the chain child it hosts and reads
        // the registry's entry boxes, which an ordinary type has no reason to do.
        const guideInjected = {
            hooks: {
                shortcuts: ctx.shortcuts.catalog,
                guideEntries: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.guide() },
            },
        };
        const disposeGuide = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: GUIDE_ID,
            children: {
                'sidebar.right.tab.guide.entry': {
                    kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: guideTabInfoFactory } },
                },
                'sidebar.right.tab.guide': {
                    kind: 'chain', scope: 'session', inject: { hooks: { tabInfo: guideTabInfoFactory } },
                },
            },
            inject: () => guideInjected,
        }, GuideBody));
        const disposeGuideTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: GUIDE_ID }, GuideTitle));
        return () => {
            disposeGuideTitle();
            disposeGuide();
            disposeExpand();
            disposeSeat();
            for (const dispose of disposeTypes.reverse())
                dispose();
            for (const release of adoptions.values())
                release();
            adoptions.clear();
        };
    }, 'ui-sidebar-right: seats and shipped tab type');
}
//# sourceMappingURL=index.js.map