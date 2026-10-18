import AgentRegistry from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import LlmRuntime from "@deepseek-ai/dsh-llm";
import SessionStore from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import FsLocal from "@deepseek-ai/dsh-fs-local";
import WorkingDirectory from "@deepseek-ai/dsh-working-directory";
//#region lib/types/inbox.js
/**
* Create a mutable in-memory Inbox stub for tests that exercise only the public
* queue operations. Durable events, projection validation, and live Inbox
* notifications require a real Agent created by the AgentLoop test harness.
* @returns an Inbox backed by two process-local arrays.
*/
function createInboxStub() {
	const pending = {
		"next-turn": [],
		"next-step": []
	};
	const locate = (messageId) => {
		for (const target of ["next-turn", "next-step"]) {
			const index = pending[target].findIndex((message) => message.id === messageId);
			if (index >= 0) return {
				target,
				index
			};
		}
	};
	return {
		get nextTurn() {
			return pending["next-turn"];
		},
		get nextStep() {
			return pending["next-step"];
		},
		clear() {
			pending["next-step"].splice(0);
			pending["next-turn"].splice(0);
		},
		append(target, message) {
			pending[target].push(message);
		},
		prepend(target, message) {
			pending[target].unshift(message);
		},
		replace(messageId, message) {
			const location = locate(messageId);
			if (location === void 0) return false;
			pending[location.target].splice(location.index, 1, message);
			return true;
		},
		remove(messageId) {
			const location = locate(messageId);
			if (location === void 0) return false;
			pending[location.target].splice(location.index, 1);
			return true;
		},
		splice(target, start, deleteCount, inserted) {
			return pending[target].splice(start, deleteCount, ...inserted);
		}
	};
}
/**
* Create an unsupported Inbox placeholder for Agent stubs whose tests do not exercise Inbox behavior.
* @returns an Inbox whose pending lists are empty and whose mutation methods throw.
*/
function unsupportedInbox() {
	const rejectMutation = () => {
		throw new Error("this test Agent does not support Inbox mutations");
	};
	return {
		nextTurn: [],
		nextStep: [],
		clear: rejectMutation,
		append: rejectMutation,
		prepend: rejectMutation,
		replace: rejectMutation,
		remove: rejectMutation,
		splice: rejectMutation
	};
}
//#endregion
//#region lib/types/working-directory-fixture.js
/**
* Supply fixed directory values without filesystem checks or durable changes.
* @param ctx - context owning this test collaborator.
* @param defaultDirectory - fallback for fixtures without a Session directory.
*/
function provideWorkingDirectoryFixture(ctx, defaultDirectory = process.cwd()) {
	const get = (session) => session.header.cwd ?? defaultDirectory;
	ctx.provide("workingDirectory", {
		defaultDirectory,
		get,
		ensure: (agent) => Promise.resolve(get(agent.session))
	});
}
//#endregion
//#region lib/types/index.js
/**
* Shared service mounting, real AgentLoop drivers, and structural Inbox stubs
* for agent-loop tests. Callers retain ownership of their contexts, adapters,
* optional plugins, agents, and teardown.
* @module @deepseek-ai/dsh-agent-loop-testkit
*/
/**
* Mount the standard prerequisite services for an AgentLoop test.
*
* The function deliberately does not mount AgentLoop or register an adapter,
* so tests retain control of load order and the topology under test. The
* context owns every mounted service and remains responsible for disposal. A
* plugin-load failure rejects the promise; services activated earlier in the
* sequence remain context-owned and unwind with that context.
* @param ctx - test context that owns the mounted services.
* @param options - optional service configuration forwarded without mutation.
* @returns after every prerequisite service has activated.
*/
async function mountAgentLoopTestDependencies(ctx, options = {}) {
	await ctx.plugin(LlmRuntime);
	await ctx.plugin(SessionStore);
	await ctx.plugin(SessionProjectionRegistry);
	await ctx.plugin(SystemPrompt, options.systemPrompt ?? {});
	if (options.workingDirectory) {
		if (ctx.get("fs") === void 0) await ctx.plugin(FsLocal);
		await ctx.plugin(WorkingDirectory);
	}
	await ctx.plugin(ToolRuntime, options.tools ?? {});
	await ctx.plugin(AgentRegistry);
}
/**
* Mount the production AgentLoop and expose its narrow test-driver operations.
* Mount {@link mountAgentLoopTestDependencies} and any load-order-sensitive
* consumers before calling this helper. The context owns the loop and every
* Agent returned by the harness.
* @param ctx - test context with the AgentLoop prerequisite services active.
* @returns a driver that creates production Agents and claims their real Inbox.
*/
async function mountAgentLoopTestHarness(ctx) {
	await ctx.plugin(AgentLoop, { agents: [] });
	return {
		create: async (id, options = {}, meta = {}) => ctx.agentLoop.create(id, options, meta),
		claim: (agent, target, turn) => agent.inbox.claim(target, turn)
	};
}
//#endregion
export { createInboxStub, mountAgentLoopTestDependencies, mountAgentLoopTestHarness, provideWorkingDirectoryFixture, unsupportedInbox };
