import type { OwnedScope, ToolSearchRequestV1, ToolSearchResultV1 } from '@studybuddy/contracts';
import type { StudyBuddyFetch, StudyBuddyVault } from './services.ts';
interface Dependencies {
    isCurrent(scope: OwnedScope): boolean;
    keyMaterial(scope: OwnedScope): Promise<{
        baseUrl: string;
        apiKey: string;
    }>;
    fetch: StudyBuddyFetch;
    journal(scope: OwnedScope, operationId: string): StudyBuddyVault;
}
/** Private original-Key search client. A lost POST is followed only by GET. */
export declare class StudyBuddySearchRuntime {
    private readonly deps;
    constructor(deps: Dependencies);
    execute(scope: OwnedScope, value: ToolSearchRequestV1, signal: AbortSignal): Promise<ToolSearchResultV1>;
    private project;
}
export {};
//# sourceMappingURL=search-runtime.d.ts.map