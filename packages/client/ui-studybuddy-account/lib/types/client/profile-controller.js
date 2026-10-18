import { ObservableState, sameScope, errorCode } from "./observable.js";
export class ProfileController extends ObservableState {
    api;
    target;
    #epoch = 0;
    #acquiring = false;
    #stopInvalid;
    constructor(api, target = 'personal_profile') {
        super({ scope: null, lease: null, busy: false, errorCode: null });
        this.api = api;
        this.target = target;
        this.#stopInvalid = api?.subscribeInvalid?.(lease => { if (this.snapshot.lease?.lease === lease)
            this.publish({ ...this.snapshot, lease: null, busy: false, errorCode: 'AUTH_REQUIRED' }); });
    }
    setScope(scope) {
        if (sameScope(scope, this.snapshot.scope))
            return;
        ++this.#epoch;
        this.#acquiring = false;
        const old = this.snapshot.lease;
        this.publish({ scope, lease: null, busy: false, errorCode: null });
        if (old)
            void this.api?.release(old.lease).catch(() => { });
    }
    acquire = async () => {
        if (!this.snapshot.scope || this.snapshot.lease || this.#acquiring)
            return;
        const epoch = this.#epoch, scope = this.snapshot.scope;
        this.#acquiring = true;
        this.publish({ ...this.snapshot, busy: true, errorCode: null });
        try {
            if (!this.api)
                throw new Error('PROFILE_EMBED_UNAVAILABLE');
            const lease = await this.api.acquire(this.target);
            if (epoch !== this.#epoch || !sameScope(lease.scope, scope)) {
                await this.api.release(lease.lease);
                return;
            }
            this.publish({ ...this.snapshot, lease });
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, errorCode: errorCode(error) });
        }
        finally {
            if (epoch === this.#epoch) {
                this.#acquiring = false;
                this.publish({ ...this.snapshot, busy: false });
            }
        }
    };
    setTheme = async (theme) => {
        const lease = this.snapshot.lease, epoch = this.#epoch;
        if (!lease || !this.api)
            return;
        try {
            await this.api.setTheme(lease.lease, theme);
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, errorCode: errorCode(error) });
        }
    };
    reportFailure = (code) => { this.publish({ ...this.snapshot, errorCode: code, busy: false }); };
    retry = async () => {
        const old = this.snapshot.lease, epoch = this.#epoch;
        this.publish({ ...this.snapshot, lease: null, errorCode: null });
        if (old)
            await this.api?.release(old.lease).catch(() => { });
        if (epoch === this.#epoch)
            await this.acquire();
    };
    dispose() { this.#stopInvalid?.(); this.setScope(null); super.dispose(); }
}
//# sourceMappingURL=profile-controller.js.map