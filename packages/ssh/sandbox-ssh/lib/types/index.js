/** Remote argv wrapper that selects and applies the sandbox on the SSH host. */
import { SandboxProvider, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox';
import { z } from 'zod';
const factsSchema = z.object({ argv: z.array(z.string()).min(1), enforcement: z.enum(['full', 'partial']), denialSignatures: z.array(z.string()), runnerFailureRules: z.array(z.object({ allowedExitCodes: z.array(z.number().int()).optional(), fatalSignatures: z.array(z.string()), informationalLines: z.array(z.string()).optional() }).strict()) }).strict();
/** Resolve each confinement request on the same host as its filesystem and subprocess providers. */
export class SshSandboxProvider extends SandboxProvider {
    static inject = ['ssh'];
    async confine(argv, policy, signal) {
        signal?.throwIfAborted();
        try {
            const confined = await this.ctx.ssh.request('sandbox', { argv, policy }, factsSchema, signal);
            signal?.throwIfAborted();
            return {
                ...confined,
                runnerFailureRules: confined.runnerFailureRules.map(rule => ({
                    fatalSignatures: rule.fatalSignatures,
                    ...(rule.allowedExitCodes === undefined ? {} : { allowedExitCodes: rule.allowedExitCodes }),
                    ...(rule.informationalLines === undefined ? {} : { informationalLines: rule.informationalLines }),
                })),
            };
        }
        catch (error) {
            signal?.throwIfAborted();
            throw new SandboxUnavailableError(policy.mode, error instanceof Error ? error.message : String(error));
        }
    }
}
export default SshSandboxProvider;
//# sourceMappingURL=index.js.map