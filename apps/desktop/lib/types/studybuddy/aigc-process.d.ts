/** The Windows supervisor contains the service and every descendant in one kill-on-close Job Object. */
import { type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
/** Start the service without credentials on command arguments or inherited environment. */
export declare function launchAigcProcess(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
/** Force only the captured service tree, retaining Job Object cleanup on supervisor exit. */
export declare function terminateAigcProcess(child: ChildProcess): Promise<void>;
//# sourceMappingURL=aigc-process.d.ts.map