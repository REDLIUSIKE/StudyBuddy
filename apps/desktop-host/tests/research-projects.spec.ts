import { expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeResearchProjects } from '../src/research-projects.ts'
it('fences native parent and descendant execution before completing account revocation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'native-research-project-')))
  const scope = { scope: { accountId: 'account-a', generation: 1 }, hostGeneration: '11111111-1111-4111-8111-111111111111' }
  const sessionId = 'session-22222222-2222-4222-8222-222222222222', lease = '33333333-3333-4333-8333-333333333333'
  let done!: () => void; const idle = new Promise<void>(resolve => { done = resolve })
  const parent = { id: sessionId, cancel: vi.fn(), whenIdle: () => idle }, child = { id: 'child-session', cancel: vi.fn(), whenIdle: () => idle }
  const sessions = new Map<string, unknown>()
  const ctx = { workspaceRegistry: { resolveByPath: async () => undefined, create: async () => ({ id: 'workspace' }) }, sessions: { get: (id: string) => sessions.get(id) },
    sessionController: { create: async (input: { sessionId: string }) => { sessions.set(input.sessionId, { header: { cwd: root } }) } },
    agents: { get: (id: string) => id === sessionId ? parent : undefined, list: () => [parent, child], isOwnedBy: (id: string, owner: unknown) => id === child.id && owner === parent } }
  try {
    const projects = new NativeResearchProjects(ctx as never, scope.hostGeneration)
    await projects.setScope(scope)
    const binding = await projects.bind({ ...scope, projectId: 'study', sessionId, lease, root })
    expect(projects.binding(binding)).toBe(binding)
    let settled = false; const stop = projects.setScope(null).then(() => { settled = true })
    expect(projects.binding(binding)).toBeUndefined(); expect(parent.cancel).toHaveBeenCalledOnce(); expect(child.cancel).toHaveBeenCalledOnce()
    await Promise.resolve(); expect(settled).toBe(false); done(); await stop; expect(settled).toBe(true)
  } finally { done?.(); await rm(root, { recursive: true, force: true }) }
})
