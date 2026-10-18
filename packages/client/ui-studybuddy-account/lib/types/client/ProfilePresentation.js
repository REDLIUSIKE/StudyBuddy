import { observeEmbeddedSurface, projectEmbeddedSurface, readEmbeddedSurfaceTheme } from '@deepseek-ai/dsh-client-ui-primitives';
export class ProfilePresentation {
    controller;
    #container = null;
    #guest = null;
    #lease = null;
    #stop;
    #stopGeometry;
    #frame = null;
    #disposers = [];
    #disposed = false;
    #visible = false;
    constructor(controller) {
        this.controller = controller;
        this.#stop = controller.subscribe(() => this.syncLease());
    }
    attach = (container) => {
        this.#stopGeometry?.();
        this.#container = container;
        const off = observeEmbeddedSurface(container, () => this.queue());
        this.#stopGeometry = off;
        this.syncLease();
        this.queue();
        return () => { off(); if (this.#container === container) {
            this.#container = null;
            this.#stopGeometry = undefined;
        } this.queue(); };
    };
    syncLease() {
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
        guest.setAttribute('src', 'about:blank#studybuddy-profile-' + lease.lease);
        guest.setAttribute('aria-label', 'StudyBuddy');
        guest.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:10;';
        let navigated = false;
        const ready = () => { if (!navigated) {
            navigated = true;
            void guest.loadURL(lease.entryUrl).catch(() => this.controller.reportFailure('PROFILE_LOAD_FAILED'));
        } this.queue(); };
        const failed = (event) => { const detail = event; if (detail.isMainFrame !== false && detail.errorCode !== -3)
            this.controller.reportFailure('PROFILE_LOAD_FAILED'); };
        guest.addEventListener('dom-ready', ready);
        guest.addEventListener('did-fail-load', failed);
        this.#disposers.push(() => { guest.removeEventListener('dom-ready', ready); guest.removeEventListener('did-fail-load', failed); });
        document.body.append(guest);
    }
    theme = () => readEmbeddedSurfaceTheme();
    queue = () => { if (this.#disposed || this.#frame !== null)
        return; this.#frame = requestAnimationFrame(() => { this.#frame = null; this.place(); }); };
    place() {
        const guest = this.#guest, container = this.#container;
        if (!guest)
            return;
        const projection = projectEmbeddedSurface(container), bounds = projection.bounds, visible = projection.visible && !this.controller.getSnapshot().errorCode;
        const properties = visible && bounds ? { display: 'flex', pointerEvents: 'auto', left: bounds.x + 'px', top: bounds.y + 'px', width: bounds.width + 'px', height: bounds.height + 'px' } : { display: 'none', pointerEvents: 'none' };
        for (const [name, value] of Object.entries(properties))
            if (Reflect.get(guest.style, name) !== value)
                Reflect.set(guest.style, name, value);
        const hidden = String(!visible), tabIndex = visible ? 0 : -1;
        if (guest.getAttribute('aria-hidden') !== hidden)
            guest.setAttribute('aria-hidden', hidden);
        if (guest.tabIndex !== tabIndex)
            guest.tabIndex = tabIndex;
        if (visible && !this.#visible)
            void this.controller.setTheme(this.theme());
        this.#visible = visible;
    }
    removeGuest() { for (const dispose of this.#disposers.splice(0))
        dispose(); this.#guest?.remove(); this.#guest = null; this.#lease = null; this.#visible = false; }
    dispose() { if (this.#disposed)
        return; this.#disposed = true; this.#stop(); this.#stopGeometry?.(); if (this.#frame !== null)
        cancelAnimationFrame(this.#frame); this.removeGuest(); }
}
//# sourceMappingURL=ProfilePresentation.js.map