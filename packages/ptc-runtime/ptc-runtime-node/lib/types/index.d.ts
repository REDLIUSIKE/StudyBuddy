import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime';
import type { PtcRunRequest, PtcRunResult, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime';
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox';
import type { LaunchConfig } from './launch.ts';
export type { LaunchConfig } from './launch.ts';
/** Deployment-varying runtime bounds and launch choices. */
export interface Config {
    /** Worker invocation in the subprocess world; omitted selects the local carrier. */
    launch?: LaunchConfig;
    /** Default elapsed deadline, including nested tool and approval waits. */
    timeoutMs?: number;
    /** Maximum numeric elapsed budget accepted by resolve. */
    maxTimeoutMs?: number;
    /** Combined serialized logs, completion and diagnostic byte cap. */
    maxOutputBytes?: number;
    /** V8 old-generation heap limit in MiB; native allocations are excluded. */
    maxOldGenerationSizeMb?: number;
    /** Maximum control frame, outstanding argument and queued control-output bytes. */
    maxMessageBytes?: number;
    /** Maximum simultaneous host binding calls accepted from a program. */
    maxPendingCalls?: number;
    /** Managed process termination and output-drain grace in milliseconds. */
    graceMs?: number;
}
/** Node provider; direct file effects use the same sandbox service as Bash. */
export declare class NodePtcRuntime extends PtcRuntime {
    static inject: string[];
    static Config: z<Config>;
    readonly language = "typescript";
    readonly isolation = "process";
    get executionInstructions(): string;
    private readonly config;
    private readonly live;
    private disposed;
    constructor(ctx: Context, config: Config);
    get sandboxMode(): SandboxMode;
    get timeout(): {
        defaultMs: number;
        maxMs: number;
    };
    /**
     * Resolve an execution under explicit or deployment policy.
     * @param request - Program, bindings, optional cwd/deadline, and resolved authority.
     * @returns Complete execution inputs with a capped numeric budget or an explicit null deadline.
     */
    resolve(request: PtcRunRequest): PtcRunSpec;
    /**
     * Run a resolved program in a fresh managed and confined Node process.
     * @param spec - Inputs returned by resolve; missing authority is caller misuse.
     * @returns Output and file-confinement facts after managed cleanup.
     */
    run(spec: PtcRunSpec): Promise<PtcRunResult>;
    private execute;
}
export default NodePtcRuntime;
//# sourceMappingURL=index.d.ts.map