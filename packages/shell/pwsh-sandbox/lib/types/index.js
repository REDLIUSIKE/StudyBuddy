/**
 * Sandbox-consuming PowerShell executor — the pwsh twin of
 * `@deepseek-ai/dsh-bash-sandbox`. It wraps the exact local pwsh argv through
 * `ctx.sandbox` (which on Windows resolves to the ACL restricted-token runner
 * chain), inherits local process mechanics, and reports the selected mode,
 * enforcement, and denial facts. Positive runner-executable evidence
 * identifies a broken confinement runner: foreground calls throw
 * `SANDBOX_UNAVAILABLE`, while background processes carry `runnerFailed`;
 * other provider rejections retain stage-neutral local-executor semantics. The
 * tool layer owns the escalation approval flow through `ctx.approval`; this
 * executor reports the sandbox facts the tool renders.
 * @module @deepseek-ai/dsh-pwsh-sandbox
 */
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox';
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local';
import { classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from "./helpers.js";
/**
 * Registers as `ctx.shell` in place of the local pwsh executor and requires a
 * `ctx.sandbox` provider plus `ctx.sandboxPolicy`; the tool layer carries the
 * sandbox denial rendering and escalation surface (see the
 * pwsh-tool-and-executor Agent Note). Tool calls pass the calling session's
 * resolved policy; direct calls fall back to deployment policy.
 * `result.sandbox` reports the mode, enforcement, and denial facts the tool
 * renders.
 */
/* jscpd:ignore-start -- deliberate call-for-call mirror of bash-sandbox's executor (pwsh-tool-and-executor Agent Note) */
export class SandboxPwshExecutor extends PwshLocalExecutor {
    static inject = ['subprocess', 'sandbox', 'sandboxPolicy'];
    // No own Config: the sandbox default (mode + workspaceRoot) moved to
    // ctx.sandboxPolicy, so this executor inherits PwshLocalExecutor's Config
    // verbatim (the config catalog walks the inherited static).
    mode;
    /**
     * Per-process confinement facts retained until settlement. Providers may
     * vary enforcement and diagnostic dialect between overlapping calls, so a
     * shared latest-wrap value would classify a process against the wrong facts.
     * Unconfined processes have no entry.
     */
    processFacts = new Map();
    constructor(ctx, config) {
        super(ctx, config);
        // The default mode is the capability fact used for schema advertisement;
        // actual tool executions carry their resolved per-call policy.
        this.mode = ctx.sandboxPolicy.defaultMode;
    }
    /** The configured default mode — the capability fact the tool layer reads. */
    get sandboxMode() {
        return this.mode;
    }
    /**
     * Stamp a complete per-call policy onto the spec. Tool calls supply the
     * calling session's resolved mode and root; lower-level callers fall back to
     * the deployment policy.
     */
    resolve(request) {
        return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() };
    }
    async execute(spec) {
        const policy = spec.sandboxPolicy;
        const { mode } = policy;
        if (mode === 'danger-full-access') {
            return SandboxPwshExecutor.decorateResult(await super.execute(spec), result => ({ ...result, sandbox: { mode, denied: false } }));
        }
        let confined;
        const ex = await this.executeArgv(spec, async (signal) => {
            const prepared = await this.confine(spec, { ...policy, mode }, signal);
            signal.throwIfAborted();
            confined = prepared;
            return prepared.argv;
        }, (process) => {
            const facts = confined;
            this.processFacts.set(process, {
                mode,
                enforcement: facts.enforcement,
                denialSignatures: facts.denialSignatures,
                runnerFailureRules: facts.runnerFailureRules,
                runnerProgram: facts.argv[0],
                workdir: spec.workdir,
            });
        });
        return SandboxPwshExecutor.decorateResult(ex, (result) => {
            if (confined === undefined)
                return { ...result, sandbox: { mode, denied: false } };
            const { enforcement, denialSignatures, runnerFailureRules } = confined;
            // Runner failure outranks denial because the command did not run. Carry
            // the matched fatal line, not an informational line that preceded it.
            const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, runnerFailureRules);
            if (runnerFailure !== undefined) {
                throw new SandboxUnavailableError(mode, runnerFailure.detail);
            }
            return { ...result, sandbox: { mode, denied: classifyDenial(result, denialSignatures), enforcement } };
        }, (error) => {
            // An upstream abort remains cancellation even when it prevents spawn.
            if (spec.signal?.aborted === true)
                spec.signal.throwIfAborted();
            if (confined !== undefined && isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
                throw new SandboxUnavailableError(mode, String(error));
            }
            throw error;
        });
    }
    /**
     * Decorate the handle's foreground projection in place, memoized once. The
     * handle keeps its identity (never wrapped in a second object) because the
     * per-process facts and `onProcessDone` key on the exact instance.
     */
    static decorateResult(ex, map, mapError) {
        const base = ex.result.bind(ex);
        let decorated;
        ex.result = () => {
            decorated ??= base().then(map, mapError);
            return decorated;
        };
        return ex;
    }
    /**
     * Stamp per-process sandbox facts before `done` settles. Full-access
     * processes have no facts; signal deaths are not denials.
     */
    onProcessDone(proc, stderr, providerRejected, providerError) {
        const facts = this.processFacts.get(proc);
        if (facts !== undefined) {
            this.processFacts.delete(proc);
            // A provider rejection exposes no public failure stage. Attribute it to
            // the confinement runner only when the error independently names argv[0].
            // Otherwise settled runner failure outranks denial-like diagnostics.
            const runnerFailed = providerRejected
                ? isRunnerSpawnFailure(providerError, facts.runnerProgram, facts.workdir)
                : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined;
            proc.sandbox = {
                mode: facts.mode,
                denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
                enforcement: facts.enforcement,
                ...(runnerFailed ? { runnerFailed } : {}),
            };
        }
        super.onProcessDone(proc, stderr, providerRejected, providerError);
    }
    /**
     * Wrap one pwsh invocation via the `ctx.sandbox` provider. Provider errors
     * propagate unchanged; the returned argv is handed directly to the local
     * executor's subprocess path.
     * @param spec - resolved execution spec whose pwsh argv is confined.
     * @param policy - resolved confined execution policy.
     * @param signal - cancellation of confinement preparation.
     * @returns the provider's exact argv and settlement-classification facts.
     */
    confine(spec, policy, signal) {
        return this.ctx.sandbox.confine(this.argv(spec), policy, signal);
    }
}
/* jscpd:ignore-end */
export default SandboxPwshExecutor;
//# sourceMappingURL=index.js.map