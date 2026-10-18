import { expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AigcBridge } from '../src/studybuddy/aigc-bridge.ts'
import { accountAigcDirectory } from '../src/studybuddy/aigc-data.ts'

const aliases = vi.hoisted(() => new Map<string, string>())
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, realpath: (path: string) => actual.realpath(aliases.get(path) ?? path) }
})

it('admits a project under the canonical Windows profile root and still rejects foreign projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aigc-canonical-profile-'))
  const scope = { accountId: 'account-a', generation: 1 }
  const owner = { scope, hostGeneration: '00000000-0000-4000-8000-000000000001' }
  const configured = join(directory, 'configured'), physical = join(directory, 'physical')
  const allowed = join(accountAigcDirectory(configured, scope.accountId), 'workspaces')
  const canonical = join(accountAigcDirectory(physical, scope.accountId), 'workspaces')
  await mkdir(allowed, { recursive: true }); await mkdir(join(canonical, 'project'), { recursive: true })
  const root = await realpath(join(canonical, 'project'))
  aliases.set(allowed, canonical)
  const bridge = new AigcBridge({ userDataRoot: configured, isCurrent: () => true, hostContext: () => owner,
    command: async (action, data: any) => action === 'bind' ? { ...data, workspaceId: 'workspace-a' } : null })
  try {
    const bound = await bridge.bind(scope, root)
    expect(bound.workspaceId).toBe('workspace-a')
    await expect(bridge.project(scope, await realpath(directory))).rejects.toThrow('AIGC_PROJECT_INVALID')
    await expect(bridge.project(scope, await realpath(canonical))).rejects.toThrow('AIGC_PROJECT_INVALID')
  } finally { await bridge.revoke(); aliases.clear(); await rm(directory, { recursive: true, force: true }) }
})
