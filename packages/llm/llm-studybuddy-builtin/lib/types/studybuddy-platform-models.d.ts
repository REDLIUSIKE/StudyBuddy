import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai';
import type { OwnedScope } from '@studybuddy/contracts';
import type { PlatformRequest, PlatformPrepared } from './studybuddy-platform-contracts.ts';
interface Dependencies {
    trustedSession(options: GenerateOptions): string | undefined;
    admit(request: PlatformRequest): Promise<PlatformPrepared>;
    fetch?: typeof fetch;
    resolveAttachments?: PiAiAdapterOptions['resolveAttachments'];
    resolveImageAccess?: PiAiAdapterOptions['resolveImageAccess'];
}
/** One platform directory mounted with the private Desktop Host lifetime. */
export declare class PlatformModelDirectory extends LlmAdapter {
    private readonly ctx;
    private readonly options;
    private snapshot;
    private registration;
    private epoch;
    constructor(ctx: Context, options: Dependencies);
    /** Apply only Main-owned keyless authorities for this exact Host. */
    apply(input: unknown, hostGeneration: string): void;
    /** Withdraw the exact old account before logout or account replacement. */
    revoke(scope: OwnedScope): void;
    catalogVisible(provider: string): boolean;
    selectionAllowed(provider: string, model: string): boolean;
    /** Expose current exact vision routes to image tools without returning credentials or granting dispatch.
     * @returns Available platform routes whose reviewed catalog declares native image input. */
    imageToolModels(): readonly {
        provider: string;
        model: string;
    }[];
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    listModels(provider: string): Promise<readonly LlmResolvedModelInfo[]>;
    private info;
    private inputModalities;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private exact;
    private current;
    private dispatch;
}
export {};
//# sourceMappingURL=studybuddy-platform-models.d.ts.map