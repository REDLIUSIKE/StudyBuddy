/** Best-effort background attention never grants update or task-stop authorization. */
import { app, Notification } from 'electron';
/** Owns one reminder per downloaded version until reset for a new download. */
export class DesktopUpdateAttention {
    locale;
    platform;
    version;
    notification;
    stop;
    /**
     * @param locale - Shell-owned notification copy.
     * @param platform - Native attention implementation, replaceable for platform tests.
     */
    constructor(locale, platform = process.platform) {
        this.locale = locale;
        this.platform = platform;
    }
    /**
     * @param version - Prepared target whose confirmation is waiting.
     * @param parent - Taskbar window; never restored or focused by the reminder.
     * @param modal - Existing installation confirmation.
     * @param returnToConfirmation - Rechecks current policy and returns to UI without installing.
     */
    ready(version, parent, modal, returnToConfirmation) {
        if (this.version === version)
            return;
        this.version = version;
        if (parent.isFocused() || modal.isFocused())
            return;
        const clear = () => { this.clear(); };
        let bounce;
        parent.on('focus', clear);
        modal.on('focus', clear);
        this.stop = () => {
            parent.off('focus', clear);
            modal.off('focus', clear);
            if (this.platform === 'win32' && !parent.isDestroyed())
                parent.flashFrame(false);
            if (bounce !== undefined)
                app.dock?.cancelBounce(bounce);
        };
        try {
            if (this.platform === 'win32')
                parent.flashFrame(true);
            if (this.platform === 'darwin')
                bounce = app.dock?.bounce('informational');
        }
        catch (error) {
            console.warn('desktop update: attention unavailable', error);
        }
        try {
            if (!Notification.isSupported())
                return;
            const notification = new Notification({ title: this.locale.messages.mandatoryReady,
                body: this.locale.messages.mandatoryNotification, silent: true });
            this.notification = notification;
            notification.on('failed', () => {
                if (this.notification === notification)
                    this.notification = undefined;
                notification.removeAllListeners();
            });
            notification.once('click', () => {
                if (this.notification !== notification)
                    return;
                this.clear();
                returnToConfirmation();
            });
            notification.show();
        }
        catch (error) {
            console.warn('desktop update: notification unavailable', error);
        }
    }
    /** Release owned native reminders without scheduling another for the same target. */
    clear() {
        const notification = this.notification;
        this.notification = undefined;
        notification?.removeAllListeners();
        try {
            notification?.close();
        }
        catch (error) {
            console.warn('desktop update: could not close notification', error);
        }
        const stop = this.stop;
        this.stop = undefined;
        try {
            stop?.();
        }
        catch (error) {
            console.warn('desktop update: could not clear attention', error);
        }
    }
    /** Start a new download episode, or dispose all owned reminders. */
    reset() { this.clear(); this.version = undefined; }
}
//# sourceMappingURL=update-attention.js.map