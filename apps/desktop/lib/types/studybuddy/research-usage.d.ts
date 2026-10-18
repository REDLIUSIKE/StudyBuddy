import type { OwnedScope } from '@studybuddy/contracts';
import type { MainSession } from './services.ts';
interface Options {
    current(scope: OwnedScope): boolean;
    withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>;
    fetch(url: string, init: RequestInit): Promise<Response>;
}
/** Only the original Main authentication owner reads the fixed private usage endpoint. */
export declare class ResearchUsageClient {
    private readonly options;
    constructor(options: Options);
    read(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown>;
}
export {};
//# sourceMappingURL=research-usage.d.ts.map