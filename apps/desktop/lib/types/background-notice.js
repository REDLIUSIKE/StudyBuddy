/** One-time Windows confirmation before hiding the application in the tray. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
/** Only an explicit acknowledgement permits the first hide; cancelled prompts remain eligible. */
export class DesktopBackgroundNotice {
    options;
    acknowledged = false;
    pending = false;
    disposed = false;
    /** @param options - Marker path, localized copy, and shell dialog actions. */
    constructor(options) {
        this.options = options;
    }
    /**
     * Request a window hide, prompting until acknowledged and coalescing repeated requests.
     * @param hide - Hide the still-owned window after acknowledgement, or immediately when already recorded.
     */
    close(hide) {
        if (this.disposed)
            return;
        if (this.pending) {
            this.options.focus();
            return;
        }
        if (this.acknowledged || existsSync(this.options.markerPath)) {
            hide();
            return;
        }
        this.pending = true;
        void this.confirm(hide);
    }
    /** Ignore late dialog responses after application shutdown begins. */
    dispose() { this.disposed = true; }
    async confirm(hide) {
        try {
            const { messages } = this.options.locale();
            const result = await this.options.show({ type: 'info', title: messages.aboutProduct,
                message: messages.backgroundNoticeBody, buttons: [messages.backgroundNoticeConfirm], defaultId: 0, cancelId: -1 });
            if (this.disposed || result.response !== 0)
                return;
            this.acknowledged = true;
            try {
                mkdirSync(dirname(this.options.markerPath), { recursive: true });
                writeFileSync(this.options.markerPath, '');
            }
            catch (error) {
                console.warn('desktop tray: could not record background confirmation', error);
            }
            hide();
        }
        catch (error) {
            console.warn('desktop tray: background confirmation unavailable', error);
        }
        finally {
            this.pending = false;
        }
    }
}
//# sourceMappingURL=background-notice.js.map