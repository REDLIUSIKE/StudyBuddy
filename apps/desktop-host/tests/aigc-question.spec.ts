import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { SessionId } from '@deepseek-ai/dsh-session'
import { askAigcQuestion } from '../src/aigc-question.ts'
it('uses the native question boundary and returns original typed form answers', async () => {
  const ask = vi.fn(async () => ({ answers: [{ id: 'count', selected: [], custom: '3' }, { id: 'approved', selected: ['是'] }, { id: 'formats', selected: ['PNG', 'WEBP'] }] }))
  const ctx = { userQuestions: { ask } } as unknown as Context, agent = {} as Agent, signal = new AbortController().signal
  const result = await askAigcQuestion(ctx, agent, { title: '确认导出', question: '导出选项', fields: [
    { field: 'count', title: '数量', type: 'inputNumber', required: true }, { field: 'approved', title: '继续', type: 'switch' }, { field: 'formats', title: '格式', type: 'checkbox', options: ['PNG', 'WEBP'] },
  ] }, signal)
  expect(result).toMatchObject({ values: { count: 3, approved: true, formats: ['PNG', 'WEBP'] } })
  expect(ask).toHaveBeenCalledWith(expect.objectContaining({ agent, signal, questions: expect.arrayContaining([expect.objectContaining({ id: 'formats', multiSelect: true })]) }))
})

it('uses a real live native root for child questions without changing native ownership rules', async () => {
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(UserQuestionService)
    const root = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000071'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
    const child = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000072'), parentAgent: root, meta: { parentSession: root.id, origin: 'subagent' }, agentOptions: {} })).agent
    const seen: Agent[] = []
    ctx.on('user-questions/request', async request => { seen.push(request.agent!); return { answers: [{ id: 'answer', selected: ['Yes'] }] } }, { global: true })
    const input = { title: 'Confirm', question: 'Continue?' }, signal = new AbortController().signal
    await expect(askAigcQuestion(ctx, child, input, signal)).rejects.toMatchObject({ code: 'DELEGATED_CALLER' })
    await expect(askAigcQuestion(ctx, root, input, signal)).resolves.toMatchObject({ answer: 'Yes' })
    expect(seen).toEqual([root]); expect(ctx.agents.isOwnedBy(child.id, root)).toBe(true)
  } finally { await ctx.fiber.dispose() }
})

it('permits skipping required forms and omits empty optional typed fields', async () => {
  const ask = vi.fn(async () => ({ answers: [] as { id: string; selected: string[]; custom?: string }[] }))
  const ctx = { userQuestions: { ask } } as unknown as Context, agent = {} as Agent, signal = new AbortController().signal
  const input = { title: '导出', question: '选项', fields: [{ field: 'count', title: '数量', type: 'inputNumber', required: true }, { field: 'approved', title: '继续', type: 'switch' }] }
  await expect(askAigcQuestion(ctx, agent, input, signal)).resolves.toMatchObject({ answer: '', skipped: true })
  ask.mockResolvedValueOnce({ answers: [{ id: 'answer', selected: [], custom: 'Done' }] })
  await expect(askAigcQuestion(ctx, agent, { ...input, fields: [...input.fields.map(row => ({ ...row, required: false })), { field: 'answer', title: '说明', type: 'input' }] }, signal))
    .resolves.toMatchObject({ values: { answer: 'Done' } })
})
