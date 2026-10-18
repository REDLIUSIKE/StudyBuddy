import type { StudyBuddyFetch } from './services.ts';
export interface ModelKeyPriceGuard {
    version: string;
    expressionSha256: string;
    pluginSha256: string;
}
/** Private HTTP transport authenticated only by the configured service Key.
 * Caller accounts, login cookies and connection grants never enter a request. */
export declare class ModelKeyClient {
    private readonly options;
    private readonly baseUrl;
    constructor(options: {
        baseUrl: string;
        readKey(): Promise<string>;
        fetch: StudyBuddyFetch;
    });
    private request;
    invoke(input: unknown, body: Record<string, unknown>, signal?: AbortSignal, guard?: ModelKeyPriceGuard): Promise<Response>;
    models(signal?: AbortSignal): Promise<Response>;
    catalog(signal?: AbortSignal): Promise<Response>;
    speechCatalog(signal?: AbortSignal): Promise<Response>;
    invokeMultipart(input: unknown, body: FormData, signal?: AbortSignal, guard?: ModelKeyPriceGuard): Promise<Response>;
    requestStatus(id: string, signal?: AbortSignal): Promise<Response>;
    mediaRequestStatus(id: string, signal?: AbortSignal): Promise<Response>;
    task(taskId: string, operation: 'status' | 'content', options?: {
        signal?: AbortSignal;
        range?: string;
    }): Promise<Response>;
}
//# sourceMappingURL=model-key-client.d.ts.map