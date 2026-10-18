export const sameScope = (a, b) => a === b || a !== null && b !== null && a.accountId === b.accountId && a.generation === b.generation;
export const errorCode = (error) => error instanceof Error && /^[A-Z0-9_]{1,128}$/u.test(error.message) ? error.message : 'BUSINESS_REQUEST_FAILED';
export class ObservableState {
    snapshot;
    #listeners = new Set();
    constructor(snapshot) {
        this.snapshot = snapshot;
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
    publish(snapshot) { this.snapshot = snapshot; for (const listener of this.#listeners)
        listener(); }
    dispose() { this.#listeners.clear(); }
}
//# sourceMappingURL=observable.js.map