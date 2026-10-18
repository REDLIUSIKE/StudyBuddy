import css from '../view/Browser.module.css';
/** Owns tag creation and attachment, without measuring or following another element. */
export class ElectronWebviewPresentation {
    events;
    element;
    host;
    constructor(events) {
        this.events = events;
    }
    /** @param viewportId - committed content container. @returns ends attachment and releases its guest. */
    mount(viewportId) {
        const host = document.getElementById(viewportId);
        if (host === null)
            throw new Error('Electron presentation: content container is not mounted');
        if (this.host !== undefined)
            this.events.unmounted();
        this.host = host;
        this.events.mounted();
        return () => {
            if (this.host !== host)
                return;
            this.events.unmounted();
            this.host = undefined;
        };
    }
    /**
     * Configure a detached webview for an approved guest reservation.
     * @param reservation - main-approved partition and bootstrap lease.
     * @returns a detached, configured webview.
     */
    createElement(reservation) {
        const element = document.createElement('webview');
        element.className = css.webview;
        element.dataset.sidebarBrowserFrame = 'webview';
        element.setAttribute('name', reservation.lease);
        element.setAttribute('partition', reservation.partition);
        element.setAttribute('allowpopups', '');
        element.setAttribute('src', 'about:blank#' + reservation.lease);
        return element;
    }
    /**
     * Attach a prepared guest, removing any previous guest DOM from the container.
     * @param element - configured guest with its navigation listeners already installed.
     * @throws when no content container is mounted.
     */
    present(element) {
        if (this.host === undefined)
            throw new Error('Electron presentation: cannot attach without a content container');
        this.clear();
        this.element = element;
        this.host.append(element);
    }
    /**
     * Set the guest element's accessible label.
     * @param title - observed document title.
     */
    show(title) {
        this.element?.setAttribute('aria-label', title);
    }
    /** Destroy only the guest DOM; a replacement may use the same mounted container. */
    clear() {
        this.element?.remove();
        this.element = undefined;
    }
    /** Destroy the guest DOM and release its content container. */
    dispose() {
        this.clear();
        this.host = undefined;
    }
}
//# sourceMappingURL=ElectronWebviewPresentation.js.map