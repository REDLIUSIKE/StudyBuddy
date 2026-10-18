import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifySkillScannerResources } from '../../apps/desktop/src/studybuddy/skill-safety-resources.ts'
import { prepareSkillScannerResources } from './prepare-resources.ts'

// Count real filesystem opens at the I/O boundary; all bytes/stat/inode checks still use the actual disk.
const { opened } = vi.hoisted(() => ({ opened: new Map<string, number>() }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: (async (...args: Parameters<typeof actual.open>) => {
    const path = String(args[0]); opened.set(path, (opened.get(path) ?? 0) + 1)
    return actual.open(...args)
  }) }
})

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(separated = false) {
  const parent = await mkdtemp(join(tmpdir(), 'scanner-resource-')); roots.push(parent)
  const root = join(parent, 'skill-scanner'), runtimeDirectory = join(parent, separated ? 'installed/runtime' : 'primary-runtime'), runtime = join(runtimeDirectory, 'dependencies/python')
  await mkdir(root); await mkdir(runtime, { recursive: true })
  const resource = Buffer.from('inert fixture'), sha256 = createHash('sha256').update(resource).digest('hex')
  for (const name of ['worker.py', 'transport.py', 'network.py']) await writeFile(join(root, name), resource)
  await writeFile(join(runtime, 'python.exe'), resource)
  await writeFile(join(runtimeDirectory, 'runtime.json'), JSON.stringify({ desktopVersion: 'fixture', platform: 'win32', arch: 'x64', python: '3.12.14', pythonPackages: {} }))
  const manifestBytes = JSON.stringify({ schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14',
    upstream: { repository: 'https://github.com/cisco-ai-defense/skill-scanner', version: '2.2.2', commit: 'ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a' },
    lockDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64), runtimeFiles: [{ path: 'python.exe', sha256, size: resource.length }],
    files: ['worker.py', 'transport.py', 'network.py'].map(path => ({ path, sha256, size: resource.length })) })
  await writeFile(join(root, 'scanner-manifest.json'), manifestBytes)
  return { root, runtimeDirectory, manifestSha256: createHash('sha256').update(manifestBytes).digest('hex') }
}
it('verifies each resource and shared interpreter byte before invocation', async () => {
  const { root, runtimeDirectory, manifestSha256 } = await fixture(); const manifest = await verifySkillScannerResources(root, runtimeDirectory, manifestSha256)
  expect(manifest.pythonVersion).toBe('3.12.14')
  await writeFile(join(root, 'worker.py'), 'changed')
  await expect(verifySkillScannerResources(root, runtimeDirectory, manifestSha256)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('resource byte witnesses are hashed once rather than reread just for the name inventory', async () => {
  const { root, runtimeDirectory, manifestSha256 } = await fixture(); opened.clear()
  await verifySkillScannerResources(root, runtimeDirectory, manifestSha256)
  expect(opened.get(join(root, 'worker.py'))).toBe(1)
  expect(opened.get(join(runtimeDirectory, 'dependencies/python/python.exe'))).toBe(1)
})
it('rejects extra files, path escape and changed runtime bytes', async () => {
  const { root, runtimeDirectory, manifestSha256 } = await fixture(); await writeFile(join(root, 'extra.py'), 'unexpected')
  await expect(verifySkillScannerResources(root, runtimeDirectory, manifestSha256)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
  await rm(join(root, 'extra.py')); await writeFile(join(root, '../primary-runtime/dependencies/python/python.exe'), 'changed')
  await expect(verifySkillScannerResources(root, runtimeDirectory, manifestSha256)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('verifies a download-cache directory against the separately owned installed runtime', async () => {
  const { root, runtimeDirectory, manifestSha256 } = await fixture(true)
  await expect(verifySkillScannerResources(root, runtimeDirectory, manifestSha256)).resolves.toMatchObject({ pythonVersion: '3.12.14' })
})
it('rejects a changed manifest even when all its file hashes still match', async () => {
  const { root, runtimeDirectory, manifestSha256 } = await fixture()
  const bytes = await readFile(join(root, 'scanner-manifest.json'), 'utf8')
  await writeFile(join(root, 'scanner-manifest.json'), bytes.replace('"configDigest":"' + 'b'.repeat(64), '"configDigest":"' + 'c'.repeat(64)))
  await expect(verifySkillScannerResources(root, runtimeDirectory, manifestSha256)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('rejects a caller with the wrong trusted manifest digest', async () => {
  const { root, runtimeDirectory } = await fixture()
  await expect(verifySkillScannerResources(root, runtimeDirectory, '0'.repeat(64))).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('source_change_rebuilds_candidate instead of reusing a byte-valid stale worker', async () => {
  const { root, runtimeDirectory } = await fixture()
  await expect(prepareSkillScannerResources({ target: 'win32-x64', destination: root, runtimeDirectory })).rejects.toThrow('SKILL_SAFETY_RESOURCE_STALE')
})
it('never assembles scanner files inside the separately owned interpreter tree', async () => {
  const { root, runtimeDirectory } = await fixture()
  const destination = join(runtimeDirectory, 'nested-scanner')
  await cp(root, destination, { recursive: true, errorOnExist: true, force: false })
  await expect(prepareSkillScannerResources({ target: 'win32-x64', destination, runtimeDirectory })).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
