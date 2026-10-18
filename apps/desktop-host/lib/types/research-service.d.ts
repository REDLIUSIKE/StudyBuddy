/** Research capability supplied by the compiled, account-scoped domain. */
import { Context, Service } from '@deepseek-ai/cordis';
import type { Readable, Writable } from 'node:stream';
/** Private native transport; Main remains the authority for each operation. */
export interface ResearchChannel {
    /** @returns Whether the owning native connection is still admitted. */
    current(): boolean;
    /**
     * Relay one existing native operation without retrying an unknown outcome.
     * @param projectId - Account-owned project identity.
     * @param operation - Existing closed native operation.
     * @param input - Operation payload.
     * @param signal - Cancellation of this observer.
     * @param sessionId - Existing native Session binding, when required.
     * @returns Main's correlated response.
     */
    request(projectId: string, operation: string, input: unknown, signal: AbortSignal, sessionId?: string): Promise<unknown>;
    /**
     * Observe the existing native run stream.
     * @param projectId - Account-owned project identity.
     * @param runId - Existing run identity.
     * @returns Native events while the connection is current.
     */
    events(projectId: string, runId: string): AsyncIterable<unknown>;
    /** Revoke observers and remove transport listeners; repeated calls are harmless. */
    close(): void;
}
/** Arguments passed only to the pinned compiled-domain factory. */
export interface ResearchDomainOptions {
    projectsRoot: string;
    guestAuthorization: string;
    toolAuthorization: string;
    staticDirectory: string;
    pythonExecutable: string;
    channel: ResearchChannel;
    signal: AbortSignal;
}
/** Minimal Fastify-independent description of the compiled domain exports. */
export interface ResearchDomain {
    /** Domain-owned HTTP application; consumers do not initialize another server. */
    readonly app: object;
    /** @returns The authenticated loopback origin after listening succeeds. */
    start(): Promise<{
        origin: string;
    }>;
    /** Await domain services, HTTP connections and Worker quiescence. */
    close(): Promise<void>;
}
/** Compiled module admitted by Main's resource inventory and profile seal. */
export interface ResearchDomainModule {
    /**
     * Initialize one account domain without starting a standalone application.
     * @param options - Private bootstrap, resources and owned native transport.
     * @returns The initialized domain with explicit start and close operations.
     */
    createEmbeddedResearchDomain(options: ResearchDomainOptions): Promise<ResearchDomain>;
    StdioNativeChannel: new (input: Readable, output: Writable, shutdown?: () => void) => ResearchChannel;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Account-scoped embedded research domain supplied by the compiled provider. */
        researchDomain: ResearchService;
    }
}
/** Service Definition for the research lifecycle consumed by the Host plugin. */
export declare abstract class ResearchService extends Service implements ResearchDomain {
    abstract readonly app: object;
    abstract start(): Promise<{
        origin: string;
    }>;
    abstract close(): Promise<void>;
}
/** Provider for an initialized compiled domain; owns one start and one close. */
export declare class CompiledResearchService extends ResearchService {
    private readonly domain;
    private starting?;
    private closing?;
    constructor(ctx: Context, domain: ResearchDomain);
    get app(): object;
    start(): Promise<{
        origin: string;
    }>;
    close(): Promise<void>;
}
//# sourceMappingURL=research-service.d.ts.map