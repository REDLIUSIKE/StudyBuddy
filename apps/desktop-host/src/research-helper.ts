/** One deliberately admitted native helper; model execution and usage remain in the real Agent loop. */
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'

export interface NativeResearchHelperInput {
  readonly parent: Agent
  readonly sessionId: SessionId
  readonly selection: Readonly<ModelSelection>
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly maxTokens: number
  readonly signal: AbortSignal
}

/**
 * Execute a source-approved one-shot helper without importing another model SDK.
 * @param ctx - native registry/factory owner.
 * @param input - captured live selection, reviewed context and operation identity.
 * @returns text from a completed observed native turn and its durable Session reference.
 */
export async function runNativeResearchHelper(ctx: Context, input: NativeResearchHelperInput): Promise<{ text: string; sessionId: SessionId }> {
  input.signal.throwIfAborted()
  const handle = await ctx.agents.create({
    sessionId: input.sessionId,
    parentAgent: input.parent,
    meta: { parentSession: input.parent.id, origin: 'subagent', ...(input.parent.session.header.cwd === undefined ? {} : { cwd: input.parent.session.header.cwd }) },
    agentOptions: { ...input.selection, maxTokens: input.maxTokens },
    signal: input.signal,
    setup(agentCtx) {
      installModelSelection(agentCtx, { current: { ...input.selection }, assembled: undefined }, { requireSelection: true })
      agentCtx.systemPrompt.section({ name: 'studybuddy-research-helper', order: 0, complete: true, interpolate: false, text: input.systemPrompt })
      agentCtx.tools.restrict({ allow: [] })
      agentCtx.tools.guard(() => 'This one-shot research helper has no tool capability.')
      agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembled = await next()
        return { ...assembled, tools: [], contexts: [] }
      }, { prepend: true })
      agentCtx.on('agent/pre-step', async ({ step }, next) => {
        const decision = await next()
        return step > 1 ? { kind: 'reject' } : decision
      }, { prepend: true })
      agentCtx.on('agent/request-error', async (_failure, next) => {
        await next()
        return undefined
      }, { prepend: true })
    },
  })
  const abort = () => handle.agent.cancel({ kind: 'parent' })
  input.signal.addEventListener('abort', abort, { once: true })
  try {
    input.signal.throwIfAborted()
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: input.userPrompt }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    input.signal.throwIfAborted()
    const events = handle.agent.session.snapshotEvents()
    const terminal = events.findLast(event => event.type === 'turn/end')
    const message = events.findLast(event => event.type === 'assistant/message')
    if (!terminal || terminal.type !== 'turn/end' || terminal.data.reason.kind !== 'completed' ||
      !message || message.type !== 'assistant/message' || message.data.interrupted || events.some(event => event.type === 'tool/call')) {
      throw Error('HARNESS_RESEARCH_HELPER_INCOMPLETE')
    }
    const text = message.data.message.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('\n')
    if (!text.trim()) throw Error('HARNESS_RESEARCH_HELPER_INCOMPLETE')
    return { text, sessionId: handle.agent.id }
  } finally {
    input.signal.removeEventListener('abort', abort)
    await handle.dispose()
  }
}
