import { PluginManagerPage } from "./PluginManagerPage.js";
import { PluginRefreshToast } from "./PluginRefreshToast.js";
import { configLedgerSource } from "./config-ledger.js";
import { PluginManagerController } from "./manager-store.js";
import { en, zh } from "./locales.js";
import { createNavigationStore } from "./navigation-store.js";
import { preloadPages } from '@deepseek-ai/dsh-client-ui-primitives';
/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager';
/** Settings section identity used by plugin configuration links. */
const SECTION_ID = 'plugin-manager';
/** Settings navigation and Remote methods; inventory says whether the Host manages a profile. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms', 'settingsNavigation'];
/**
 * Contribute the Plugins settings section and keep it current on Host changes.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-manager: dictionaries');
    const t = ctx.locale.bind(NS);
    const controller = new PluginManagerController(ctx);
    ctx.effect(() => () => { controller.dispose(); }, 'ui-plugin-manager: controller');
    ctx.effect(() => preloadPages([{ id: 'plugins', priority: 70, prepare: () => controller.load() }]), 'ui-plugin-manager: background inventory');
    // The Host says when what is installed, enabled, or composed changed — from
    // this page, the CLI, or another browser — and streams install output.
    ctx.effect(() => {
        // A page never rendered holds no snapshot to refresh.
        const refresh = () => {
            if (controller.getSnapshot().status !== 'idle')
                void controller.load();
        };
        const disposers = [
            ctx.remote.$on('plugin-manager/changed', refresh),
            ctx.remote.$on('plugin-manager/install-log', (chunk) => { controller.appendLog(chunk); }),
            ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.installProgress(progress); }),
            ctx.on('connection/reset', refresh),
        ];
        return () => { for (const dispose of disposers)
            dispose(); };
    }, 'ui-plugin-manager: host invalidations');
    // The settings section belongs to the profile, not to a Session.
    // What is installed and switched on is
    // the page's own; a plugin's configuration arrives through the slots the
    // page declares here, so the page never names a configurable plugin.
    const configLedger = configLedgerSource(ctx);
    const face = controller.inject(configLedger, text => ctx.locale.resolveText(text));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'plugin-manager.refresh-toast', locale: NS,
        inject: () => ({
            hooks: { pluginManager: face.hooks.pluginManager },
            dismissNotice: face.dismissNotice,
        }),
    }, PluginRefreshToast));
    ctx.slots.inject('settings.section', function* () {
        const handle = createNavigationStore(), instance = handle.create();
        const store = { ...handle, create: () => instance };
        yield ctx.slots.register({
            name: 'settings.section',
            id: SECTION_ID,
            order: 17,
            label: () => t('panel'),
            locale: NS,
            store,
            inject: () => face,
            children: {
                'plugins.add.actions': { kind: 'list', scope: 'root' },
                'plugins.item': { kind: 'list', scope: 'root' },
                'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
                'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
                'plugins.row.config': { kind: 'keyed', scope: 'root' },
                'plugins.detail.actions': { kind: 'list', scope: 'root' },
                'plugins.detail.badge': { kind: 'list', scope: 'root' },
                'plugins.detail.section': { kind: 'list', scope: 'root' },
            },
        }, PluginManagerPage);
        yield ctx.settingsNavigation.state.subscribe(() => {
            const state = ctx.settingsNavigation.state.getSnapshot();
            if (!state.open || state.activeId !== SECTION_ID)
                instance.actions.setView({ kind: 'list' });
        });
        const disposeNavigation = ctx.reflect.provide('pluginNavigation', {
            openBundle: (packageName) => {
                ctx.settingsNavigation.openSection(SECTION_ID);
                instance.actions.setView({ kind: 'package', name: packageName });
            },
        });
        yield () => { void disposeNavigation(); };
    });
}
//# sourceMappingURL=index.js.map