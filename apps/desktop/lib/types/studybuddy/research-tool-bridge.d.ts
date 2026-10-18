import type { HarnessResearchContextV1, OwnedScope } from '@studybuddy/contracts';
interface Options {
    isCurrent(scope: OwnedScope): boolean;
    binding(scope: OwnedScope, projectId: string, sessionId: string): Promise<HarnessResearchContextV1>;
    origin(scope: OwnedScope): Promise<string>;
    headers(scope: OwnedScope, url: string): Readonly<Record<string, string>>;
    fetch(url: string, init: RequestInit): Promise<Response>;
}
/** No endpoint, credential, model or authority can be selected by tool arguments. */
export declare class ResearchNativeToolBridge {
    private readonly options;
    constructor(options: Options);
    /** Execute once under the exact private Host/project context. */
    handle(value: unknown, signal: AbortSignal): Promise<unknown>;
}
export {};
//# sourceMappingURL=research-tool-bridge.d.ts.map