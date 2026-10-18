/**
 * Built-in plugins settings section, browser half: the shell around the
 * feature-owned tabs registered into `settings.plugins.tab` (the read-only
 * inventory ships one). The configuration pages of the host-plane plugins
 * live in their own companion packages, which register into the Plugins
 * page; this section owns the Settings navigation entry and the tab chrome
 * only.
 */
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots';
import { PluginsSettingsSection } from "./PluginsSettingsSection.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'settings.plugins';
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale'];
/**
 * Mount the built-in plugins section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugins: section dictionaries');
    let tabsVersion = -1;
    let tabsRevision = -1;
    let tabs = [];
    const sectionInjected = () => ({
        hooks: {
            tabs: {
                getSnapshot: () => {
                    const version = ctx.slots.getVersion('settings.plugins.tab');
                    const revision = ctx.locale.getSnapshot().revision;
                    if (version !== tabsVersion || revision !== tabsRevision) {
                        tabsVersion = version;
                        tabsRevision = revision;
                        tabs = ctx.slots.entries('settings.plugins.tab')
                            .map(entry => ({
                            /* v8 ignore next -- list-slot registration requires id */
                            id: entry.options.id ?? '',
                            order: entry.options.order ?? 0,
                            label: resolveSlotLabel(entry.options.label) ?? '',
                        }))
                            .sort((a, b) => a.order - b.order);
                    }
                    return tabs;
                },
                subscribe: (listener) => {
                    const offLedger = ctx.slots.subscribe('settings.plugins.tab', listener);
                    const offLocale = ctx.locale.subscribe(listener);
                    return () => {
                        offLedger();
                        offLocale();
                    };
                },
            },
        },
    });
    // This package owns the one Built-in plugins navigation entry and the tab
    // chrome; feature plugins contribute pages without competing for Settings nav rows.
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'plugins',
        order: 15,
        label: () => t('nav'),
        locale: NS,
        inject: sectionInjected,
        children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
    }, PluginsSettingsSection));
}
//# sourceMappingURL=index.js.map