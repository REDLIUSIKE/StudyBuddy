import { Context } from '@deepseek-ai/cordis';
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { SubprocessHandle, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalEnvironment, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** SSH provider paired with the SSH filesystem; the remote helper selects POSIX process ownership. */
export declare class SshSubprocessRuntime extends SubprocessRuntime {
    static inject: string[];
    private readonly live;
    private readonly terminals;
    private readonly terminalAllocations;
    private readonly lifetime;
    constructor(ctx: Context);
    resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>;
    terminalEnvironment(signal?: AbortSignal): Promise<SubprocessTerminalEnvironment>;
    spawn(spec: SubprocessSpawnSpec): SubprocessHandle;
    spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>;
    private createTerminal;
}
export default SshSubprocessRuntime;
//# sourceMappingURL=index.d.ts.map