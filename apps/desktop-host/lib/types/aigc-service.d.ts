/** Definition and provider for the account-owned compiled AIGC domain. */
import { Context, Service } from '@deepseek-ai/cordis';
export type AigcNativeOperation = 'question' | 'temporary' | 'budget';
export interface AigcDomain {
    start(): Promise<{
        origin: string;
    }>;
    invoke(input: unknown, signal: AbortSignal): Promise<unknown>;
    close(): Promise<void>;
}
export interface AigcDomainOptions {
    bootstrap: unknown;
    resourceDirectory: string;
    staticDirectory: string;
    signal: AbortSignal;
    native(operation: AigcNativeOperation, input: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface AigcDomainModule {
    createEmbeddedAigcDomain(options: AigcDomainOptions): Promise<AigcDomain>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        aigcDomain: AigcService;
    }
}
export declare abstract class AigcService extends Service implements AigcDomain {
    abstract start(): Promise<{
        origin: string;
    }>;
    abstract invoke(input: unknown, signal: AbortSignal): Promise<unknown>;
    abstract close(): Promise<void>;
}
export declare class CompiledAigcService extends AigcService {
    private readonly domain;
    private starting?;
    private closing?;
    constructor(ctx: Context, domain: AigcDomain);
    start(): Promise<{
        origin: string;
    }>;
    invoke(input: unknown, signal: AbortSignal): Promise<unknown>;
    close(): Promise<void>;
}
//# sourceMappingURL=aigc-service.d.ts.map