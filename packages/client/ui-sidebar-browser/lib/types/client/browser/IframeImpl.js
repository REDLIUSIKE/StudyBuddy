/** Iframe navigation provider with bounded application-known history. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { emptyBrowserFrame } from "./BrowserFrame.js";
import { BrowserNavigation } from "./BrowserNavigation.js";
/** Owns iframe navigation; the view reports loads without reading cross-origin content. */
export class IframeImpl {
    options;
    presentation;
    sandbox = { setEnabled: (enabled) => { this.setSandbox(enabled); } };
    navigation;
    store;
    sandboxed = true;
    error;
    disposed = false;
    disposal;
    /** @param options - initial checkpoint and persistence writer. @param presentation - iframe DOM adapter. */
    constructor(options, presentation) {
        this.options = options;
        this.presentation = presentation;
        this.navigation = new BrowserNavigation(options.initial);
        this.store = createSnapshotStore({ ...emptyBrowserFrame(), sandboxEnabled: this.sandboxed });
    }
    /**
     * Record a controlled load or a later navigation to an unreadable address.
     * @param revision - document generation whose iframe emitted load.
     */
    handleLoaded(revision) {
        if (this.disposed)
            return;
        this.navigation.frameLoaded(revision);
        this.publish();
    }
    /**
     * Publish a failure only for the current document generation.
     * @param revision - document generation whose iframe reported failure.
     */
    handleLoadFailed(revision) {
        if (this.disposed || this.navigation.snapshot.request?.revision !== revision)
            return;
        this.error = { code: undefined, description: undefined };
        this.publish();
    }
    /** @returns immutable navigation state. */
    getSnapshot = () => this.store.getSnapshot();
    /** @param listener - state invalidation. @returns unsubscribe callback. */
    subscribe = (listener) => this.store.subscribe(listener);
    /** @param target - validated address; submitting the current address reloads it. */
    loadUrl(target) {
        if (this.disposed)
            return;
        const request = BrowserNavigation.current(this.navigation.snapshot)?.url === target.url
            ? this.navigation.reload() : this.navigation.navigate(target);
        this.load(request);
    }
    /** Move through application-known history while the iframe address remains known. */
    goBack() { if (!this.disposed)
        this.load(this.navigation.back()); }
    /** Move through application-known history while the iframe address remains known. */
    goForward() { if (!this.disposed)
        this.load(this.navigation.forward()); }
    /** Reload the last application-known address. */
    reload() { if (!this.disposed)
        this.load(this.navigation.reload()); }
    /** @returns after the presentation has been removed; repeated calls join disposal. */
    dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.disposed = true;
        this.presentation.dispose();
        this.disposal = Promise.resolve();
        return this.disposal;
    }
    setSandbox(enabled) {
        if (this.disposed || enabled === this.sandboxed)
            return;
        this.sandboxed = enabled;
        if (this.store.getSnapshot().target === undefined) {
            this.store.set({ ...this.store.getSnapshot(), sandboxEnabled: enabled });
            return;
        }
        this.load(this.navigation.reload());
    }
    load(request) {
        if (request === undefined)
            return;
        this.error = undefined;
        this.publish();
        this.presentation.show({ target: request.target, revision: request.revision, sandboxed: this.sandboxed });
    }
    snapshot() {
        const state = this.navigation.snapshot;
        const target = BrowserNavigation.current(state);
        return { target, address: target === undefined ? 'empty' : state.navigation.status === 'unknown' ? 'unknown' : 'requested',
            loading: state.navigation.status === 'loading' && this.error === undefined,
            canGoBack: this.navigation.canGoBack, canGoForward: this.navigation.canGoForward,
            error: this.error, sandboxEnabled: this.sandboxed };
    }
    publish() {
        this.store.set(this.snapshot());
        this.options.persist(this.navigation.snapshot);
    }
}
//# sourceMappingURL=IframeImpl.js.map