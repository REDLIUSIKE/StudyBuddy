/** Ordered preference writes and notices that survive the settings panel. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Writes the Host setting without publishing an optimistic upload state. */
export class UploadPreference {
    form;
    /** Observable mutation outcome. */
    state = createSnapshotStore({ busy: false, notice: null, sequence: 0 });
    /** @param form - Host-owned configuration form. */
    constructor(form) {
        this.form = form;
    }
    /**
     * Persist enablement; refusal or transport failure leaves the accepted value visible.
     * @param enabled - requested upload state.
     * @returns completion after the write settles.
     */
    async setEnabled(enabled) {
        if (this.state.getSnapshot().busy)
            return;
        this.state.update((state) => { state.busy = true; state.notice = null; });
        let accepted = false;
        try {
            accepted = await this.form.set('enabled', enabled);
        }
        catch (_error) {
            // The shell notice reports the failed write while the form retains accepted state.
        }
        this.state.update((state) => {
            state.busy = false;
            state.notice = accepted ? 'saved' : 'failed';
            state.sequence++;
        });
    }
    /** Clear the displayed mutation notice. */
    dismiss() {
        this.state.update((state) => { state.notice = null; });
    }
}
//# sourceMappingURL=upload-preference.js.map