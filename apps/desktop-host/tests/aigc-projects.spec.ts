import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { NativeAigcProjects } from '../src/aigc-projects.ts'

it('reuses one native workspace, fences revoked bindings immediately and awaits owned cleanup', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'aigc-native-project-')))
  const owner = { scope: { accountId: 'account-a', generation: 1 }, hostGeneration: '00000000-0000-4000-8000-000000000001' }
  const projectId = 'aigc-' + createHash('sha256').update(root).digest('hex').slice(0, 48), lease = '00000000-0000-4000-8000-000000000002'
  const sessions = new Map<string, string>(), idle = Promise.withResolvers<void>()
  let workspaces = 0, stopped: readonly string[] = []
  const projects = new NativeAigcProjects({ workspace: async () => { workspaces++; await Promise.resolve(); return 'workspace-a' },
    sessionDirectory: id => sessions.get(id), createSession: async id => { sessions.set(id, root) },
    stopSessions: ids => { stopped = [...ids]; return ids.size ? idle.promise : Promise.resolve() }, owns: (root, candidate) => root === candidate }, owner.hostGeneration)
  try {
    await projects.setScope(owner)
    const first = 'session-00000000-0000-4000-8000-000000000003', second = 'session-00000000-0000-4000-8000-000000000004'
    const [a, b] = await Promise.all([projects.bind({ ...owner, projectId, lease, root, sessionId: first }), projects.bind({ ...owner, projectId, lease, root, sessionId: second })])
    expect(workspaces).toBe(1)
    expect(a.workspaceId).toBe(b.workspaceId)
    expect(projects.binding(a)).toBe(a)
    expect(projects.owningBinding(first)).toBe(a)
    let completed = false
    const cleanup = projects.setScope(null).then(() => { completed = true })
    expect(projects.binding(a)).toBeUndefined()
    expect(stopped).toEqual(expect.arrayContaining([first, second]))
    await Promise.resolve(); expect(completed).toBe(false)
    idle.resolve(); await cleanup
    await expect(projects.bind({ ...owner, projectId, lease, root, sessionId: first })).rejects.toThrow('AIGC_SCOPE_REVOKED')
  } finally { idle.resolve(); await projects.setScope(null); await rm(root, { recursive: true, force: true }) }
})
