/** Carrier-independent tab commands and renderer-facing state. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { currentBrowserTarget } from "./BrowserPersistence.js";
import { parseBrowserAddress } from "./url.js";
/** Owns input validation and page lifetime without inspecting the carrier type. */
export class BrowserController {
    options;
    page;
    store;
    unsubscribe;
    actions;
    checkpoint;
    started = false;
    disposed = false;
    disposal;
    abort = () => { void this.dispose(); };
    /** @param options - identity, persistence, page factory and source-tab navigation. */
    constructor(options) {
        this.options = options;
        this.actions = options.actions;
        this.checkpoint = options.initial;
        this.page = options.createPage({
            initial: options.initial,
            persist: (state) => {
                if (this.disposed)
                    return;
                this.checkpoint = state;
                this.actions.replace(options.tabId, state);
            },
            openRequested: (value) => {
                if (this.disposed)
                    return;
                const result = parseBrowserAddress(value, options.applicationOrigin);
                if (!result.ok) {
                    this.addressFailed(result.reason);
                    return;
                }
                options.openTab(result.target.url);
            },
        });
        this.store = createSnapshotStore({ frame: this.page.frame.getSnapshot(),
            restoreTarget: currentBrowserTarget(this.checkpoint), addressFailure: undefined, addressRevision: 0 });
        this.unsubscribe = this.page.frame.subscribe(() => {
            if (this.disposed)
                return;
            const current = this.store.getSnapshot();
            const frame = this.page.frame.getSnapshot();
            const changed = frame.target?.url !== current.frame.target?.url;
            this.store.set({ frame, restoreTarget: frame.target === undefined ? currentBrowserTarget(this.checkpoint) : undefined,
                addressFailure: changed ? undefined : current.addressFailure,
                addressRevision: current.addressRevision + Number(changed) });
        });
        options.signal.addEventListener('abort', this.abort, { once: true });
    }
    /** @returns immutable state for the common toolbar. */
    getSnapshot = () => this.store.getSnapshot();
    /** @param listener - state invalidation. @returns unsubscribe callback. */
    subscribe = (listener) => this.store.subscribe(listener);
    /**
     * Attach the page without transferring ownership of its tab occurrence.
     * @param viewportId - mounted content container.
     * @returns physical attachment cleanup only.
     */
    mount(viewportId) {
        this.publishSaved();
        return this.page.presentation.mount(viewportId);
    }
    /**
     * Consume initial navigation once; a saved checkpoint alone never starts a page.
     * @param initialUrl - explicit typed-open address, or absence.
     */
    start(initialUrl) {
        if (this.started || this.disposed)
            return;
        this.started = true;
        if (initialUrl !== undefined)
            this.loadUrl(initialUrl);
    }
    /** Load the saved address only after an explicit restore action. */
    restore() {
        const target = this.store.getSnapshot().restoreTarget;
        if (target !== undefined)
            this.loadUrl(target.url);
    }
    /**
     * Validate an address before navigation, publishing invalid input for correction.
     * @param value - address-bar or typed-open input.
     */
    loadUrl(value) {
        if (this.disposed)
            return;
        const parsed = parseBrowserAddress(value, this.options.applicationOrigin);
        if (!parsed.ok) {
            this.addressFailed(parsed.reason);
            return;
        }
        this.command(() => { this.page.frame.loadUrl(parsed.target); });
    }
    /** Delegate Back to the page's navigation provider. */
    goBack() { this.command(() => { this.page.frame.goBack(); }); }
    /** Delegate Forward to the page's navigation provider. */
    goForward() { this.command(() => { this.page.frame.goForward(); }); }
    /** Restore a saved address, or reload the already requested page. */
    reload() {
        if (this.store.getSnapshot().restoreTarget !== undefined)
            this.restore();
        else
            this.command(() => { this.page.frame.reload(); });
    }
    /**
     * Apply the optional embedding-sandbox control; unsupported providers remain unchanged.
     * @param enabled - whether to enforce the provider's embedding sandbox.
     */
    setSandbox(enabled) {
        const sandbox = this.page.frame.sandbox;
        if (sandbox !== undefined)
            this.command(() => { sandbox.setEnabled(enabled); });
    }
    /**
     * Redirect future checkpoint writes to a replacement Session binding.
     * @param actions - replacement persistence writer.
     */
    rebind(actions) { this.actions = actions; }
    /**
     * Release the page and detach occurrence and state listeners.
     * @returns after page teardown; repeated callers join the same disposal.
     */
    dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.disposed = true;
        this.options.signal.removeEventListener('abort', this.abort);
        this.unsubscribe();
        this.disposal = this.page.frame.dispose();
        return this.disposal;
    }
    publishSaved() {
        if (this.checkpoint !== undefined)
            this.actions.replace(this.options.tabId, this.checkpoint);
    }
    addressFailed(reason) {
        this.store.set({ ...this.store.getSnapshot(), addressFailure: reason });
    }
    command(run) {
        if (this.disposed)
            return;
        const current = this.store.getSnapshot();
        this.store.set({ ...current, addressFailure: undefined, addressRevision: current.addressRevision + 1 });
        run();
    }
}
/**
 * Own tab-occurrence controllers behind Session-scoped callbacks.
 * @param actions - persisted view-state writer.
 * @param createPage - composition-selected provider.
 * @param isTabOpen - authoritative layout membership, independent of mounted bodies and plugin lifetime.
 * @returns tab callbacks.
 */
export function createBrowserControllers(actions, createPage, isTabOpen) {
    let currentActions = actions;
    const controllers = new Map();
    const controller = (id) => controllers.get(id)?.controller;
    return {
        keyedHooks: { browserState: key => controller(key) },
        mount(request) {
            const { tabId, signal } = request;
            if (signal.aborted)
                return () => { };
            let held = controllers.get(tabId);
            if (held?.signal !== signal) {
                if (held !== undefined) {
                    held.signal.removeEventListener('abort', held.forget);
                    void held.controller.dispose();
                }
                const created = new BrowserController({ ...request, actions: currentActions, createPage });
                const forget = () => {
                    controllers.delete(tabId);
                    // Plugin unload also aborts occurrences; only layout removal deletes saved navigation.
                    if (!isTabOpen(tabId))
                        currentActions.forget(tabId);
                };
                held = { signal, controller: created, forget };
                controllers.set(tabId, held);
                signal.addEventListener('abort', forget, { once: true });
            }
            const hide = held.controller.mount(request.viewportId);
            held.controller.start(request.initialUrl);
            return hide;
        },
        dispose: async () => {
            const pending = [...controllers.values()].map(({ signal, controller, forget }) => {
                signal.removeEventListener('abort', forget);
                return controller.dispose();
            });
            controllers.clear();
            await Promise.all(pending);
        },
        rebind: (actions) => {
            currentActions = actions;
            for (const { controller } of controllers.values())
                controller.rebind(actions);
        },
        loadUrl: (id, value) => { controller(id)?.loadUrl(value); },
        restore: (id) => { controller(id)?.restore(); },
        goBack: (id) => { controller(id)?.goBack(); },
        goForward: (id) => { controller(id)?.goForward(); },
        reload: (id) => { controller(id)?.reload(); },
        setSandbox: (id, enabled) => { controller(id)?.setSandbox(enabled); },
    };
}
//# sourceMappingURL=BrowserController.js.map