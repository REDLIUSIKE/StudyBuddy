/** Browser plugin contributing the Session Inspector Log sidebar tab. */
import { en, NS, zh } from "./locales.js";
import { registerInspectorTab } from "./views/index.js";
/** Services required to register the localized Session-bound sidebar tab. */
export const inject = ['slots', 'locale', 'sessions', 'uiSession', 'uiConversation', 'sidebarRightTabs'];
/**
 * Register the Inspector tab for this plugin's lifetime.
 * @param ctx - Client plugin context owning the dictionaries and registrations.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-inspector: dictionaries');
    registerInspectorTab(ctx);
}
//# sourceMappingURL=index.js.map