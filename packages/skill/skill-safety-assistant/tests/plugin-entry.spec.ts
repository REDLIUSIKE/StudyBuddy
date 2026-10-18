import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished } from 'vitest'
import SkillSafety from '../src/index.ts'
import * as SkillSafetyTools from '../src/tools.ts'

it('loads the configured module namespace through Cordis and exposes only the dedicated safety tools', async () => {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(SkillSafety)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('safety-plugin-entry') })
  // The production preset loader imports a module namespace rather than
  // calling registerSkillSafetyTools directly.
  await agent.ctx.plugin(SkillSafetyTools)
  expect(ctx.tools.schemas(agent).map(tool => tool.name).sort()).toEqual([
    'skill_safety_find', 'skill_safety_install', 'skill_safety_prepare_scanner', 'skill_safety_scan',
  ])
})
