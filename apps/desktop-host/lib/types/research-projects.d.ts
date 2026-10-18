import type { Context } from '@deepseek-ai/cordis';
import type { HarnessResearchContextV1, NativeBuiltinHostContextV1 } from '@studybuddy/contracts';
import type { ResearchProjectBinding } from './research-session-execution.ts';
export interface ResearchProjectAdmission extends NativeBuiltinHostContextV1 {
    projectId: string;
    sessionId: string;
    lease: string;
    root: string;
}
/** Validate private bind requests; a public page cannot supply one. */
export declare function parseResearchProjectAdmission(value: unknown): ResearchProjectAdmission;
/** Scope revocation fences creation, reattachment and all subsequent native actions. */
export declare class NativeResearchProjects {
    private readonly ctx;
    private readonly hostGeneration;
    private scope;
    private epoch;
    private cleanup;
    private readonly bindings;
    private readonly pending;
    constructor(ctx: Context, hostGeneration: string);
    matchesScope(value: unknown): boolean;
    setScope(value: unknown): Promise<void>;
    binding: (context: HarnessResearchContextV1) => ResearchProjectBinding | undefined;
    bind(value: unknown): Promise<ResearchProjectBinding>;
    private assert;
    private create;
    close(projectId: string): Promise<void>;
    private ownedAgents;
    /** Resolve only an actually owned live native actor; cwd equality alone grants no budget membership. */
    owningBinding(sessionId: string): ResearchProjectBinding | undefined;
}
//# sourceMappingURL=research-projects.d.ts.map