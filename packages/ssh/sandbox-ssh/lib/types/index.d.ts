/** Remote argv wrapper that selects and applies the sandbox on the SSH host. */
import { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import type { ConfinedArgv, SandboxPolicy } from '@deepseek-ai/dsh-sandbox';
/** Resolve each confinement request on the same host as its filesystem and subprocess providers. */
export declare class SshSandboxProvider extends SandboxProvider {
    static inject: string[];
    confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal): Promise<ConfinedArgv>;
}
export default SshSandboxProvider;
//# sourceMappingURL=index.d.ts.map