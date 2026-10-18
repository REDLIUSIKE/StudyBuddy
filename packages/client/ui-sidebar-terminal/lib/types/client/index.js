import { PluginArtworkTerminal } from '@deepseek-ai/dsh-client-ui-primitives';
import { TerminalGuide } from "./TerminalGuide.js";
import { LazyTerminalBody } from "./LazyTerminalBody.js";
import { TerminalTitle } from "./TerminalTitle.js";
import { en, zh } from "./locales.js";
/** Services needed by the terminal's two sidebar seats. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'webTerminals', 'theme', 'shortcuts'];
/**
 * Register the terminal type, observable views and background process cleanup.
 * @param ctx - Client root Context with sidebar and terminal services.
 */
export function apply(ctx) {
    // let disposed = false
    // const recovered = new Map<SessionId, Promise<void>>()
    // ctx.effect(() => () => { disposed = true; recovered.clear() }, 'ui-sidebar-terminal.lifetime')
    ctx.effect(() => {
        const sync = () => { ctx.webTerminals.retainTabs(ctx.sidebarRight.openTabs.getSnapshot().filter(tab => tab.kind === 'terminal')); };
        const unsubscribe = ctx.sidebarRight.openTabs.subscribe(sync);
        sync();
        return () => { unsubscribe(); ctx.webTerminals.retainTabs([]); };
    }, 'ui-sidebar-terminal.window-holds');
    const target = (sessionId, key) => ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key }).navigation.getSnapshot().params;
    const terminalId = (sessionId, key) => {
        const params = target(sessionId, key);
        return params !== undefined && 'terminalId' in params ? params.terminalId : undefined;
    };
    const view = (sessionId, key) => {
        const params = target(sessionId, key);
        const contentId = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key }).navigation.getSnapshot().address;
        return ctx.webTerminals.view(sessionId, key, contentId, terminalId(sessionId, key), params !== undefined && 'shellPath' in params ? params.shellPath : undefined);
    };
    const namespace = 'sidebarTerminal';
    const id = '@deepseek-ai/dsh-client-ui-sidebar-terminal';
    const t = ctx.locale.bind(namespace);
    ctx.effect(() => ctx.shortcuts.register({
        id: 'terminal.new', label: () => t('new'), aliases: ['new terminal', 'shell'],
        defaults: {
            'desktop:macos': { code: 'Backquote', modifiers: ['control'] },
            'desktop:windows': { code: 'Backquote', modifiers: ['control'] },
            'desktop:linux': { code: 'Backquote', modifiers: ['control'] },
            'web:macos': { code: 'Backquote', modifiers: ['control'] },
            'web:windows': { code: 'Backquote', modifiers: ['control'] },
        },
        regions: ['page', 'editable', 'terminal'], modals: [],
        resolve: ({ target: element }) => {
            const target = ctx.sidebarRight.commandTarget(element);
            if (target === undefined)
                return { status: 'blocked', reason: t('shortcut.noSession') };
            return { status: 'handled', run: () => { ctx.sidebarRight.openTabFromTarget('terminal', target); } };
        },
    }), 'ui-sidebar-terminal: shortcut');
    ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-sidebar-terminal.copy');
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id, kind: 'terminal', multiple: true, priority: 'builtin', title: () => t('title'),
        guide: [{ id: 'new', order: 20, title: () => t('new'), description: () => t('description'), icon: PluginArtworkTerminal }],
    }), 'ui-sidebar-terminal.type');
    ctx.effect(() => ctx.sidebarRight.registerCloseHandler('terminal', (sessionId, tab) => {
        ctx.webTerminals.close(sessionId, tab.id, tab.contentId, terminalId(sessionId, tab.id));
    }), 'ui-sidebar-terminal.close');
    const inject = (sessionId) => ({
        view: key => view(sessionId, key),
        keyedHooks: { terminal: key => view(sessionId, key).state },
    });
    const theme = {
        getSnapshot: () => ctx.theme.getTheme(),
        subscribe: listener => ctx.on('theme/change', listener),
    };
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
        name: 'sidebar.right.tab.guide.entry', key: id, locale: namespace,
        inject: (sessionId) => ({
            hooks: { shortcuts: ctx.shortcuts.catalog },
            loadShells: signal => ctx.webTerminals.launchShells(sessionId, signal),
            selectShell: (path) => { ctx.webTerminals.selectShell(path); },
        }),
    }, TerminalGuide)), 'ui-sidebar-terminal.guide');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, locale: namespace,
        inject: (sessionId) => ({ ...inject(sessionId), hooks: { theme } }),
    }, LazyTerminalBody)), 'ui-sidebar-terminal.body');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: id, locale: namespace, inject }, TerminalTitle)), 'ui-sidebar-terminal.title');
    // ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    //   name: 'conversation.session.header.actions', id, locale: namespace,
    //   inject: (sessionId): TerminalRecoveryInjected => ({
    //     restore: () => {
    //       let pending = recovered.get(sessionId)
    //       if (pending === undefined) {
    //         for (const tab of ctx.sidebarRight.tabsIn(sessionId)) {
    //           if (tab.kind === 'terminal') view(sessionId, tab.id)
    //         }
    //         pending = ctx.webTerminals.recover(sessionId).then((terminals) => {
    //           if (disposed) return
    //           for (const info of terminals) ctx.sidebarRight.openTabIn(sessionId, 'terminal', {
    //             params: { terminalId: info.id },
    //           })
    //         }).catch((error: unknown) => { recovered.delete(sessionId); throw error })
    //         recovered.set(sessionId, pending)
    //       }
    //       return pending
    //     },
    //   }),
    // }, TerminalRecovery)), 'ui-sidebar-terminal.recovery')
    // ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    //   name: 'shell.overlay', id, locale: namespace,
    //   inject: (): TerminalCleanupInjected => ({
    //     hooks: { closeFailures: ctx.webTerminals.closeFailures },
    //     retryClose: (terminalId) => { ctx.webTerminals.retryClose(terminalId) },
    //   }),
    // }, TerminalCleanup)), 'ui-sidebar-terminal.cleanup')
}
//# sourceMappingURL=index.js.map