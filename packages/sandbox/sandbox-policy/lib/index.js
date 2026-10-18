import { isAbsolute } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import { z } from "zod";
import z$1 from "@deepseek-ai/schemastery";
//#region lib/types/workspace-roots.js
/** Immutable per-Session project sources shared by all file-effect consumers. */
/** Source snapshots reject relative paths and duplicate authorities when restored. */
const workspaceRootsSchema = z.array(z.string().refine(isAbsolute)).min(1).refine((roots) => new Set(roots).size === roots.length).nullable();
/** Folded frozen project source list, or null for a legacy/ordinary Session. */
const workspaceRootsStateSchema = z.object({
	roots: workspaceRootsSchema,
	submitted: z.boolean()
});
/**
* Fold an immutable source snapshot, retaining the original on identical retries.
* @param state - committed snapshot or null.
* @param roots - the new event's source list.
* @returns validated frozen sources; conflicting records reject.
*/
function foldWorkspaceRoots(state, roots) {
	const next = workspaceRootsSchema.parse(roots);
	if (state !== null && JSON.stringify(state) !== JSON.stringify(next)) throw new Error("Project source roots are immutable");
	return state ?? next;
}
//#endregion
//#region lib/types/session-mode.js
/**
* Per-session sandbox-mode override: the session log as the store. A runtime
* switch (a UI policy control or test scenario) is recorded as one
* `sandbox/mode` event on the session it applies to;
* `effective = projection state ?? the deployment default`, so an override
* survives restart by replay, two sessions can never see each other's state,
* and there is no external config store. The event is log-only (the
* `approval/*` precedent): the policy owner projects the fold into each model
* request, while enforcing tools report operation-specific boundary markers.
* EXECUTION honors the same fold through `ctx.sandboxPolicy.resolve()` — it
* stamps the mode together with the calling session's workspace root onto each
* capability call, weakest-precedence beneath an escalation grant.
*
* The override is policy state shared by every enforcing family (bash and
* filesystem alike), so it lives here in the policy package rather than in any
* one capability's seam.
*
* @module dsh-sandbox-policy/session-mode
*/
/** Every {@link SandboxMode}, for option advertisement and runtime validation of untrusted mode strings. */
const SANDBOX_MODES = [
	"read-only",
	"workspace-write",
	"danger-full-access"
];
/**
* THE write path for a session's sandbox-mode override: appends exactly one
* `sandbox/mode` event — the switch IS its event; nothing mutates mode state
* out of band. Takes effect on the session's next confined call (bash or fs)
* — consumers read the shared projection state.
* @param session - the session the override belongs to.
* @param mode - the mode every subsequent confined call in this session runs
*   under (until the next switch).
*/
function setSandboxMode(session, mode) {
	session.append("sandbox/mode", { mode });
}
//#endregion
//#region lib/types/index.js
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
/** Preserve execution-world spelling; enforcing providers resolve filesystem identity on their host. */
function resolveWorkspaceRoot(path) {
	if (!isAbsolute(path)) throw new Error("sandbox-policy: workspace root must be an absolute execution-world path");
	return path;
}
/** Render the policy without claiming which capabilities are mounted. */
function renderPolicyContext(policy) {
	switch (policy.mode) {
		case "read-only": return "Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.";
		case "workspace-write": return `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(policy.workspaceRoot)}. Some platform temporary areas may also be writable.`;
		case "danger-full-access": return "Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.";
		/* v8 ignore next 4 -- SandboxMode is a typed same-process closed union; this branch is only the static exhaustiveness guard. */
		default: {
			const mode = policy.mode;
			throw new Error(`unreachable sandbox mode: ${String(mode)}`);
		}
	}
}
/** The sandbox-mode projection's state schema (state equals the public shape). */
const sandboxModeStateSchema = z.union([
	z.literal("read-only"),
	z.literal("workspace-write"),
	z.literal("danger-full-access")
]).nullable();
/**
* The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment
* default mode, fallback workspace root, and current request-time policy
* section. Tool layers call {@link resolve} for each execution so a session's
* mode log and immutable cwd travel together to every enforcing capability.
*/
var SandboxPolicyService = class extends Service {
	static Config = z$1.object({
		mode: z$1.union([
			"read-only",
			"workspace-write",
			"danger-full-access"
		]).default("read-only"),
		workspaceRoot: z$1.string()
	});
	static inject = ["sessionProjections"];
	/** The deployment default mode — the fallback beneath a session override. */
	defaultMode;
	/** The absolute `workspace-write` fallback root for calls without a session cwd. */
	workspaceRoot;
	constructor(ctx, config) {
		super(ctx, "sandboxPolicy");
		this.defaultMode = config.mode;
		this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd());
		ctx.sessionProjections.register({
			key: "sandboxMode",
			stateVersion: 1,
			stateSchema: sandboxModeStateSchema,
			init: () => null,
			apply: (state, event) => event.type === "sandbox/mode" ? event.data.mode : state
		});
		ctx.sessionProjections.register({
			key: "workspaceRoots",
			stateVersion: 1,
			stateSchema: workspaceRootsStateSchema,
			init: () => ({
				roots: null,
				submitted: false
			}),
			apply: (state, event) => event.type === "sandbox/workspace-roots" ? {
				...state,
				roots: foldWorkspaceRoots(state.roots, event.data.roots)
			} : event.type === "turn/start" || event.type === "agent/inbox/spliced" ? {
				...state,
				submitted: true
			} : state
		});
		ctx.inject(["systemPrompt"], (scope) => {
			scope.systemPrompt.context({
				name: "sandbox:policy",
				order: scope.systemPrompt.getContextOrder("SANDBOX_POLICY"),
				text: (context) => {
					const session = context.agent?.session;
					if (session === void 0) return "";
					const policy = this.resolve({ session });
					const roots = this.rootsOf(session);
					return renderPolicyContext(policy) + (roots === null ? "" : "\nProject source directories (primary first): " + JSON.stringify(roots) + ". These sources do not change the selected file permission mode. " + (policy.mode === "workspace-write" ? "Workspace-write permits writes in every listed source and the existing temporary areas." : policy.mode === "read-only" ? "Read-only permits no writes in these sources." : "Full access remains unrestricted."));
				}
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
		const roots = session === void 0 ? null : this.rootsOf(session);
		if (roots !== null && roots[0] !== session?.header.cwd) throw new Error("Project sources conflict with the immutable Session cwd");
		return {
			mode: request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode,
			workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
			...session === void 0 ? {} : { sessionId: session.id },
			...roots === null ? {} : { additionalWorkspaceRoots: roots.slice(1) }
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
		if (current === null && next !== null) session.append("sandbox/workspace-roots", { roots: next });
	}
	/**
	* Check eligibility without changing the Session or project membership.
	* @param session - prospective source-snapshot owner.
	* @param roots - primary cwd and exact extra directories.
	* @throws if the chat has started or already captured different roots.
	*/
	assertWorkspaceRootsCapture(session, roots) {
		if (roots[0] !== session.header.cwd) throw new Error("Project sources conflict with the immutable Session cwd");
		const current = this.rootsOf(session);
		if (current === null && this.ctx.sessionProjections.stateOf(session, "workspaceRoots")?.submitted) throw new Error("Cannot add project sources to a conversation that has already started");
		foldWorkspaceRoots(current, roots);
	}
	rootsOf(session) {
		const roots = this.ctx.sessionProjections.stateOf(session, "workspaceRoots");
		if (roots === void 0) throw new Error("Project source projection is unavailable");
		return roots.roots;
	}
	/**
	* Read the session override without applying the deployment default.
	* @param session - session whose log supplies the override.
	* @returns the last logged mode, or `undefined` without one.
	*/
	overrideOf(session) {
		return this.ctx.sessionProjections.stateOf(session, "sandboxMode") ?? void 0;
	}
};
//#endregion
export { SANDBOX_MODES, SandboxPolicyService, SandboxPolicyService as default, setSandboxMode };
