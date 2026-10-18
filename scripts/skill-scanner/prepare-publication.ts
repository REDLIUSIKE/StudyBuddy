/** Build-only publication of a verified source-exact optional scanner, never a client installer. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { Zip, ZipDeflate } from 'fflate'
import { parseSkillScannerRelease, type SkillScannerRelease } from '../../apps/desktop/src/studybuddy/skill-safety-release.ts'
import { verifySkillScannerDirectoryPath, verifySkillScannerResources } from '../../apps/desktop/src/studybuddy/skill-safety-resources.ts'
/** Exact generated local and fixed server artifact identities. */
export interface SkillScannerPublication {
  readonly release: SkillScannerRelease
  readonly archivePath: string
  readonly bridgePath: string
  readonly receiptPath: string
  readonly serverDirectory: string
}
/** Render the existing fixed public URL against the shared download bucket. */
export function skillScannerNginxBridge(value: SkillScannerRelease): string {
  const release = parseSkillScannerRelease(value), leaf = new URL(release.archiveUrl).pathname
  return `# Skill scanner ${release.scannerVersion}: verified object in the existing download bucket.\nlocation = ${leaf} {\n    proxy_pass http://127.0.0.1:19200${leaf};\n    proxy_set_header Host $host;\n    proxy_cache off;\n    proxy_hide_header Cache-Control;\n    autoindex off;\n    default_type application/zip;\n    add_header X-Content-Type-Options "nosniff" always;\n    add_header Cache-Control "public, max-age=31536000, immutable" always;\n    limit_except GET { deny all; }\n}\n`
}
/**
 * Generate one fixed server artifact from an independently verified scanner assembly.
 * @param input - Build-owned absolute resources, interpreter and absent output directory.
 * @returns Actual archive and descriptor identities; never a model-controlled download authority.
 */
export async function prepareSkillScannerPublication(input: { resourcesDirectory: string; runtimeDirectory: string; outputDirectory: string }): Promise<SkillScannerPublication> {
  if (![input.resourcesDirectory, input.runtimeDirectory, input.outputDirectory].every(isAbsolute)) throw Error('SKILL_SAFETY_PUBLICATION_INVALID')
  const resources = resolve(input.resourcesDirectory), runtime = resolve(input.runtimeDirectory), output = resolve(input.outputDirectory)
  for (const root of [resources, runtime]) {
    const path = relative(root, output)
    if (path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep))) throw Error('SKILL_SAFETY_PUBLICATION_INVALID')
  }
  const manifestBytes = await readFile(join(resources, 'scanner-manifest.json'))
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex')
  const manifest = await verifySkillScannerResources(resources, runtime, manifestSha256)
  await verifySkillScannerDirectoryPath(output, true)
  await mkdir(join(output, '..'), { recursive: true })
  try { await mkdir(output) }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw Error('SKILL_SAFETY_PUBLICATION_EXISTS', { cause: error }); throw error }
  const temporaryArchive = join(output, 'archive.tmp.zip'), writer = await open(temporaryArchive, 'wx', 0o600)
  const chunks: Uint8Array[] = [], hash = createHash('sha256'); let archiveSizeBytes = 0, finalized = false
  const zip = new Zip((error, data, final) => { if (error) throw error; chunks.push(data); if (final) finalized = true })
  const flush = async () => {
    for (const bytes of chunks.splice(0)) {
      let offset = 0
      while (offset < bytes.length) { const written = await writer.write(bytes, offset); if (written.bytesWritten === 0) throw Error('SKILL_SAFETY_PUBLICATION_WRITE_FAILED'); offset += written.bytesWritten }
      hash.update(bytes); archiveSizeBytes += bytes.length
    }
  }
  const names = [...manifest.files.map(file => file.path), 'scanner-manifest.json'].sort()
  try {
    for (const name of names) {
      const file = new ZipDeflate(name, { level: 6 })
      file.os = 3; file.attrs = 0o100600 << 16; file.mtime = new Date(2000, 0, 1, 0, 0, 0)
      zip.add(file)
      // Bound memory/backpressure per chunk; neither interpreter nor a dependency resolver enters the ZIP.
      for await (const chunk of createReadStream(join(resources, name), { highWaterMark: 64 * 1024 })) { file.push(chunk); await flush() }
      file.push(new Uint8Array(), true); await flush()
    }
    zip.end(); await flush()
    if (!finalized) throw Error('SKILL_SAFETY_PUBLICATION_WRITE_FAILED')
  } finally { zip.terminate(); await writer.close() }
  await verifySkillScannerResources(resources, runtime, manifestSha256)
  const archiveSha256 = hash.digest('hex'), archivePath = join(output, archiveSha256 + '.zip')
  await rename(temporaryArchive, archivePath)
  const serverDirectory = '/www/wwwroot/studybuddy-public-uat-downloads/labs/skill-scanner/win32-x64'
  const leaf = '/studybuddy-releases/labs/skill-scanner/win32-x64/' + archiveSha256 + '.zip'
  const release = parseSkillScannerRelease({ schemaVersion: 1, target: 'win32-x64', pythonVersion: manifest.pythonVersion, scannerVersion: manifest.upstream.version,
    archiveUrl: 'https://guijitongzhuo.com' + leaf, archiveSha256, archiveSizeBytes, manifestSha256,
    extractedSizeBytes: manifestBytes.length + manifest.files.reduce((total, file) => total + file.size, 0), fileCount: names.length })
  const bridgePath = join(output, 'nginx-exact-leaf.conf'), receiptPath = join(output, 'publication.json')
  await writeFile(join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n', { flag: 'wx' })
  await writeFile(bridgePath, skillScannerNginxBridge(release), { flag: 'wx' })
  const publication = { release, archivePath, bridgePath, receiptPath, serverDirectory }
  await writeFile(receiptPath, JSON.stringify({ schemaVersion: 1, checkedAt: '2026-10-13', ...publication, resourcesDirectory: resources, runtimeDirectory: runtime }, null, 2) + '\n', { flag: 'wx' })
  return publication
}
if (import.meta.main) {
  const { values } = parseArgs({ options: { resources: { type: 'string' }, runtime: { type: 'string' }, output: { type: 'string' } } })
  if (!values.resources || !values.runtime) throw Error('Pass --resources and --runtime; --output selects a new owned publication directory')
  console.log(JSON.stringify(await prepareSkillScannerPublication({ resourcesDirectory: resolve(values.resources), runtimeDirectory: resolve(values.runtime),
    outputDirectory: resolve(values.output ?? join(import.meta.dirname, '../../apps/desktop/.desktop-build/targets/win-x64/skill-scanner-publication')) })))
}
