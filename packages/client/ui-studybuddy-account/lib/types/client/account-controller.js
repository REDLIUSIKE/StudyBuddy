import { ObservableState, sameScope, errorCode } from "./observable.js";
export function moneyText(value) { return value == null ? '—' : '¥' + value; }
export class StudyBuddyAccountController extends ObservableState {
    api;
    #revision = 0;
    #pending = null;
    constructor(api) {
        super({ scope: null, summary: null, status: 'idle', stale: false, errorCode: null });
        this.api = api;
    }
    setScope(scope) {
        if (sameScope(scope, this.snapshot.scope))
            return;
        ++this.#revision;
        this.#pending = null;
        this.publish({ scope, summary: null, status: 'idle', stale: false, errorCode: null });
    }
    /** Join the current scope's authoritative read; automatic refreshes cannot supersede it. */
    refreshSummary = () => {
        if (this.snapshot.scope === null)
            return Promise.resolve();
        if (this.#pending)
            return this.#pending;
        const revision = ++this.#revision;
        this.publish({ ...this.snapshot, status: 'loading', errorCode: null });
        const pending = this.readSummary(revision);
        this.#pending = pending;
        void pending.finally(() => { if (this.#pending === pending)
            this.#pending = null; });
        return pending;
    };
    async readSummary(revision) {
        try {
            const summary = await this.api.getAiAccountSummary();
            if (revision === this.#revision)
                this.publish({ ...this.snapshot, summary, status: 'ready', stale: false });
        }
        catch (error) {
            if (revision === this.#revision)
                this.publish({ ...this.snapshot, status: 'error', stale: this.snapshot.summary !== null, errorCode: errorCode(error) });
        }
    }
    dispose() { this.setScope(null); super.dispose(); }
}
//# sourceMappingURL=account-controller.js.map