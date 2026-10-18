import type { WebSearchRequest, WebSearchResult, WebSearchProvider } from '@deepseek-ai/dsh-web';
import type { ToolSearchRequestV1, ToolSearchResultV1 } from '@studybuddy/contracts';
export interface StudyBuddySearchPort {
    available(): boolean;
    request(request: WebSearchRequest): ToolSearchRequestV1;
    execute(request: ToolSearchRequestV1, signal?: AbortSignal): Promise<ToolSearchResultV1>;
}
/** A product provider; credentials and payment remain in the private online service. */
export declare class StudyBuddySearchProvider implements WebSearchProvider {
    private readonly port;
    readonly id = "studybuddy-gateway";
    constructor(port: StudyBuddySearchPort);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
//# sourceMappingURL=provider.d.ts.map
