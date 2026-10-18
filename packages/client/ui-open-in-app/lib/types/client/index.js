/**
 * Shared native opening controls for workspace directories, document previews,
 * delivery cards, and changed-file review. Directory choices persist in the browser;
 * file defaults and application lists come from the serving Host desktop.
 */
import { createElement } from 'react';
import { OPEN_IN_APP_ICON_PREFIX_ROUTE } from '@deepseek-ai/dsh-host-open-in-app/shared';
import { OpenInAppController } from "./controller.js";
import { OpenInAppAction } from "./OpenInAppAction.js";
import { OpenInAppPathController } from "./open-path.js";
import { OpenPathAction } from "./OpenPathAction.js";
import { FileRouteAction } from "./FileRouteAction.js";
import { OpenPathEmptyAction } from "./OpenPathEmptyAction.js";
import { en, NS, zh } from "./locales.js";
/** Required services: sessions, layout selection, the slot registry, copy, Remote calls, and shortcuts. */
export const inject = ['sessions', 'slots', 'locale', 'remote', 'remote.session', 'shortcuts', 'layout'];
/**
 * Client plugin body: register dictionaries, workspace directory controls, and
 * document preview path controls.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const controller = new OpenInAppController();
    void controller.load();
    const paths = new OpenInAppPathController(ctx.remote);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'open-in-app: dictionaries');
    const t = ctx.locale.bind(NS);
    const target = () => {
        if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null)
            return undefined;
        const session = Object.values(ctx.sessions.list.getSnapshot().byId)
            .find(row => (row.retainedBy.mainView ?? 0) > 0);
        const appId = controller.currentApp();
        return session?.cwd && appId !== undefined ? { appId, path: session.cwd } : undefined;
    };
    ctx.effect(() => ctx.shortcuts.register({
        id: 'workspace.openLocal', label: () => t('open.tooltip'), aliases: ['open workspace locally', 'open in app'],
        defaults: {
            'desktop:macos': { code: 'KeyO', modifiers: ['primary', 'alt'] },
            'desktop:windows': { code: 'KeyO', modifiers: ['primary', 'alt'] },
            'desktop:linux': { code: 'KeyO', modifiers: ['primary', 'alt'] },
            'web:macos': { code: 'KeyO', modifiers: ['primary', 'shift'] },
            'web:windows': { code: 'KeyO', modifiers: ['primary', 'shift'] },
        },
        regions: ['page', 'editable'], modals: [],
        resolve: () => {
            if (controller.operation.getSnapshot().phase === 'busy')
                return { status: 'blocked', reason: t('shortcut.busy') };
            const selected = target();
            if (selected === undefined)
                return { status: 'blocked', reason: t('shortcut.unavailable') };
            return { status: 'handled', run: () => {
                    void controller.launch(selected.appId, selected.path).catch((error) => {
                        console.warn('workspace open rejected:', error);
                    });
                } };
        },
    }), 'open-in-app: workspace command');
    const directoryInjected = () => ({
        hooks: {
            openInAppApps: controller.apps,
            openInAppChoice: controller.choice,
            openInAppLaunch: controller.operation,
            shortcuts: ctx.shortcuts.catalog,
        },
        launch: (appId, path) => controller.launch(appId, path),
        choose: (appId) => { controller.choose(appId); },
        iconUrl: appId => `${OPEN_IN_APP_ICON_PREFIX_ROUTE}/${appId}`,
    });
    function SessionOpenInAppAction(props) {
        const { sessionId, useSessions } = props;
        const cwd = useSessions(state => state.byId[sessionId]?.cwd);
        return cwd ? createElement(OpenInAppAction, { ...props, absolutePath: cwd }) : null;
    }
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'open-in-app', order: -10, locale: NS, inject: directoryInjected,
    }, SessionOpenInAppAction));
    ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.files.actions',
        id: 'open-in-app', locale: NS, inject: directoryInjected,
    }, OpenInAppAction));
    const applications = (path, signal) => paths.applications(path, signal);
    const pathInjected = () => ({
        hooks: { openInAppDesktop: paths.desktop },
        loadDesktop: () => paths.load(),
        openPath: (path, action, application) => paths.openPath(path, action, application),
        applications,
    });
    ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.document.actions',
        id: 'open-in-app',
        locale: NS,
        inject: pathInjected,
    }, OpenPathAction));
    ctx.slots.inject('sidebar.right.tab.document.unpreviewable', () => ctx.slots.register({
        name: 'sidebar.right.tab.document.unpreviewable',
        id: 'open-in-app',
        locale: NS,
        inject: pathInjected,
    }, OpenPathEmptyAction));
    ctx.slots.inject('deliverables.file.actions', () => ctx.slots.register({
        name: 'deliverables.file.actions', id: 'open-in-app', locale: NS,
    }, FileRouteAction));
    ctx.slots.inject('deliverables.review.file.actions', () => ctx.slots.register({
        name: 'deliverables.review.file.actions', id: 'open-in-app', locale: NS,
    }, FileRouteAction));
}
//# sourceMappingURL=index.js.map