import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, type TestContext } from 'vitest'
import { requireDesktopReleaseVersions } from '../scripts/desktop-release-version-preflight.ts'

async function fixture(t: TestContext, versions: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-release-versions-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const entries = {
    'package.json': { name: '@deepseek-ai/dsh-root', private: true },
    'apps/cli/package.json': { name: '@deepseek-ai/dsh' },
    'apps/desktop/package.json': { name: '@deepseek-ai/dsh-desktop', private: true },
    'apps/desktop-host/package.json': { name: '@deepseek-ai/dsh-desktop-host', private: true },
    'packages/core/agent/package.json': { name: '@deepseek-ai/dsh-agent' },
    'packages/client/private/package.json': { name: '@deepseek-ai/dsh-private', private: true },
    'vendor/independent/package.json': { name: '@deepseek-ai/vendor-independent', version: '8.0.0' },
    'native/system/package.json': { name: '@deepseek-ai/node-addon-system', version: '2.0.0' },
  }
  for (const [path, manifest] of Object.entries(entries)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), JSON.stringify({ version: '1.0.5', ...manifest, ...versions[path] === undefined ? {} : { version: versions[path] } }))
  }
  return root
}

it('accepts the shared product version without rewriting manifests or aligning independent families', async t => {
  const root = await fixture(t)
  const before = await readFile(join(root, 'package.json'), 'utf8')
  expect(requireDesktopReleaseVersions(root)).toBe('1.0.5')
  expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
})

it('reports all published and private version conflicts together before any build', async t => {
  const root = await fixture(t, {
    'apps/cli/package.json': '1.0.4',
    'apps/desktop-host/package.json': '1.0.3',
    'packages/client/private/package.json': '1.0.2',
  })
  let message = ''
  try { requireDesktopReleaseVersions(root) } catch (error) { message = (error as Error).message }
  expect(message).toContain('expected 1.0.5')
  expect(message).toContain('apps/cli/package.json: 1.0.4')
  expect(message).toContain('apps/desktop-host/package.json: 1.0.3')
  expect(message).toContain('packages/client/private/package.json: 1.0.2')
  expect(JSON.parse(await readFile(join(root, 'apps/cli/package.json'), 'utf8'))).toHaveProperty('version', '1.0.4')
})

it('also rejects the root and desktop disagreeing when every published member matches desktop', async t => {
  const root = await fixture(t, { 'package.json': '1.0.4' })
  expect(() => requireDesktopReleaseVersions(root)).toThrow('apps/desktop/package.json: 1.0.5')
})

it('rejects a missing root version before planning release inputs', async t => {
  const root = await fixture(t)
  await writeFile(join(root, 'package.json'), '{"private":true}')
  expect(() => requireDesktopReleaseVersions(root)).toThrow('package.json must declare a string version')
})
