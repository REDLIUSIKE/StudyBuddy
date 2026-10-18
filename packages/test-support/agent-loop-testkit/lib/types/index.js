/**
 * Shared service mounting, real AgentLoop drivers, and structural Inbox stubs
 * for agent-loop tests. Callers retain ownership of their contexts, adapters,
 * optional plugins, agents, and teardown.
 * @module @deepseek-ai/dsh-agent-loop-testkit
 */
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import FsLocal from '@deepseek-ai/dsh-fs-local';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
export { createInboxStub, unsupportedInbox } from "./inbox.js";
export { provideWorkingDirectoryFixture } from "./working-directory-fixture.js";
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
export async function mountAgentLoopTestDependencies(ctx, options = {}) {
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SessionProjectionRegistry);
    await ctx.plugin(SystemPrompt, options.systemPrompt ?? {});
    if (options.workingDirectory) {
        if (ctx.get('fs') === undefined)
            await ctx.plugin(FsLocal);
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
export async function mountAgentLoopTestHarness(ctx) {
    await ctx.plugin(AgentLoop, { agents: [] });
    return {
        create: async (id, options = {}, meta = {}) => ctx.agentLoop.create(id, options, meta),
        claim: (agent, target, turn) => agent.inbox.claim(target, turn),
    };
}
//# sourceMappingURL=index.js.map