/** Platform argument contracts only; native Windows access is tested by its runner suite. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { bwrapProfileArgs, landlockProfileArgs, seatbeltProfileArgs } from '../../sandbox-local/src/profiles.ts'

const fixtures: string[] = []
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }) })
function roots() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-project-profile-')))
  fixtures.push(root)
  const first = join(root, 'first'), second = join(root, '资料 空间')
  mkdirSync(first); mkdirSync(second)
  return { root, first, second }
}
it('expresses both captured roots in Linux bind and Landlock grants', () => {
  const { first, second } = roots()
  const policy = { mode: 'workspace-write' as const, workspaceRoot: first, additionalWorkspaceRoots: [second] }
  expect(bwrapProfileArgs(policy)).toEqual([
    '--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent',
    '--tmpfs', '/tmp', '--bind', first, first, '--bind', second, second,
  ])
  expect(landlockProfileArgs(policy)).toEqual(['--ro', '/', '--rw', '/dev/null', '--rw', '/tmp', '--rw', first, '--rw', second])
})
it('expresses the same captured roots in Seatbelt without granting their parent', () => {
  const { root, first, second } = roots()
  const profile = seatbeltProfileArgs({ mode: 'workspace-write', workspaceRoot: first, additionalWorkspaceRoots: [second] })[1]!
  expect(profile).toContain(`(subpath ${JSON.stringify(first)})`)
  expect(profile).toContain(`(subpath ${JSON.stringify(second)})`)
  expect(profile).not.toContain(`(subpath ${JSON.stringify(root)})`)
})
it.each([bwrapProfileArgs, landlockProfileArgs, seatbeltProfileArgs])('does not add selected-source write grants under read-only (%#)', build => {
  const { first, second } = roots()
  const profile = build({ mode: 'read-only', workspaceRoot: first, additionalWorkspaceRoots: [second] }).join(' ')
  expect(profile).not.toContain(first)
  expect(profile).not.toContain(second)
})
it.each([bwrapProfileArgs, landlockProfileArgs, seatbeltProfileArgs])('refuses a missing exact captured source under workspace-write (%#)', build => {
  const { root, first } = roots()
  expect(() => build({ mode: 'workspace-write', workspaceRoot: first, additionalWorkspaceRoots: [join(root, 'missing')] })).toThrow()
})
