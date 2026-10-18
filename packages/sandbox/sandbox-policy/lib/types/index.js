/**
 * The sandbox POLICY home (`ctx.sandboxPolicy`): the single owner of the
 * deployment's sandbox fallbacks plus per-session resolution: the file-effect
 * {@link SandboxMode}, the `workspace-write` root, and the override kit (the
 * `sandbox/mode` event, its fold, and its write path; the fold is the
 * `sandboxMode` session-projection unit registered here, while the event and
 * write path come from `./session-mode.ts`).
 * Before each agent request, the owner also contributes the resolved policy to
 * the cache-safe runtime-context snapshot. The agent loop logs that snapshot as
 * model history, so replay reconstructs the same mode and root the enforcing
 * consumers resolve without rewriting the stable system prompt.
 *
 * Enforcing filesystem, one-shot bash, and terminal backends read the SAME
 * resolved policy here. The context describes that policy without inventorying
 * capabilities, while each backend retains its own enforcement dialect and each
 * tool owns its operation-specific denial and escalation guidance. The service
 * reads session state once at each operation boundary; executors and providers
 * remain session-free.
 *
 * @module @deepseek-ai/dsh-sandbox-policy
 */
import { isAbsolute } from 'node:path';
import { Service } from '@deepseek-ai/cordis';
import { z as zod } from 'zod';
import z from '@deepseek-ai/schemastery';
import { foldWorkspaceRoots, workspaceRootsStateSchema } from "./workspace-roots.js";
export { SANDBOX_MODES, setSandboxMode } from "./session-mode.js";
/** Preserve execution-world spelling; enforcing providers resolve filesystem identity on their host. */
function resolveWorkspaceRoot(path) {
    if (!isAbsolute(path))
        throw new Error('sandbox-policy: workspace root must be an absolute execution-world path');
    return path;
}
/** Render the policy without claiming which capabilities are mounted. */
function renderPolicyContext(policy) {
    switch (policy.mode) {
        case 'read-only':
            return 'Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.';
        case 'workspace-write':
            return `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(policy.workspaceRoot)}. Some platform temporary areas may also be writable.`;
        case 'danger-full-access':
            return 'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.';
        /* v8 ignore next 4 -- SandboxMode is a typed same-process closed union; this branch is only the static exhaustiveness guard. */
        default: {
            const mode = policy.mode;
            throw new Error(`unreachable sandbox mode: ${String(mode)}`);
        }
    }
}
/** The sandbox-mode projection's state schema (state equals the public shape). */
const sandboxModeStateSchema = zod.union([
    zod.literal('read-only'),
    zod.literal('workspace-write'),
    zod.literal('danger-full-access'),
]).nullable();
/**
 * The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment
 * default mode, fallback workspace root, and current request-time policy
 * section. Tool layers call {@link resolve} for each execution so a session's
 * mode log and immutable cwd travel together to every enforcing capability.
 */
export class SandboxPolicyService extends Service {
    // Inline schema call: the config catalog walks `static Config` statically.
    static Config = z.object({
        mode: z.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
        // No schema default: process.cwd() is resolved in the constructor so the
        // stored root is always absolute regardless of how it was supplied.
        workspaceRoot: z.string(),
    });
    static inject = ['sessionProjections'];
    /** The deployment default mode — the fallback beneath a session override. */
    defaultMode;
    /** The absolute `workspace-write` fallback root for calls without a session cwd. */
    workspaceRoot;
    constructor(ctx, config) {
        super(ctx, 'sandboxPolicy');
        // schemastery (static Config) already filled `mode`; the cast records that
        // runtime fact. `workspaceRoot` has NO schema default, so its fallback to
        // the process cwd is real branching, resolved absolute either way.
        this.defaultMode = config.mode;
        this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd());
        ctx.sessionProjections.register({
            key: 'sandboxMode',
            stateVersion: 1,
            stateSchema: sandboxModeStateSchema,
            init: () => null,
            apply: (state, event) => (event.type === 'sandbox/mode' ? event.data.mode : state),
        });
        ctx.sessionProjections.register({
            key: 'workspaceRoots',
            stateVersion: 1,
            stateSchema: workspaceRootsStateSchema,
            init: () => ({ roots: null, submitted: false }),
            apply: (state, event) => event.type === 'sandbox/workspace-roots'
                ? { ...state, roots: foldWorkspaceRoots(state.roots, event.data.roots) }
                : event.type === 'turn/start' || event.type === 'agent/inbox/spliced'
                    ? { ...state, submitted: true }
                    : state,
        });
        ctx.inject(['systemPrompt'], (scope) => {
            scope.systemPrompt.context({
                name: 'sandbox:policy',
                order: scope.systemPrompt.getContextOrder('SANDBOX_POLICY'),
                text: (context) => {
                    const session = context.agent?.session;
                    if (session === undefined)
                        return '';
                    const policy = this.resolve({ session });
                    const roots = this.rootsOf(session);
                    return renderPolicyContext(policy) + (roots === null ? '' :
                        '\nProject source directories (primary first): ' + JSON.stringify(roots) +
                            '. These sources do not change the selected file permission mode. ' +
                            (policy.mode === 'workspace-write' ? 'Workspace-write permits writes in every listed source and the existing temporary areas.'
                                : policy.mode === 'read-only' ? 'Read-only permits no writes in these sources.' : 'Full access remains unrestricted.'));
                },
            });
        });
    }
    /**
     * Resolve the complete policy for one capability call. An approved explicit
     * mode outranks the session's last `sandbox/mode` event, which outranks the
     * deployment default. A session cwd is its workspace-write boundary; the
     * configured root is the fallback for agentless calls and sessions without a
     * cwd.
     * @param request - optional session and approved mode override.
     * @returns the fully resolved per-call mode and absolute workspace root.
     */
    resolve(request = {}) {
        const { session } = request;
        const roots = session === undefined ? null : this.rootsOf(session);
        if (roots !== null && roots[0] !== session?.header.cwd)
            throw new Error('Project sources conflict with the immutable Session cwd');
        return {
            mode: request.mode ?? (session === undefined ? undefined : this.overrideOf(session)) ?? this.defaultMode,
            workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
            ...session === undefined ? {} : { sessionId: session.id },
            ...(roots === null ? {} : { additionalWorkspaceRoots: roots.slice(1) }),
        };
    }
    /**
     * Capture exact Host-resolved project roots before exposing a new Session.
     * @param session - the Session receiving source authority.
     * @param roots - primary cwd first, followed by selected canonical sources.
     * @throws on invalid paths, a cwd mismatch or a conflicting retry.
     */
    captureWorkspaceRoots(session, roots) {
        this.assertWorkspaceRootsCapture(session, roots);
        const current = this.rootsOf(session);
        const next = foldWorkspaceRoots(current, roots);
        if (current === null && next !== null)
            session.append('sandbox/workspace-roots', { roots: next });
    }
    /**
     * Check eligibility without changing the Session or project membership.
     * @param session - prospective source-snapshot owner.
     * @param roots - primary cwd and exact extra directories.
     * @throws if the chat has started or already captured different roots.
     */
    assertWorkspaceRootsCapture(session, roots) {
        if (roots[0] !== session.header.cwd)
            throw new Error('Project sources conflict with the immutable Session cwd');
        const current = this.rootsOf(session);
        if (current === null && this.ctx.sessionProjections.stateOf(session, 'workspaceRoots')?.submitted) {
            throw new Error('Cannot add project sources to a conversation that has already started');
        }
        foldWorkspaceRoots(current, roots);
    }
    rootsOf(session) {
        const roots = this.ctx.sessionProjections.stateOf(session, 'workspaceRoots');
        if (roots === undefined)
            throw new Error('Project source projection is unavailable');
        return roots.roots;
    }
    /**
     * Read the session override without applying the deployment default.
     * @param session - session whose log supplies the override.
     * @returns the last logged mode, or `undefined` without one.
     */
    overrideOf(session) {
        return this.ctx.sessionProjections.stateOf(session, 'sandboxMode') ?? undefined;
    }
}
export default SandboxPolicyService;
//# sourceMappingURL=index.js.map