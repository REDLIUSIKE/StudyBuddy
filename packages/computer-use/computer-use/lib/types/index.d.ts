/**
 * Exclusive named registration for the computer-use capability.
 * @module @deepseek-ai/dsh-computer-use
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { ComputerUseProviderName } from './brand.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        computerUse: ComputerUseRegistry;
    }
}
/** Owns one optional provider registration in the shared computer-use service. */
export declare class ComputerUseRegistry extends Service {
    private registration;
    constructor(ctx: Context);
    /** Name of the registered provider, including while its resources are closing. */
    get providerName(): ComputerUseProviderName | undefined;
    /**
     * Reserve the sole provider slot until the contribution is disposed.
     * A second registration fails even when it repeats the current name. Providers
     * must stop their tools and await owned work before releasing this registration.
     * @param name - provider-owned name used in registration diagnostics.
     * @returns the effect disposer for this exact registration.
     */
    register(name: ComputerUseProviderName): () => Promise<void>;
}
export default ComputerUseRegistry;
//# sourceMappingURL=index.d.ts.map