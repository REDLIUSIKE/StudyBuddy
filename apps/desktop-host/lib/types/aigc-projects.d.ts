import type { Context } from '@deepseek-ai/cordis';
import type { HarnessAigcContextV1 } from '@studybuddy/contracts';
export interface AigcProjectBinding extends HarnessAigcContextV1 {
    readonly authorizedRoot: string;
}
export interface AigcProjectPorts {
    workspace(root: string): Promise<string>;
    sessionDirectory(sessionId: string): string | undefined;
    createSession(sessionId: string, workspaceId: string): Promise<void>;
    stopSessions(rootIds: ReadonlySet<string>): Promise<void>;
    owns(rootId: string, candidateId: string): boolean;
}
export declare class NativeAigcProjects {
    private readonly ports;
    private readonly hostGeneration;
    private scope;
    private epoch;
    private cleanup;
    private readonly bindings;
    private readonly pending;
    private readonly workspaces;
    constructor(ports: AigcProjectPorts, hostGeneration: string);
    matchesScope(value: unknown): boolean;
    setScope(value: unknown): Promise<void>;
    binding: (context: HarnessAigcContextV1) => AigcProjectBinding | undefined;
    owningBinding(sessionId: string): AigcProjectBinding | undefined;
    project(projectId: string): AigcProjectBinding | undefined;
    private assert;
    bind(value: unknown): Promise<AigcProjectBinding>;
    private create;
    close(projectId: string): Promise<void>;
}
/** Adapt existing native services; no model request or separate Session manager is created here. */
export declare function createNativeAigcProjects(ctx: Context, hostGeneration: string): NativeAigcProjects;
//# sourceMappingURL=aigc-projects.d.ts.map