/**
 * Exclusive named registration for the browser-use capability.
 * @module @deepseek-ai/dsh-browser-use
 */
import { Service } from '@deepseek-ai/cordis';
/** Owns one optional provider registration in the shared browser-use service. */
export class BrowserUseRegistry extends Service {
    registration;
    constructor(ctx) {
        super(ctx, 'browserUse');
    }
    /** Name of the registered provider, including while its resources are closing. */
    get providerName() {
        return this.registration;
    }
    /**
     * Reserve the sole provider slot until the contribution is disposed.
     * A second registration fails even when it repeats the current name. Providers
     * must stop their tools and await owned work before releasing this registration.
     * @param name - provider-owned name used in registration diagnostics.
     * @returns the effect disposer for this exact registration.
     */
    register(name) {
        if (this.registration !== undefined) {
            throw new Error(`browser use provider "${this.registration}" is already registered`);
        }
        return this.ctx.effect(() => {
            this.registration = name;
            return () => {
                this.registration = undefined;
            };
        }, 'browserUse.register()');
    }
}
export default BrowserUseRegistry;
//# sourceMappingURL=index.js.map