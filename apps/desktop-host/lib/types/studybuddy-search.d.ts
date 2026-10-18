import type { Context } from '@deepseek-ai/cordis';
import type { WebSearchRequest } from '@deepseek-ai/dsh-web';
import type { ToolSearchRequestV1, ToolSearchResultV1 } from '@studybuddy/contracts';
import type { StudyBuddySearchPort } from '@deepseek-ai/dsh-web-search-studybuddy';
/** Durable identity follows the original tool call and query slot, never the text. */
export declare function searchOperationUUID(account: string, session: string, call: string, index: number): string;
/** Main-owned scope and a private IPC port. It never contains a usable Key. */
export declare class StudyBuddySearchHostControl implements StudyBuddySearchPort {
    private readonly hostGeneration;
    private readonly send;
    private context;
    private readonly calls;
    private readonly pending;
    constructor(ctx: Context, hostGeneration: string, send: (message: object) => Promise<void>);
    available(): boolean;
    setScope(value: unknown): void;
    request(value: WebSearchRequest): ToolSearchRequestV1;
    execute(request: ToolSearchRequestV1, signal?: AbortSignal): Promise<ToolSearchResultV1>;
    result(message: unknown): void;
}
//# sourceMappingURL=studybuddy-search.d.ts.map