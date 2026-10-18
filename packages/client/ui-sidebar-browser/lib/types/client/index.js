import { BrowserBody } from "./view/BrowserBody.js";
import { BrowserTitle } from "./view/BrowserTitle.js";
import { createBrowserControllers } from "./browser/BrowserController.js";
import { createIframePage } from "./pages.js";
import { createElectronPage } from "./electron/pages.js";
import { browserWorkspace } from "./electron/workspace.js";
import { BROWSER_ID, browserDefinition } from "./definition.js";
import { en, zh } from "./locales.js";
import { createBrowserStore } from "./browser/store.js";
/** Required Browser services. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];
/** Register the Browser type, localized guide entry, body, and title. */
export function apply(ctx) {
    const namespace = 'sidebarBrowser';
    const t = ctx.locale.bind(namespace);
    ctx.inject(['shortcuts'], (ctx) => {
        ctx.effect(() => ctx.shortcuts.register({
            id: 'browser.new', label: () => t('guide.title'), aliases: ['browser', 'new browser tab'],
            defaults: {
                'desktop:macos': { code: 'KeyT', modifiers: ['primary'] },
                'desktop:windows': { code: 'KeyT', modifiers: ['primary'] },
                'desktop:linux': { code: 'KeyT', modifiers: ['primary'] },
                'web:macos': { code: 'KeyT', modifiers: ['primary', 'alt'] },
                'web:windows': { code: 'KeyT', modifiers: ['primary', 'alt'] },
            },
            // Each tab plugin owns its command's availability, localized refusal, and tab kind.
            /* jscpd:ignore-start */
            regions: ['page', 'editable', 'terminal'], modals: [],
            resolve: ({ target: element }) => {
                const target = ctx.sidebarRight.commandTarget(element);
                if (target === undefined)
                    return { status: 'blocked', reason: t('shortcut.noSession') };
                return { status: 'handled', run: () => { ctx.sidebarRight.openTabFromTarget('browser', target); } };
            },
            /* jscpd:ignore-end */
        }), 'ui-sidebar-browser: shortcut');
    });
    const store = createBrowserStore();
    const openTabs = ctx.sidebarRight.openTabs;
    const carrier = globalThis.dshDesktop;
    const desktop = carrier?.protocolVersion === 1 ? carrier.browser : undefined;
    ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-sidebar-browser.copy');
    ctx.effect(() => ctx.sidebarRightTabs.register({ ...browserDefinition(t), keepMounted: desktop !== undefined }), 'ui-sidebar-browser.type');
    const installFrames = (scope, factory) => {
        const controllers = new Map();
        scope.effect(() => async () => {
            const pending = [...controllers.values()].map(controller => controller.dispose());
            controllers.clear();
            await Promise.all(pending);
        }, 'ui-sidebar-browser.frames');
        scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab', key: BROWSER_ID, locale: namespace, store,
            inject: (sessionId, actions) => {
                const existing = controllers.get(sessionId);
                if (existing !== undefined) {
                    existing.rebind(actions);
                    return existing;
                }
                const controller = createBrowserControllers(actions, factory(sessionId), tabId => openTabs.getSnapshot().some(tab => tab.sessionId === sessionId && tab.tabId === tabId));
                controllers.set(sessionId, controller);
                return controller;
            },
        }, BrowserBody)), 'ui-sidebar-browser.body');
    };
    if (desktop === undefined)
        installFrames(ctx, () => createIframePage);
    else
        ctx.inject(['workspaces'], (scope) => {
            installFrames(scope, sessionId => options => createElectronPage(options, desktop, signal => browserWorkspace(scope.workspaces.list, sessionId, signal)));
        });
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title', key: BROWSER_ID, store,
    }, BrowserTitle)), 'ui-sidebar-browser.title');
}
//# sourceMappingURL=index.js.map