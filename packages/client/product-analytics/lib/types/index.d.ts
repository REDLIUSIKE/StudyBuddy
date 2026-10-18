/** Desktop-only analytics RPC and live compaction collection. */
import { type Context, type Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ProductEvent } from './events.ts';
/** Application-owned collection policy; no user settings surface. */
export interface Config {
    /** Live application collection policy; ordinary Web does not mount this service. */
    enabled: Volatile<boolean>;
    /** Running Desktop release, absent when unavailable. */
    appVersion?: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        productAnalytics: ProductAnalytics;
    }
}
/** Authenticated event intake; disabled instances do not inspect identity or accept new events. */
export default class ProductAnalytics extends TypertRemoteService {
    private readonly config;
    static inject: string[];
    static Config: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        appVersion: z<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        appVersion: z<string, string, "plain">;
    }>>, "plain">;
    private active;
    private readonly listeners;
    constructor(ctx: Context, config: Config);
    /**
     * Read the collection policy.
     * @returns whether this Host currently accepts Desktop analytics.
     */
    enabled(): boolean;
    /**
     * Stream the effective policy initially and after live configuration edits.
     * @param signal - subscriber lifetime.
     * @returns current policy values until cancellation or service disposal.
     */
    watchPolicy(signal: AbortSignal): AsyncIterable<boolean>;
    /**
     * Submit selected Desktop fields; missing identity is omitted and never generated.
     * @param event - typed product event without message contents or credentials.
     * @returns after local submission; no delivery or warehouse acknowledgement.
     */
    report(event: ProductEvent): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map