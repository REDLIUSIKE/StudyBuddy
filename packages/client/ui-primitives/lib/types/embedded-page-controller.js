const same = (a, b) => a?.accountId === b?.accountId && a?.generation === b?.generation;
const code = (error) => error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'COMMUNITY_LOAD_FAILED';
export class EmbeddedPageController {
    target;
    host;
    #state = { scope: null, lease: null, busy: false, errorCode: null };
    #listeners = new Set();
    #epoch = 0;
    #disposed = false;
    #pending;
    #stop;
    constructor(target, host) {
        this.target = target;
        this.host = host;
        this.#stop = host?.subscribeInvalid?.((id) => {
            if (this.#state.lease?.lease !== id || this.#disposed)
                return;
            ++this.#epoch;
            this.#pending = undefined;
            this.publish({ ...this.#state, lease: null, busy: false, errorCode: this.target === 'aigc' ? 'AIGC_SERVICE_EXITED' : 'AUTH_REQUIRED' });
        });
    }
    getSnapshot = () => this.#state;
    subscribe = (listener) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
    publish(state) {
        this.#state = state;
        for (const listener of this.#listeners) {
            try {
                listener();
            }
            catch {
                console.error('StudyBuddy page observer failed');
            }
        }
    }
    /** Re-read lifecycle authority after awaits and external observer callbacks. */
    active(epoch) { return !this.#disposed && epoch === this.#epoch; }
    setScope(scope) {
        if (same(scope, this.#state.scope) || this.#disposed)
            return;
        ++this.#epoch;
        this.#pending = undefined;
        const old = this.#state.lease;
        this.publish({ scope, lease: null, busy: false, errorCode: null });
        if (old)
            void this.host?.release(old.lease).catch(() => { });
    }
    acquire = () => {
        if (this.#disposed || !this.#state.scope || this.#state.lease)
            return Promise.resolve();
        if (this.#pending)
            return this.#pending;
        const scope = this.#state.scope, epoch = this.#epoch;
        const pending = Promise.resolve().then(() => this.acquireLease(scope, epoch)).finally(() => {
            if (this.#pending === pending)
                this.#pending = undefined;
        });
        this.#pending = pending;
        this.publish({ ...this.#state, busy: true, errorCode: null });
        return pending;
    };
    async acquireLease(scope, epoch) {
        if (!this.active(epoch))
            return;
        try {
            if (!this.host)
                throw new Error('COMMUNITY_DESKTOP_REQUIRED');
            const lease = await this.host.acquire(this.target);
            if (!this.active(epoch) || !same(scope, lease.scope)) {
                await this.host.release(lease.lease);
                return;
            }
            this.publish({ ...this.#state, lease });
        }
        catch (error) {
            if (this.active(epoch))
                this.publish({ ...this.#state, errorCode: code(error) });
        }
        finally {
            if (this.active(epoch))
                this.publish({ ...this.#state, busy: false });
        }
    }
    setTheme = async (theme) => {
        const id = this.#state.lease?.lease, epoch = this.#epoch;
        if (!id || !this.host)
            return;
        try {
            await this.host.setTheme(id, theme);
        }
        catch (error) {
            if (this.active(epoch))
                this.reportFailure(code(error));
        }
    };
    setVisible = async (visible) => {
        const id = this.#state.lease?.lease, epoch = this.#epoch;
        if (!id || !this.host)
            return;
        try {
            await this.host.setVisible?.(id, visible);
        }
        catch (error) {
            if (this.active(epoch))
                this.reportFailure(code(error));
        }
    };
    reportFailure = (errorCode) => { if (!this.#disposed)
        this.publish({ ...this.#state, errorCode, busy: false }); };
    retry = async () => {
        if (this.#disposed)
            return;
        const old = this.#state.lease, epoch = ++this.#epoch;
        this.#pending = undefined;
        this.publish({ ...this.#state, lease: null, busy: false, errorCode: null });
        if (old)
            await this.host?.release(old.lease).catch(() => { });
        if (epoch === this.#epoch)
            await this.acquire();
    };
    dispose() {
        if (this.#disposed)
            return;
        this.setScope(null);
        this.#disposed = true;
        ++this.#epoch;
        this.#stop?.();
        this.#listeners.clear();
    }
}
//# sourceMappingURL=embedded-page-controller.js.map