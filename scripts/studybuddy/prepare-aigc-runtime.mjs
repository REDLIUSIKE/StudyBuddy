/** Copy explicitly built Toonflow resources with their exact source and byte identities. */
import { createHash } from 'node:crypto'
import { cp, mkdir, lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function regularPath(path) {
  let current = resolve(path)
  for (;;) {
    const info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (info?.isSymbolicLink()) throw new Error('AIGC_RUNTIME_PATH_DENIED')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}
async function files(root, prefix = '') {
  const rows = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isSymbolicLink()) throw new Error('AIGC_RUNTIME_PATH_DENIED')
    if (entry.isDirectory()) rows.push(...await files(root, name + '/'))
    else if (entry.isFile()) {
      const bytes = await readFile(join(root, name))
      rows.push({ path: name, size: bytes.length, sha256: sha(bytes) })
    } else throw new Error('AIGC_RUNTIME_PATH_DENIED')
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}
/** Prepare already-built resources. Installation and compilation remain explicit caller actions.
 * @param {{sourceDirectory:string,outputDirectory:string,bunExecutable:string}} input - Canonical inputs.
 * @returns {Promise<void>} Completion after the new resource manifest is written. */
export async function prepareAigcRuntime({ sourceDirectory, outputDirectory, bunExecutable }) {
  await regularPath(sourceDirectory); await regularPath(outputDirectory); await regularPath(bunExecutable)
  if (await lstat(outputDirectory).catch(error => { if (error.code === 'ENOENT') return null; throw error })) {
    throw new Error('AIGC_RUNTIME_ALREADY_EXISTS')
  }
  const git = args => execFileSync('git', ['-C', sourceDirectory, ...args], { encoding: 'utf8', windowsHide: true }).trim()
  if (git(['remote', 'get-url', 'origin']) !== 'https://github.com/HBAI-Ltd/Toonflow-app.git') throw new Error('AIGC_RUNTIME_SOURCE_INVALID')
  const upstream = { repository: git(['remote', 'get-url', 'origin']), commit: '2c7fb257affb65777110fe4c6e60cd3c09187d9b' }
  git(['merge-base', '--is-ancestor', upstream.commit, 'HEAD'])
  const bunVersion = execFileSync(bunExecutable, ['--version'], { encoding: 'utf8', windowsHide: true }).trim()
  if (bunVersion !== '1.3.14') throw new Error('AIGC_RUNTIME_VERSION_INVALID')
  const sourceHash = createHash('sha256')
  const sourceNames = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort()
  for (const name of sourceNames) {
    await regularPath(join(sourceDirectory, name))
    sourceHash.update(name.split(sep).join('/')).update('\0').update(await readFile(join(sourceDirectory, name))).update('\0')
  }
  const sourceDigest = sourceHash.digest('hex')
  const lockDigest = sha(await readFile(join(sourceDirectory, 'bun.lock')))
  const stamp = JSON.parse(await readFile(join(sourceDirectory, 'build/studyBuddyBuild.json'), 'utf8').catch(() => { throw new Error('AIGC_BUILD_STAMP_REQUIRED') }))
  if (stamp.schemaVersion !== 1 || stamp.sourceDigest !== sourceDigest || stamp.lockDigest !== lockDigest || stamp.bunVersion !== bunVersion
    || stamp.bunSha256 !== sha(await readFile(bunExecutable)) || stamp.platform !== process.platform || stamp.arch !== process.arch) {
    throw new Error('AIGC_BUILD_INPUT_MISMATCH')
  }
  const builtFiles = (await files(join(sourceDirectory, 'build'))).filter(row => row.path !== 'studyBuddyBuild.json')
  if (JSON.stringify(builtFiles) !== JSON.stringify(stamp.files)) throw new Error('AIGC_BUILD_OUTPUT_MISMATCH')
  await cp(join(sourceDirectory, 'build'), outputDirectory, { recursive: true, errorOnExist: true, force: false })
  await mkdir(join(outputDirectory, 'bin'), { recursive: true })
  await cp(bunExecutable, join(outputDirectory, 'bin/bun.exe'))
  const rows = await files(outputDirectory)
  for (const name of ['server/studyBuddy.js', 'web/index.html', 'bin/ffmpeg.exe', 'bin/ffprobe.exe']) {
    if (!rows.some(row => row.path === name)) throw new Error('AIGC_RUNTIME_RESOURCE_MISSING')
  }
  const manifest = { schemaVersion: 1, platform: process.platform, arch: process.arch, upstream,
    sourceCommit: git(['rev-parse', 'HEAD']), sourceDigest,
    lockDigest, bunVersion, entry: 'server/studyBuddy.js', files: rows }
  await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [sourceDirectory, outputDirectory, bunExecutable] = process.argv.slice(2)
  if (!sourceDirectory || !outputDirectory || !bunExecutable) throw new Error('AIGC_RUNTIME_INPUT_MISSING')
  await prepareAigcRuntime({ sourceDirectory, outputDirectory, bunExecutable })
}
