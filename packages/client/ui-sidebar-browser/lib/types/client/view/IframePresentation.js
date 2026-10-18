import css from './Browser.module.css';
/** Fixed iframe policy; top navigation and downloads are not granted directly. */
export const WEB_BROWSER_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox';
/** Owns the iframe element; navigation and history remain in IframeImpl. */
export class IframePresentation {
    events;
    host;
    element;
    document;
    rendered = false;
    /** @param events - provider-owned load and remount callbacks. */
    constructor(events) {
        this.events = events;
    }
    /** @param viewportId - mounted placeholder. @returns removes only the iframe presentation. */
    mount(viewportId) {
        const host = document.getElementById(viewportId);
        if (host === null)
            throw new Error('iframe presentation: viewport is not mounted');
        this.element?.remove();
        this.element = undefined;
        this.host = host;
        if (this.rendered)
            this.events.remounted();
        else
            this.render();
        return () => {
            if (this.host !== host)
                return;
            this.element?.remove();
            this.element = undefined;
            this.host = undefined;
        };
    }
    /**
     * Retain the prepared document and render it when a container is mounted.
     * @param value - prepared document and event generation.
     */
    show(value) {
        this.document = value;
        this.render();
    }
    /** Remove the owned DOM and retained presentation data. */
    dispose() {
        this.element?.remove();
        this.element = undefined;
        this.host = undefined;
        this.document = undefined;
    }
    render() {
        const current = this.document;
        const host = this.host;
        if (current === undefined || host === undefined)
            return;
        this.element?.remove();
        const element = document.createElement('iframe');
        element.className = css.frame;
        element.src = current.target.url;
        element.title = current.target.title;
        element.referrerPolicy = 'no-referrer';
        element.dataset.sidebarBrowserFrame = 'iframe';
        if (current.sandboxed)
            element.setAttribute('sandbox', WEB_BROWSER_SANDBOX);
        element.addEventListener('load', () => {
            if (this.element === element)
                this.events.loaded(current.revision);
        });
        element.addEventListener('error', () => {
            if (this.element === element)
                this.events.failed(current.revision);
        });
        this.element = element;
        this.rendered = true;
        host.append(element);
    }
}
//# sourceMappingURL=IframePresentation.js.map