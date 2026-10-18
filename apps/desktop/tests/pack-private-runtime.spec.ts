import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { packPrivateDesktopRuntime, selectPrivateDesktopRuntimePackages, validatePrivateRuntimePayload } from '../scripts/pack-private-runtime.ts'

const target = { platform: 'win32', arch: 'x64' } as const
async function fixture(overrides: Record<string, Record<string, unknown>> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-private-pack-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'inert-pack-fixture', private: true }))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  const manifests: Record<string, Record<string, unknown>> = {
    cli: { name: '@deepseek-ai/dsh', dependencies: { 'private-feature': 'workspace:*', external: '^1' }, devDependencies: { 'dev-only': 'workspace:*' } },
    host: { name: '@deepseek-ai/dsh-desktop-host', private: true, dependencies: { '@deepseek-ai/dsh': 'workspace:*' } },
    feature: { name: 'private-feature', private: true, peerDependencies: { 'private-contracts': 'workspace:*' }, optionalDependencies: { 'mac-only': 'workspace:*', 'win-only': 'workspace:*' } },
    contracts: { name: 'private-contracts', private: true },
    mac: { name: 'mac-only', private: true, os: ['darwin'] },
    win: { name: 'win-only', private: true, os: ['win32'], cpu: ['x64'] },
    dev: { name: 'dev-only', private: true },
    unused: { name: 'unused-private', private: true },
  }
  for (const [directory, values] of Object.entries({ ...manifests, ...overrides })) {
    const path = join(root, 'packages', directory)
    await mkdir(join(path, 'lib'), { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({
      version: '1.0.0', type: 'module', main: 'lib/index.js', exports: { '.': './lib/index.js', './client': './lib/client.js' },
      files: ['lib/*.js', 'assets/*/SKILL.md'], ...values,
    }))
    await writeFile(join(path, 'lib/index.js'), 'export const inert = true')
    await writeFile(join(path, 'lib/client.js'), 'export const fixtureClient = true')
    await mkdir(join(path, 'assets/guide'), { recursive: true })
    await writeFile(join(path, 'assets/guide/SKILL.md'), '# Inert fixture skill')
    await writeFile(join(path, '.env'), 'INERT_PRIVATE_FIXTURE=never-in-package')
  }
  return { root, close: () => rm(root, { recursive: true, force: true }) }
}

it('selects reachable private production and peer packages, not dev or incompatible optional packages', async () => {
  const f = await fixture()
  try {
    expect(selectPrivateDesktopRuntimePackages(f.root, target).map(value => value.name))
      .toEqual(['private-contracts', 'private-feature', 'win-only'])
  } finally { await f.close() }
})

it('refuses a missing workspace dependency instead of resolving it from npm', async () => {
  const f = await fixture({ feature: { name: 'private-feature', private: true, dependencies: { 'lost-local': 'workspace:*' } } })
  try { expect(() => selectPrivateDesktopRuntimePackages(f.root, target)).toThrow(/lost-local/) }
  finally { await f.close() }
})

it.each(['package/.env', 'package/accounts/token.json', 'package/src/index.ts', 'package/lib/index.js.map'])
('refuses private or development payload %s', (file) => {
  expect(() => { validatePrivateRuntimePayload({ name: 'private-feature', version: '1.0.0', private: true, main: 'lib/index.js' }, ['package/package.json', 'package/lib/index.js', file]) })
    .toThrow()
})

it('refuses a tarball whose client export was not built', () => {
  expect(() => { validatePrivateRuntimePayload({
    name: 'private-feature', version: '1.0.0', private: true, exports: { '.': './lib/index.js', './client': './lib/client.js' },
  }, ['package/package.json', 'package/lib/index.js']) }).toThrow(/lib\/client.js/)
})

it('refuses unsupported runtime wildcard exports rather than accepting an empty exported directory', () => {
  expect(() => { validatePrivateRuntimePayload({
    name: 'private-feature', private: true,
    exports: { '.': './lib/index.js', './features/*': './lib/features/*.js' },
  }, ['package/package.json', 'package/lib/index.js']) }).toThrow(/wildcard/)
})

it('exempts only development source exports while still requiring concrete runtime entries', () => {
  expect(() => { validatePrivateRuntimePayload({
    name: 'private-feature', private: true,
    exports: { '.': './lib/index.js', './src/*': './src/*' },
  }, ['package/package.json', 'package/lib/index.js']) }).not.toThrow()
})

it('packs real inert private workspaces with client and Skill assets, without running lifecycle scripts or including .env', async () => {
  const f = await fixture()
  try {
    const manifestPath = join(f.root, 'packages/feature/package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    await writeFile(manifestPath, JSON.stringify({ ...manifest, scripts: { prepack: 'node -e "process.exit(91)"' } }))
    const outputs = packPrivateDesktopRuntime(f.root, join(f.root, 'output'), target)
    expect(outputs.map(value => value.name)).toEqual(['private-contracts', 'private-feature', 'win-only'])
    for (const result of outputs) {
      expect(result.files).toContain('package/lib/client.js')
      expect(result.files).toContain('package/assets/guide/SKILL.md')
      expect(result.files).not.toContain('package/.env')
      expect(result.bytes).toBeGreaterThan(0)
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(await readFile(result.tarball)).not.toHaveLength(0)
    }
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({ private: true })
  } finally { await f.close() }
}, 30_000)
