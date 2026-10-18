/** Source-safe Agent Teams browser registration. */
import { TeamAction } from "./TeamAction.js";
import { en, NS, zh } from "./locales.js";
/** Required browser services for navigation, slots, and localized copy. */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale'];
/**
 * Register the Team locale dictionaries and the conversation-header action.
 * The panel reads the Lead Session's `agentTeam` projection from the shared
 * Session store; this registration performs no Team RPC.
 * @param ctx - Client Context carrying the injected navigation, locale, slot, and Session services.
 */
export function registerAgentTeamUi(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team: dictionaries');
    const sessions = ctx.sessions;
    const leadSessionId = (sessionId) => {
        const address = sessions.binding(sessionId)?.session.getSnapshot().subagent?.address;
        return address?.parentSessionId ?? sessionId;
    };
    const actions = {
        openTeammate(sessionId, childSessionId) {
            const parentSessionId = leadSessionId(sessionId);
            if ((sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) === 0)
                return;
            if (childSessionId === parentSessionId) {
                ctx.uiWorkspace.openSession(parentSessionId);
                return;
            }
            ctx.uiWorkspace.openSession({
                parentSessionId,
                childSessionId,
                mode: 'continuable',
            });
        },
    };
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'agent-team',
        order: -20,
        locale: NS,
        inject: () => actions,
    }, TeamAction));
}
//# sourceMappingURL=mount.js.map