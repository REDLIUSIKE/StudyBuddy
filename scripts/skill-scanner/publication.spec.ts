import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { prepareSkillScannerPublication } from './prepare-publication.ts'
import { createSkillScannerDownload } from '../../apps/desktop/src/studybuddy/skill-safety-download.ts'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'skill-scanner-publication-')); roots.push(root)
  const resourcesDirectory = join(root, 'assembly'), runtimeDirectory = join(root, 'runtime'), outputDirectory = join(root, 'publication')
  await mkdir(resourcesDirectory); await mkdir(join(runtimeDirectory, 'dependencies/python'), { recursive: true })
  const inert = Buffer.from('inert build resource')
  await writeFile(join(runtimeDirectory, 'dependencies/python/python.exe'), inert)
  const files = ['network.py', 'transport.py', 'worker.py'].map(path => ({ path, size: inert.length, sha256: sha(inert) }))
  for (const { path } of files) await writeFile(join(resourcesDirectory, path), inert)
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14',
    upstream: { repository: 'https://github.com/cisco-ai-defense/skill-scanner', version: '2.2.2', commit: 'ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a' },
    lockDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64), files, runtimeFiles: [{ path: 'python.exe', size: inert.length, sha256: sha(inert) }] }))
  await writeFile(join(resourcesDirectory, 'scanner-manifest.json'), manifest)
  return { root, resourcesDirectory, runtimeDirectory, outputDirectory, manifest }
}
it('publication describes actual ZIP and only resource entries, not the interpreter', async () => {
  const input = await fixture(), publication = await prepareSkillScannerPublication(input), bytes = await readFile(publication.archivePath)
  expect(bytes.length).toBe(publication.release.archiveSizeBytes); expect(sha(bytes)).toBe(publication.release.archiveSha256)
  expect(publication.release.manifestSha256).toBe(sha(input.manifest))
  expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['network.py', 'scanner-manifest.json', 'transport.py', 'worker.py'])
  expect(JSON.parse(await readFile(join(input.outputDirectory, 'release.json'), 'utf8'))).toEqual(publication.release)
  const route = await readFile(publication.bridgePath, 'utf8')
  expect(route).toContain('location = /studybuddy-releases/labs/skill-scanner/win32-x64/' + sha(bytes) + '.zip')
  expect(route).toContain('autoindex off;'); expect(route).not.toContain('alias ')
  expect(route).toContain('proxy_pass http://127.0.0.1:19200/studybuddy-releases/labs/skill-scanner/')
})
it('same verified source bytes produce a deterministic archive', async () => {
  const input = await fixture(), first = await prepareSkillScannerPublication(input)
  const second = await prepareSkillScannerPublication({ ...input, outputDirectory: join(input.root, 'second-publication') })
  expect(second.release).toEqual(first.release); expect(await readFile(second.archivePath)).toEqual(await readFile(first.archivePath))
})
it('generated archive is admitted by the real downloader and byte verifier', async () => {
  const input = await fixture(), publication = await prepareSkillScannerPublication(input)
  const download = createSkillScannerDownload({ ...input, release: publication.release, cacheDirectory: join(input.root, 'user-cache') }, {
    open: async () => ({ status: 200, headers: { 'content-length': String(publication.release.archiveSizeBytes) }, body: createReadStream(publication.archivePath), close: async () => {} }),
    freeBytes: async () => 1024 ** 3,
  })
  try { const ready = await download.prepare(new AbortController().signal); expect(await readFile(join(ready.directory, 'worker.py'), 'utf8')).toBe('inert build resource') }
  finally { await download.dispose() }
})
it('changed assembly fails before writing publication output', async () => {
  const input = await fixture(); await writeFile(join(input.resourcesDirectory, 'extra.py'), 'unapproved')
  await expect(prepareSkillScannerPublication(input)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
  expect(await readdir(input.root)).not.toContain('publication')
})
it('a pre-existing output is never overwritten', async () => {
  const input = await fixture(); await mkdir(input.outputDirectory); await writeFile(join(input.outputDirectory, 'keep'), 'original')
  await expect(prepareSkillScannerPublication(input)).rejects.toThrow('SKILL_SAFETY_PUBLICATION_EXISTS')
  expect(await readFile(join(input.outputDirectory, 'keep'), 'utf8')).toBe('original')
})
