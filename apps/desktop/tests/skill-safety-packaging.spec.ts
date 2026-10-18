import { afterEach, expect, it } from 'vitest'
import { statSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FileMatcher } from 'app-builder-lib/out/fileMatcher.js'
import type { FileSet } from 'app-builder-lib'
import { load } from 'js-yaml'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
function configuration() {
  return createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'com.studybuddy.skill-safety.test', DSH_DESKTOP_UNSIGNED: '1',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  }, 'win32', 'x64')
}
it('installer_has_no_scanner_payload using the actual electron-builder matcher and stale candidate bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-scanner-packaging-')); roots.push(root)
  const source = join(root, 'runtime'), target = join(root, 'packaged-runtime')
  for (const path of ['primary-runtime/python.exe', 'skill-scanner/worker.py', 'skill-scanner/packages/large.bin']) {
    await mkdir(join(source, path, '..'), { recursive: true }); await writeFile(join(source, path), path)
  }
  const resources: readonly FileSet[] = configuration().extraResources
  const resource = resources.find(entry => entry.to === 'runtime')
  if (resource === undefined) throw Error('Desktop runtime resource missing')
  const matcher = new FileMatcher(source, target, value => value, resource.filter), admits = matcher.createFilter()
  expect(admits(join(source, 'primary-runtime/python.exe'), statSync(join(source, 'primary-runtime/python.exe')))).toBe(true)
  expect(admits(join(source, 'skill-scanner'), statSync(join(source, 'skill-scanner')))).toBe(false)
  expect(admits(join(source, 'skill-scanner/packages/large.bin'), statSync(join(source, 'skill-scanner/packages/large.bin')))).toBe(false)
  await cp(source, target, { recursive: true, filter: async path => admits(path, statSync(path)) })
  expect(await readdir(target)).toEqual(['primary-runtime'])
})
it('only the small generated descriptor joins the existing native and AIGC resources', () => {
  const resources: readonly FileSet[] = configuration().extraResources
  const descriptor = resources.find(entry => entry.to === 'skill-scanner-release.json')
  if (descriptor === undefined) throw Error('Desktop scanner release descriptor missing')
  expect(descriptor.from).toBe(resolve('apps/desktop/.desktop-build/targets/win-x64/skill-scanner-publication/release.json'))
  expect(resources.some(entry => entry.to === 'studybuddy-skills-native')).toBe(true)
  expect(resources.some(entry => entry.to === 'studybuddy-aigc')).toBe(true)
})
it('existing extract-zip is admitted as a production dependency at its unchanged locked version', async () => {
  const manifest = JSON.parse(await readFile(resolve('apps/desktop/package.json'), 'utf8'))
  const document = load(await readFile(resolve('pnpm-lock.yaml'), 'utf8')) as { importers: Record<string, { dependencies: Record<string, { version: string }>; devDependencies: Record<string, { version: string }> }> }
  const importer = document.importers['apps/desktop']
  if (importer === undefined) throw Error('Desktop lockfile importer missing')
  const extractZip = importer.dependencies['extract-zip']
  if (extractZip === undefined) throw Error('Desktop extract-zip dependency missing')
  expect(manifest.dependencies['extract-zip']).toBe('^2.0.1'); expect(manifest.devDependencies['extract-zip']).toBeUndefined()
  expect(extractZip.version).toBe('2.0.1(supports-color@9.4.0)'); expect(importer.devDependencies['extract-zip']).toBeUndefined()
})
