/**
 * Headless state of one Session's feedback dialog and its acknowledgement and
 * failure toasts. One form serves two targets: the Session itself (a bare `/feedback`)
 * and one assistant message (Like or Dislike). The overlay view renders from
 * the store and raises the acknowledgement after a successful submission.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/dialog
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
const CLOSED = {
    target: null, category: null, text: '', submitting: false, failure: null,
};
/** Per-session dialog controller; one instance backs the overlay entry and every message control. */
export class FeedbackDialogController {
    submit;
    /** Dialog state store (the overlay entry subscribes here). */
    state = createSnapshotStore({ ...CLOSED, toast: 0 });
    /** Bumped by every open, dismiss, and dispose so a late settlement can tell its draft is gone. */
    generation = 0;
    toastSeq = 0;
    /**
     * @param submit - records one submission; the owner routes it by target.
     */
    constructor(submit) {
        this.submit = submit;
    }
    /**
     * Open the dialog with an empty draft, replacing any open draft.
     * @param target - what the submission records against.
     */
    open(target) {
        this.generation += 1;
        this.state.set({ ...CLOSED, target, toast: this.state.getSnapshot().toast });
    }
    /** Close the dialog and discard the draft; a toast on screen stays. */
    dismiss() {
        this.generation += 1;
        this.state.set({ ...CLOSED, toast: this.state.getSnapshot().toast });
    }
    /**
     * Replace part of the draft while it is editable.
     * @param draft - the category (null clears it) or the text as typed.
     */
    edit(draft) {
        const s = this.state.getSnapshot();
        if (s.target === null || s.submitting)
            return;
        this.state.set({ ...s, ...draft });
    }
    /**
     * Submit the draft; an empty draft is a valid submission. Success closes the
     * dialog and raises the acknowledgement toast; a failure keeps the dialog
     * open and publishes its code for the failure toast.
     * @returns after the submission settles.
     */
    async submitDraft() {
        const s = this.state.getSnapshot();
        if (s.target === null || s.submitting)
            return;
        const generation = this.generation;
        this.state.set({ ...s, submitting: true, failure: null });
        const text = s.text.trim();
        const result = await this.submit(s.target, {
            ...(text.length === 0 ? {} : { text }),
            ...(s.category === null ? {} : { category: s.category }),
        });
        if (result.ok) {
            // The remark is recorded whichever draft is on screen now, so the toast
            // always shows; only the draft that produced it closes.
            if (generation === this.generation)
                this.dismiss();
            this.acknowledge();
            return;
        }
        if (generation !== this.generation)
            return;
        this.state.set({ ...this.state.getSnapshot(), submitting: false, failure: result.error.code, toast: 0 });
    }
    /** Clear the current failure toast without closing its draft. */
    dismissFailure() {
        const s = this.state.getSnapshot();
        this.state.set({ ...s, failure: null });
    }
    /** Show the acknowledgement toast; a toast already on screen restarts. */
    acknowledge() {
        this.toastSeq += 1;
        this.state.set({ ...this.state.getSnapshot(), toast: this.toastSeq });
    }
    /**
     * Retire one toast after its fade; a newer toast is left alone.
     * @param seq - the toast sequence the view finished showing.
     */
    dismissToast(seq) {
        const s = this.state.getSnapshot();
        if (s.toast === seq)
            this.state.set({ ...s, toast: 0 });
    }
    /** Scope-teardown disposer: drop the draft and the toast, orphan in-flight work. */
    dispose() {
        this.generation += 1;
        this.state.set({ ...CLOSED, toast: 0 });
    }
}
//# sourceMappingURL=dialog.js.map