import { observeEmbeddedSurface, projectEmbeddedSurface, readEmbeddedSurfaceTheme } from "./embedded-surface-geometry.js";
/** Retain a page across panel changes; conceal its interactive layer under foreground overlays. */
export class EmbeddedPagePresentation {
    controller;
    label;
    style;
    menus;
    #container = null;
    #guest = null;
    #lease = null;
    #stop;
    #stopGeometry;
    #frame = null;
    #disposers = [];
    #disposed = false;
    #visible = false;
    #documentReady = null;
    #cancelDocument = null;
    constructor(controller, label, style, menus = 'hide') {
        this.controller = controller;
        this.label = label;
        this.style = style;
        this.menus = menus;
        this.#stop = controller.subscribe(() => { this.syncLease(); });
    }
    /**
     * Prepare the retained guest through navigation, including concurrent foreground entry.
     * @returns Resolves after navigation and owned styling; rejects on failure or scope replacement.
     */
    prepare = async () => {
        const scope = this.controller.getSnapshot().scope;
        if (!scope || this.#disposed)
            throw new Error('COMMUNITY_LOAD_CANCELLED');
        await this.controller.acquire();
        const state = this.controller.getSnapshot(), ready = this.#documentReady, lease = this.#lease;
        if (this.#disposed || scope.accountId !== state.scope?.accountId || scope.generation !== state.scope?.generation || !ready || !lease || state.errorCode) {
            throw new Error(state.errorCode ?? 'COMMUNITY_LOAD_CANCELLED');
        }
        await ready;
        if (this.#disposed || lease !== this.#lease || this.controller.getSnapshot().errorCode)
            throw new Error('COMMUNITY_LOAD_CANCELLED');
    };
    attach = (container) => {
        this.#stopGeometry?.();
        this.#container = container;
        const off = observeEmbeddedSurface(container, this.queue);
        this.#stopGeometry = off;
        this.syncLease();
        this.queue();
        void this.controller.acquire();
        return () => {
            off();
            if (this.#container === container) {
                this.#container = null;
                this.#stopGeometry = undefined;
            }
            this.queue();
        };
    };
    syncLease() {
        if (this.#disposed)
            return;
        const lease = this.controller.getSnapshot().lease;
        if (lease?.lease === this.#lease) {
            this.queue();
            return;
        }
        this.removeGuest();
        if (lease)
            this.createGuest(lease);
        this.queue();
    }
    createGuest(lease) {
        const guest = document.createElement('webview');
        this.#guest = guest;
        this.#lease = lease.lease;
        guest.setAttribute('partition', lease.partition);
        guest.setAttribute('src', 'about:blank#studybuddy-' + this.controller.target + '-' + lease.lease);
        guest.setAttribute('aria-label', this.label());
        guest.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:10;';
        let finish, reject;
        this.#documentReady = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
        // Foreground-only entry has no preparation waiter; failure still belongs to the controller.
        void this.#documentReady.catch(() => { });
        this.#cancelDocument = () => reject(new Error('COMMUNITY_LOAD_CANCELLED'));
        let navigated = false;
        const fail = () => {
            if (this.#guest === guest)
                this.controller.reportFailure('COMMUNITY_LOAD_FAILED');
            reject(new Error('COMMUNITY_LOAD_FAILED'));
        };
        const ready = () => {
            if (!navigated) {
                navigated = true;
                void guest.loadURL(lease.entryUrl).then(async () => {
                    if (this.style !== undefined && this.#guest === guest)
                        await guest.insertCSS(this.style);
                    finish();
                }).catch(fail);
            }
            this.queue();
        };
        const failed = (event) => {
            const detail = event;
            if (detail.isMainFrame !== false && detail.errorCode !== -3)
                fail();
        };
        guest.addEventListener('dom-ready', ready);
        guest.addEventListener('did-fail-load', failed);
        this.#disposers.push(() => { guest.removeEventListener('dom-ready', ready); guest.removeEventListener('did-fail-load', failed); });
        document.body.append(guest);
    }
    theme = readEmbeddedSurfaceTheme;
    queue = () => {
        if (this.#disposed || this.#frame !== null)
            return;
        this.#frame = requestAnimationFrame(() => { this.#frame = null; this.place(); });
    };
    place() {
        const guest = this.#guest;
        if (!guest)
            return;
        const projection = projectEmbeddedSurface(this.#container, this.menus), bounds = projection.bounds;
        const visible = projection.visible && !this.controller.getSnapshot().errorCode;
        const interactive = visible && projectEmbeddedSurface(this.#container).visible;
        const properties = visible && bounds
            ? { display: 'flex', pointerEvents: interactive ? 'auto' : 'none', left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }
            : { display: 'none', pointerEvents: 'none' };
        for (const [name, value] of Object.entries(properties)) {
            if (Reflect.get(guest.style, name) !== value)
                Reflect.set(guest.style, name, value);
        }
        guest.setAttribute('aria-hidden', String(!interactive));
        guest.toggleAttribute('inert', !interactive);
        guest.tabIndex = interactive ? 0 : -1;
        if (visible !== this.#visible) {
            this.#visible = visible;
            if (visible)
                void this.controller.setTheme(this.theme());
            void this.controller.setVisible(visible);
        }
    }
    removeGuest() {
        this.#cancelDocument?.();
        this.#cancelDocument = null;
        this.#documentReady = null;
        for (const dispose of this.#disposers.splice(0))
            dispose();
        this.#guest?.remove();
        this.#guest = null;
        this.#lease = null;
        this.#visible = false;
    }
    dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        this.#stop();
        this.#stopGeometry?.();
        if (this.#frame !== null)
            cancelAnimationFrame(this.#frame);
        this.removeGuest();
    }
}
//# sourceMappingURL=embedded-page-presentation.js.map