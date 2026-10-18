import { PermissionCatalogDirectory } from "./catalog.js";
import { PermissionSelect } from "./PermissionSelect.js";
import { PermissionRow } from "./PermissionRow.js";
import { accessEn, accessZh, en, PERMISSION_ACCESS_NS, zh, } from "./locales.js";
import { AUTO_REVIEW_PRESET, displayPermissionPreset, FULL_ACCESS_PRESET, } from "./presentation.js";
import { PermissionPresetSettingsController } from "./settings-store.js";
/** Required services (cordis fiber inject). */
export const inject = [
    'commandUi', 'connection', 'sessions', 'slots', 'locale', 'remote',
    'remote.permissionPresets', 'remote.settings',
    'configForms', 'settingsSchema',
];
/** Read one session's current permissions projection value (undefined = capability absent). */
function selectionOf(session) {
    return session?.projections.faceOf('permissions').getSnapshot();
}
/** Join the process catalog with one Session's current value. */
function optionsOf(catalog, currentValue, t) {
    return catalog.options
        .map(option => ({
        id: option.value,
        label: option.value === AUTO_REVIEW_PRESET
            ? t('auto.label')
            : displayPermissionPreset(option.value, option.name, t),
        ...(option.value === AUTO_REVIEW_PRESET ? { badge: t('auto.badge') } : {}),
        ...(option.value === AUTO_REVIEW_PRESET
            ? { detail: t('auto.description') }
            : option.description !== undefined ? { detail: option.description } : {}),
        ...(option.value === currentValue ? { active: true } : {}),
        ...(option.value === FULL_ACCESS_PRESET || option.value === AUTO_REVIEW_PRESET
            ? {
                confirmation: {
                    title: t(option.value === AUTO_REVIEW_PRESET ? 'auto.confirm.title' : 'confirm.title'),
                    description: t(option.value === AUTO_REVIEW_PRESET ? 'auto.confirm.description' : 'confirm.description'),
                    acknowledgeLabel: t(option.value === AUTO_REVIEW_PRESET ? 'auto.confirm.acknowledge' : 'confirm.acknowledge'),
                    cancelLabel: t('confirm.cancel'),
                    confirmLabel: t(option.value === AUTO_REVIEW_PRESET ? 'auto.confirm.enable' : 'confirm.enable'),
                },
            }
            : {}),
    }));
}
/**
 * Client plugin body: register the /permission popup picker over the
 * permissions projection.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const command = ctx.get('commandUi');
    const sessions = ctx.sessions;
    ctx.effect(() => ctx.locale.register(PERMISSION_ACCESS_NS, { zh: accessZh, en: accessEn }), 'ui-permission: current-session dictionaries');
    const t = ctx.locale.bind(PERMISSION_ACCESS_NS);
    const sessionFor = (session) => sessions.binding(session.sessionId)?.session;
    const submit = async (sessionId, preset) => {
        const live = sessions.binding(sessionId)?.session;
        if (live === undefined)
            throw new Error('this session is not materialized yet');
        const result = await live.command(`/permission ${preset}`);
        if (!result.ok) {
            throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`);
        }
        if (!result.value.matched)
            throw new Error('the host offers no /permission command');
        return true;
    };
    const catalog = new PermissionCatalogDirectory(ctx);
    ctx.effect(() => () => { catalog.dispose(); }, 'ui-permission: process catalog directory');
    ctx.effect(
    // Only an invalidation makes displayed options stale; publishing the result
    // of a read a displayed picker waits for must leave it open with its failure
    // and retry state intact.
    () => catalog.invalidations.subscribe(() => { command.dismiss('permission'); }), 'ui-permission: dismiss stale slash choices');
    ctx.effect(() => ctx.locale.register('settings.permission', { zh, en }), 'ui-permission: settings row dictionaries');
    // The shared ConfigForm mirror updates after document commits and reconnects.
    const controller = new PermissionPresetSettingsController(ctx.configForms.describe(), ctx, catalog);
    const load = () => controller.load();
    const select = (preset) => controller.select(preset);
    const injected = () => ({
        hooks: { permission: controller.store },
        load,
        select,
    });
    ctx.effect(() => () => { controller.dispose(); }, 'ui-permission: settings row directory');
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'permission',
        order: -20,
        locale: 'settings.permission',
        inject: injected,
    }, PermissionRow));
    ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
        name: 'conversation.input.permission',
        locale: PERMISSION_ACCESS_NS,
        inject: (sessionId) => ({
            hooks: { permissionCatalog: catalog.store },
            select: preset => submit(sessionId, preset),
        }),
    }, PermissionSelect));
    ctx.effect(() => command.decorate({
        name: 'permission',
        // The Session's current value alone decides availability. A missing catalog
        // surfaces through `options()`, which keeps the picker's own retry entry
        // reachable after a failed read instead of hiding the command.
        available: session => selectionOf(sessionFor(session)) !== undefined,
        ui: {
            kind: 'popupSelect',
            options: async (session) => {
                const selection = selectionOf(sessionFor(session));
                if (selection === undefined)
                    throw new Error('permission presets are not available on this host');
                return optionsOf(await catalog.load(), selection.currentValue, t);
            },
            onSelect: (option, session) => submit(session.sessionId, option.id).then(() => undefined),
        },
    }), 'ui-permission: /permission decoration');
}
//# sourceMappingURL=index.js.map