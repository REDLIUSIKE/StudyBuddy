import type { OwnedScope } from '@studybuddy/contracts';
import type { AigcTextConsumer, AigcPlatformConsumer } from './aigc-types.ts';
interface Options {
    isCurrent(scope: OwnedScope): boolean;
    logRoot: string | ((scope: OwnedScope) => string);
    consumer: AigcTextConsumer;
    platform?: AigcPlatformConsumer;
    media?: {
        request(scope: OwnedScope, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
        content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
    };
    fetch?: typeof fetch;
}
/** One account-owned listener, with explicit shutdown and no retry/fallback. */
export declare class AigcGateway {
    private readonly options;
    private row;
    private opening;
    constructor(options: Options);
    /** Resolve the existing keyless node selector to the same currently admitted native model route. */
    nativeModel(scope: OwnedScope, providerId: string, modelId: string): Promise<{
        provider: string;
        model: string;
        capabilityFlags: readonly string[];
    }>;
    /** Open a private listener for the current account only.
     * @param scope - Main-owned authenticated generation.
     * @returns Private bootstrap material for the local backend stdin. */
    start(scope: OwnedScope): Promise<{
        origin: string;
        authorization: string;
    }>;
    private assert;
    private catalog;
    private serve;
    private stream;
    /** Fence the listener immediately, cancel dispatches and await every owned operation. */
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=aigc-gateway.d.ts.map