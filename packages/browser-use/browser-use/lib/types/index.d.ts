/**
 * Exclusive named registration for the browser-use capability.
 * @module @deepseek-ai/dsh-browser-use
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { BrowserUseProviderName } from './brand.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        browserUse: BrowserUseRegistry;
    }
}
/** Owns one optional provider registration in the shared browser-use service. */
export declare class BrowserUseRegistry extends Service {
    private registration;
    constructor(ctx: Context);
    /** Name of the registered provider, including while its resources are closing. */
    get providerName(): BrowserUseProviderName | undefined;
    /**
     * Reserve the sole provider slot until the contribution is disposed.
     * A second registration fails even when it repeats the current name. Providers
     * must stop their tools and await owned work before releasing this registration.
     * @param name - provider-owned name used in registration diagnostics.
     * @returns the effect disposer for this exact registration.
     */
    register(name: BrowserUseProviderName): () => Promise<void>;
}
export default BrowserUseRegistry;
//# sourceMappingURL=index.d.ts.map