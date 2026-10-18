import { SubagentCatalogAction, SubagentHeaderLineage } from "./SubagentHeaderLineage.js";
import { SubagentReadOnlyComposer, } from "./SubagentReadOnlyComposer.js";
import { registerSidebarChat, subagentChatAddress } from "./sidebar-chat/index.js";
import { en, NS, zh } from "./locales.js";
/** Required services for subagent presentation and navigation. */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale', 'sidebarRight'];
/** Claim the composer for one-shot history or an unavailable continuation owner. */
function selectReadOnlySubagent(owner) {
    const subagent = owner.session?.subagent;
    if (subagent === undefined || subagent === null)
        return null;
    if (subagent.address.mode === 'unknown')
        return { reason: 'unknown' };
    if (subagent.address.mode === 'one-shot')
        return { reason: 'one-shot' };
    // Until a Host summary establishes parent availability, keep the normal
    // disabled composer instead of claiming that the parent is offline.
    if (subagent.parentAvailable !== false)
        return null;
    // A RUNNING parent-offline continuable child keeps the default composer:
    // its input is disabled there, but the same primary Stop stays available so
    // the child can be interrupted. Once it stops, this takeover returns.
    return owner.session?.running === true ? null : { reason: 'parent-unavailable' };
}
/**
 * Client plugin body: register the subagent catalog and read-only composer seats.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-subagent: dictionaries');
    ctx.inject(['resources', 'sidebarRightTabs'], (scope) => {
        registerSidebarChat(scope, ctx.locale.bind(NS));
    });
    const catalogActions = (_parentSessionId) => ({
        openChild(address) {
            ctx.uiWorkspace.openSession(address);
        },
        openChildAside(address) {
            ctx.sidebarRight.openResource(subagentChatAddress(address), {
                kind: 'subagentchat',
                preferNewPane: true,
            });
        },
        refreshProjection(parentSessionId) {
            void ctx.sessions.refreshProjections(parentSessionId);
        },
    });
    ctx.slots.inject('conversation.session.header.lineage', () => ctx.slots.register({
        name: 'conversation.session.header.lineage',
        locale: NS,
        inject: catalogActions,
    }, SubagentHeaderLineage));
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'subagent-catalog',
        // Leads the band, directly after the title crumbs: subagent lineage is
        // the title's own continuation, ahead of Team navigation (-20) and the
        // preset label (-10).
        order: -30,
        locale: NS,
        inject: catalogActions,
    }, SubagentCatalogAction));
    ctx.slots.inject('conversation.composer', () => ctx.slots.register({
        name: 'conversation.composer',
        priority: -10,
        locale: NS,
        select: selectReadOnlySubagent,
    }, SubagentReadOnlyComposer));
}
//# sourceMappingURL=index.js.map