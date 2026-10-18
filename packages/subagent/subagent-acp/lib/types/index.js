/**
 * Out-of-process ACP subagent backend. Each child has its own process, session, model, and
 * tools, so it shares no Cordis context and advertises no parent-enforced start capabilities;
 * the subagent service supplies the captured child working directory. This plugin uses
 * named exports only; a default would hide its
 * loader metadata (see `docs/postmortem/0001-acp-default-export-drops-inject.md`).
 * @module @deepseek-ai/dsh-subagent-acp
 */
import z from '@deepseek-ai/schemastery';
import { assertUsableCwd } from '@deepseek-ai/dsh-subagent';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { acpConfigurationFailure, DEFAULT_DISPOSE_EOF_GRACE_MS, DEFAULT_DISPOSE_GRACE_MS, startAcpRun } from "./run.js";
export const name = 'subagent-acp';
export const inject = ['subagents', 'subprocess'];
export const Config = z.object({
    providerName: z.string().default('acp'),
    command: z.string().required(),
    args: z.array(z.string()).default([]),
    permission: z.union(['allow', 'reject']).default('reject'),
    env: z.dict(z.string()).default({}),
    disposeEofGraceMs: z.number().default(DEFAULT_DISPOSE_EOF_GRACE_MS),
    disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
});
/** A process grace must fit every Node timer that observes or terminates the child. */
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
        throw new Error(`subagent-acp: ${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
    }
}
/**
 * The ACP provider. Advertises NO start-time capabilities: an out-of-process
 * child cannot honor `agentOptions`/`outputSchema`/`maxDepth`/`toolFilter`/
 * `persona` (the service rejects a request needing any before `start` runs).
 */
class AcpProvider {
    name;
    ctx;
    config;
    capabilities = {
        agentOptions: false,
        outputSchema: false,
        depthLimit: false,
        toolFilter: false,
        persona: false,
    };
    // Context contract: an out-of-process ACP child starts fresh — no parent conversation crosses the process boundary.
    inheritsParentContext = false;
    constructor(name, ctx, config) {
        this.name = name;
        this.ctx = ctx;
        this.config = config;
    }
    start(request) {
        if (request.signal.aborted) {
            throw new Error('subagent request was aborted before the ACP child started');
        }
        let cwd;
        try {
            cwd = assertUsableCwd('subagent-acp', 'child cwd', request.cwd);
        }
        catch (error) {
            const failure = acpConfigurationFailure(error);
            this.ctx.logger.warn(`subagent-acp "${this.name}": child start failed: %o`, error);
            throw failure;
        }
        const spec = {
            command: this.config.command,
            args: this.config.args,
            cwd,
            permission: this.config.permission,
            env: this.config.env,
            disposeEofGraceMs: this.config.disposeEofGraceMs,
            disposeGraceMs: this.config.disposeGraceMs,
            spawn: spec => this.ctx.subprocess.spawn(spec),
            onError: (error, stopReason) => {
                // The seam forbids `result` rejecting, so a child-level failure is
                // flattened to a stop reason — preserve it here rather than losing it.
                this.ctx.logger.warn(`subagent-acp "${this.name}": child run failed (${stopReason}): ${error.message}`);
            },
        };
        return startAcpRun(request, spec);
    }
}
export function apply(ctx, config) {
    // schemastery (Config) has already filled every defaulted field.
    const resolved = config;
    assertPositiveFinite('disposeEofGraceMs', resolved.disposeEofGraceMs);
    assertPositiveFinite('disposeGraceMs', resolved.disposeGraceMs);
    ctx.subagents.registerProvider(new AcpProvider(resolved.providerName, ctx, resolved));
}
//# sourceMappingURL=index.js.map