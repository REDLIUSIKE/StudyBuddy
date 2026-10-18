import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { it, expect } from 'vitest'
import { SandboxedFileSystem } from '../src/index.ts'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import Projections from '@deepseek-ai/dsh-session-projection'
import { outsideTempWorkspaceParent } from '../../../../scripts/snapshot-workspace-parent.ts'

it('permits selected source writes and denies unrelated writes and read-only source writes', async () => {
  const root = await realpath(await mkdtemp(join(outsideTempWorkspaceParent(), '.dsh-project-roots-')))
  const ctx = new Context()
  try {
    const main = join(root, 'main')
    const source = join(root, 'source')
    const outside = join(root, 'outside')
    for (const path of [main, source, outside]) await mkdir(path)
    await ctx.plugin(Projections)
    await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: main })
    await ctx.plugin(SandboxedFileSystem, { cwd: main })
    const fs = ctx.fs
    const policy = { mode: 'workspace-write' as const, workspaceRoot: main, additionalWorkspaceRoots: [source] }
    const path = join(source, 'allowed.txt')
    await fs.writeText(await fs.resolve(path), 'selected source', undefined, undefined, policy)
    expect(await readFile(path, 'utf8')).toBe('selected source')
    await expect(fs.writeText(await fs.resolve(join(outside, 'denied.txt')), 'x', undefined, undefined, policy))
      .rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await expect(fs.writeText(await fs.resolve(join(source, 'readonly.txt')), 'x', undefined, undefined, { ...policy, mode: 'read-only' }))
      .rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
