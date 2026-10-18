//#region lib/types/errors.js
/** Failure code is stable; receiving UI owns localized copy and the safe next action. */
var SkillSafetyError = class extends Error {
	/** Machine-readable failure identity. */
	code;
	constructor(code, options) {
		super(code, options);
		this.name = "SkillSafetyError";
		this.code = code;
	}
};
//#endregion
//#region lib/types/provider.js
/**
* Compose the native-question consumer with a private scope/admission owner.
* @param ctx - Actual Host services, not a renderer or model-created registry.
* @param control - Private Main RPC and account/session binding.
* @returns One provider; no command body contains an approval field.
*/
function createSkillSafetyProvider(ctx, control) {
	const root = (agent) => {
		if (ctx.agents.get(agent.id) !== agent || !ctx.agents.roots().includes(agent) || agent.session.id !== agent.id) throw new SkillSafetyError("SKILL_SAFETY_STALE_SCOPE");
	};
	const bind = (agent) => {
		root(agent);
		const actor = control.bindRootAgent(agent);
		if (actor.sessionId !== agent.session.id) throw new SkillSafetyError("SKILL_SAFETY_STALE_SCOPE");
		return Object.freeze({ ...actor });
	};
	const current = (invocation) => {
		if (invocation.signal.aborted) throw new SkillSafetyError("SKILL_SAFETY_CANCELLED");
		const actor = bind(invocation.agent);
		if (actor.accountId !== invocation.actor.accountId || actor.generation !== invocation.actor.generation || actor.sessionId !== invocation.actor.sessionId) throw new SkillSafetyError("SKILL_SAFETY_STALE_SCOPE");
	};
	return {
		bindRootAgent: bind,
		presentation: (sessionId) => control.presentation(sessionId),
		execute: async (invocation, command) => {
			current(invocation);
			const snapshot = structuredClone(command);
			const prepared = await control.preflight(invocation, snapshot);
			try {
				current(invocation);
				if (prepared.requestId !== snapshot.requestId) throw new SkillSafetyError("SKILL_SAFETY_REQUEST_CONFLICT");
				const answer = prepared.question === void 0 ? void 0 : await ctx.userQuestions.ask({
					agent: invocation.agent,
					questions: [prepared.question],
					signal: invocation.signal
				});
				current(invocation);
				const result = await control.execute(invocation, prepared, answer);
				current(invocation);
				return result;
			} finally {
				await control.release(invocation, prepared);
			}
		}
	};
}
//#endregion
export { createSkillSafetyProvider };
