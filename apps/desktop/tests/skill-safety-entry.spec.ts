import { Context, Service } from '@deepseek-ai/cordis'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { SkillSafetyEntry } from '../../desktop-host/src/skill-safety-entry.ts'
import { expect, it, onTestFinished } from 'vitest'
import type { SessionCreateRequest } from '@deepseek-ai/dsh-api-session-controller'
import type { ProjectCreateRequest } from '@deepseek-ai/dsh-api-workspace-controller'
async function fixture() {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose()); await ctx.plugin(Sessions)
  let generation = 1, pause: Promise<void> | undefined
  const projects: ProjectCreateRequest[] = [], calls: SessionCreateRequest[] = []
  class WorkspaceOwner extends Service {
    constructor(inner: Context) { super(inner, 'workspaceController') }
    async createProject(input: ProjectCreateRequest) { projects.push(input); await pause; return { workspace: { workspaceId: WorkspaceId('feature-project'), path: 'C:/private-managed', title: '技能检查' } } }
  }
  class SessionOwner extends Service {
    constructor(inner: Context) { super(inner, 'sessionController') }
    async create(input: SessionCreateRequest) {
      calls.push(input); const id = input.sessionId ?? SessionId('unexpected-random-session')
      if (!ctx.sessions.get(id)) ctx.sessions.create(id, { meta: { agentPreset: input.agentPreset ?? 'standard' } })
      return { sessionId: id, agentPreset: input.agentPreset }
    }
  }
  await ctx.plugin(WorkspaceOwner); await ctx.plugin(SessionOwner)
  const entry = new SkillSafetyEntry(ctx, () => ({ accountId: 'original', generation }))
  return { entry, projects, calls, block: (value: Promise<void>) => { pause = value }, changeGeneration: () => { generation++ } }
}
it('double click is one native session; retries recover accepted identity without messages or downloads', async () => {
  const h = await fixture()
  const [a, b] = await Promise.all([h.entry.beginSkillSafetySession('one-entry'), h.entry.beginSkillSafetySession('one-entry')])
  expect(a).toEqual(b); expect(h.calls).toHaveLength(1); expect(h.projects).toHaveLength(1)
  expect(h.calls[0]?.agentPreset).toBe('skill-safety')
  const retry = await h.entry.beginSkillSafetySession('one-entry'); expect(retry).toEqual(a)
  const next = await h.entry.beginSkillSafetySession('later-entry'); expect(next.workspaceId).toBe(a.workspaceId); expect(next.sessionId).not.toBe(a.sessionId)
  expect(h.projects.every(project => project.requestId === h.projects[0]?.requestId && project.title === '技能检查' && project.sourceIds.length === 0)).toBe(true)
})
it('same-account login generation changes during project creation admit no Session', async () => {
  const h = await fixture(); let resolve!: () => void; h.block(new Promise<void>(done => { resolve = done }))
  const pending = h.entry.beginSkillSafetySession('interrupted-entry'); h.changeGeneration(); resolve()
  await expect(pending).rejects.toThrow('SKILL_SAFETY_STALE_SCOPE'); expect(h.calls).toEqual([])
})
