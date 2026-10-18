/**
 * One Session's feedback surface: the message-feedback object layer and the
 * dialog controller, plus the routing between them. A message target puts a
 * selected judgment through the message controller; the Session target records
 * through the `sessionFeedback` Remote.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/surface
 */
import { MessageFeedbackController, describe } from "./controller.js";
import { FeedbackDialogController } from "./dialog.js";
/** The per-session pair behind every entry of one Session. */
export class FeedbackSurface {
    ctx;
    sessionId;
    /** The Session's message-feedback object layer, shared by every message control. */
    feedback;
    /** The Session's dialog and toast state, shared by the overlay entry and the message controls. */
    dialog;
    /**
     * @param ctx - the browser plugin context carrying both feedback Remotes.
     * @param sessionId - Session owning the transcript and the remark.
     */
    constructor(ctx, sessionId) {
        this.ctx = ctx;
        this.sessionId = sessionId;
        this.feedback = new MessageFeedbackController(ctx.remote.messageFeedback, sessionId);
        this.dialog = new FeedbackDialogController((target, entry) => target.kind === 'message'
            ? this.feedback.rate(target.messageId, target.rating, entry)
            : this.recordSession(entry));
    }
    /** Record one Session-level remark through the sessionFeedback Remote. */
    async recordSession(entry) {
        const carried = await this.ctx.remote.sessionFeedback.record({ sessionId: this.sessionId, ...entry });
        if (!carried.ok)
            return { ok: false, error: { code: carried.error.code, message: carried.error.message } };
        if (carried.value.ok)
            return { ok: true };
        return { ok: false, error: { code: carried.value.error.code, message: describe(carried.value.error.code) } };
    }
    /** Drop both controllers when the owning fiber unloads. */
    dispose() {
        this.feedback.dispose();
        this.dialog.dispose();
    }
}
//# sourceMappingURL=surface.js.map