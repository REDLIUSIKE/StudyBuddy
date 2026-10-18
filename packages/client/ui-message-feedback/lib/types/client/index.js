/**
 * Feedback surface plugin, browser half: the Like/Dislike entry in the
 * conversation.chat.assistant-actions strip, the feedback dialog and its
 * acknowledgement and failure toasts in conversation.input.overlay, and the `/feedback`
 * decoration that opens the dialog from the composer menu or a bare typed
 * command. The feedbackUi service opens the same dialog for other plugins.
 * One FeedbackSurface per Session backs every entry in that Session.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client
 */
import { FeedbackDialog } from "./FeedbackDialog.js";
import { MessageFeedbackActions } from "./MessageFeedbackActions.js";
import { FeedbackSurface } from "./surface.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'feedback';
/** Required services: the slot registry, the two Remote namespaces, and the copy. */
export const inject = ['slots', 'remote', 'remote.messageFeedback', 'remote.sessionFeedback', 'locale'];
/**
 * Client plugin body: the per-message feedback entry, the Session's dialog
 * entry, the `feedbackUi` service, the `/feedback` decoration, and their
 * per-session surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-feedback: dictionaries');
    const surfaces = new Map();
    const surfaceFor = (sessionId) => {
        let surface = surfaces.get(sessionId);
        if (surface === undefined) {
            surface = new FeedbackSurface(ctx, sessionId);
            surfaces.set(sessionId, surface);
        }
        return surface;
    };
    ctx.effect(() => () => {
        for (const surface of surfaces.values())
            surface.dispose();
        surfaces.clear();
    }, 'ui-message-feedback: per-session surfaces');
    const feedbackUi = {
        openSession: (sessionId) => { surfaceFor(sessionId).dialog.open({ kind: 'session' }); },
    };
    ctx.provide('feedbackUi', feedbackUi);
    // A reconnect can only invalidate what was already read; a cold Session
    // stays cold until something asks for it.
    ctx.on('connection/reset', () => {
        for (const { feedback } of surfaces.values()) {
            if (feedback.getSnapshot().status !== 'cold')
                void feedback.resync();
        }
    });
    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'feedback',
        order: 10,
        locale: NS,
        inject: (sessionId) => {
            const { feedback, dialog } = surfaceFor(sessionId);
            return {
                hooks: { feedback },
                ensure: () => feedback.ensure(),
                current: messageId => feedback.getSnapshot().items.get(messageId),
                retract: (messageId, rating) => feedback.retract(messageId, rating),
                openDialog: (messageId, rating) => { dialog.open({ kind: 'message', messageId, rating }); },
            };
        },
    }, MessageFeedbackActions));
    ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'feedback-dialog',
        order: 2,
        locale: NS,
        inject: (sessionId) => {
            const { dialog } = surfaceFor(sessionId);
            return {
                hooks: { dialog: dialog.state },
                edit: (draft) => { dialog.edit(draft); },
                submit: () => dialog.submitDraft(),
                dismiss: () => { dialog.dismiss(); },
                dismissFailure: () => { dialog.dismissFailure(); },
                dismissToast: (seq) => { dialog.dismissToast(seq); },
            };
        },
    }, FeedbackDialog));
    // The Host keeps `/feedback <text>` for a typed remark; a bare invocation
    // from the menu or the composer opens the dialog instead.
    ctx.inject(['commandUi'], (scope) => {
        scope.effect(() => scope.commandUi.decorate({
            name: 'feedback',
            available: () => true,
            ui: { kind: 'action', run: (session) => { feedbackUi.openSession(session.sessionId); } },
        }), 'ui-message-feedback: /feedback decoration');
    });
}
//# sourceMappingURL=index.js.map