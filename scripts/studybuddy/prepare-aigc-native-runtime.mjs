/** Assemble the Node domain without copying a second interpreter or the old agent application. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AIGC_MEDIA_BYTES, verifyAigcNativeFiles } from '../../apps/desktop/src/studybuddy/aigc-native-resources.ts'
import { createResearchSharedIntegrity, verifyResearchSharedIntegrity } from '../../apps/desktop/src/studybuddy/research-shared-integrity.ts'
import { discoverResearchDshScopes } from './prepare-research-runtime.mjs'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const repository = 'https://github.com/HBAI-Ltd/Toonflow-app.git'
const upstreamCommit = '2c7fb257affb65777110fe4c6e60cd3c09187d9b'
const baselineManifests = [
  ['studybuddy-aigc', 'c52b7de055a9f98fb91402a2733e586400728ae578664632b7c72517ed57e72f'],
  ['studybuddy-aigc.before-model-config-20261012T060450Z', '15cff6473e32a031b8d0e0c25e25e9585aa4f4f91f05b01e2efde524416b4279'],
  ['studybuddy-aigc.native-before-cleanup-20261015', 'f7dd416fceed84a674c659c43540a203323f7cadd35f81cb8fdfbf5e5388f497'],
  ['studybuddy-aigc.native-before-capability-20261017', '70d5d31ed133f8cbd3e9f40e0bc75157e917ce81ef78377f3fedf6fb0f9b6e01'],
]
async function regular(path) {
  for (let current = resolve(path);;) {
    const info = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (info?.isSymbolicLink()) throw Error('AIGC_RUNTIME_PATH_DENIED')
    const parent = dirname(current); if (parent === current) return; current = parent
  }
}
function portable(path) {
  if (typeof path !== 'string' || path.includes('\\') || path.includes(':') || /[\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) throw Error('AIGC_RUNTIME_PATH_DENIED')
  return path
}
async function inventory(root, prefix = '') {
  const rows = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = portable(prefix + entry.name)
    if (entry.isDirectory()) rows.push(...await inventory(root, path + '/'))
    else if (entry.isFile()) { const bytes = await readFile(join(root, path)); rows.push({ path, size: bytes.length, sha256: sha(bytes) }) }
    else throw Error('AIGC_RUNTIME_PATH_DENIED')
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}
async function sourceIdentity(sourceDirectory) {
  const git = args => execFileSync('git', ['-C', sourceDirectory, ...args], { encoding: 'utf8', windowsHide: true }).trim()
  if (git(['remote', 'get-url', 'origin']) !== repository) throw Error('AIGC_RUNTIME_SOURCE_INVALID')
  git(['merge-base', '--is-ancestor', upstreamCommit, 'HEAD'])
  const names = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort(), hash = createHash('sha256')
  if (new Set(names).size !== names.length) throw Error('AIGC_RUNTIME_SOURCE_INVALID')
  for (const name of names) {
    portable(name); const path = join(sourceDirectory, name)
    const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info) continue
    if (!info.isFile()) throw Error('AIGC_RUNTIME_PATH_DENIED')
    await regular(path); hash.update(name.split(sep).join('/')).update('\0').update(await readFile(path)).update('\0')
  }
  return { sourceCommit: git(['rev-parse', 'HEAD']), sourceDigest: hash.digest('hex'), lockDigest: sha(await readFile(join(sourceDirectory, 'bun.lock'))) }
}
/** The raw build remains available for recovery; only this closed runtime selection is shipped. */
export function selectAigcNativeFiles(rows, packages) {
  if (!Array.isArray(packages) || !packages.length || packages.some(name => !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name))) throw Error('AIGC_BUILD_CLOSURE_INVALID')
  const selected = rows.filter(row => {
    const path = portable(row.path)
    if (/\.map$|\.d\.(?:ts|mts|cts)$|(?:^|\/)(?:src|test|tests|__tests__|examples|\.git)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/i.test(path)) return false
    if (['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json'].includes(path)) return true
    if (/^(?:web|nodes|tools|ext|skills|notices)\//.test(path)) return !/\.exe$/i.test(path)
    return packages.some(name => path.startsWith('node_modules/' + name + '/'))
  })
  for (const path of ['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json', 'web/index.html',
    'notices/ffmpegLicense.txt', 'notices/ffmpegReadme.txt',
    ...packages.map(name => 'node_modules/' + name + '/package.json')]) if (!selected.some(row => row.path === path)) throw Error('AIGC_BUILD_CLOSURE_MISSING')
  return selected
}
async function sharedIdentity(primaryRuntimeDirectory, dshDirectory) {
  const runtime = JSON.parse(await readFile(join(primaryRuntimeDirectory, 'runtime.json'), 'utf8'))
  if (runtime.node !== '24.21.0' || runtime.platform !== process.platform || runtime.arch !== process.arch || !/^[a-f0-9]{64}$/.test(runtime.payloadDigest)) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  const node = join(primaryRuntimeDirectory, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
  if (execFileSync(node, ['--version'], { encoding: 'utf8', windowsHide: true }).trim() !== 'v24.21.0') throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  const metadata = await Promise.all(['dsh', 'dsh-desktop-host'].map(async name => JSON.parse(await readFile(join(dshDirectory, 'node_modules/@deepseek-ai', name, 'package.json'), 'utf8'))))
  if (metadata[0].version !== metadata[1].version) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  return { nodeVersion: '24.21.0', payloadDigest: runtime.payloadDigest, nodeSha256: sha(await readFile(node)), dshVersion: metadata[0].version,
    dshEntrySha256: sha(await readFile(join(dshDirectory, 'node_modules/@deepseek-ai/dsh/lib/bin.js'))),
    hostPluginSha256: sha(await readFile(join(dshDirectory, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/aigc-plugin.js'))) }
}
async function bundledMigration(baselineDirectory, selected) {
  const baselines = []
  for (const [name, expected] of baselineManifests) {
    const directory = join(baselineDirectory, name), bytes = await readFile(join(directory, 'manifest.json'))
    if (sha(bytes) !== expected) throw Error('AIGC_MIGRATION_BASELINE_CHANGED')
    const manifest = JSON.parse(bytes.toString('utf8')), rows = []
    for (const file of manifest.files.filter(row => /^(?:nodes\/[^/]+\.umd\.js|tools\/[^/]+\.tool\.js)$/.test(row.path))) {
      portable(file.path); await regular(join(directory, file.path)); const content = await readFile(join(directory, file.path))
      if (content.length !== file.size || sha(content) !== file.sha256) throw Error('AIGC_MIGRATION_BASELINE_CHANGED')
      rows.push(file)
    }
    if (!rows.length) throw Error('AIGC_MIGRATION_BASELINE_CHANGED')
    baselines.push({ manifestSha256: expected, files: rows })
  }
  const files = selected.filter(row => /^(?:nodes\/[^/]+\.umd\.js|tools\/[^/]+\.tool\.js)$/.test(row.path)).map(row => ({ ...row,
    acceptedSha256: [...new Set(baselines.flatMap(baseline => baseline.files.filter(file => file.path === row.path).map(file => file.sha256)))] }))
  if (!files.length || files.some(row => !row.acceptedSha256.length)) throw Error('AIGC_MIGRATION_BASELINE_MISSING')
  return { schemaVersion: 1, candidate: sha(JSON.stringify(files)), baselines: baselines.map(({ manifestSha256 }) => manifestSha256), files }
}
export async function prepareAigcNativeRuntime({ sourceDirectory, outputDirectory, bunExecutable, primaryRuntimeDirectory, dshDirectory, baselineDirectory, workspaceDirectory }) {
  if (![sourceDirectory, outputDirectory, bunExecutable, primaryRuntimeDirectory, dshDirectory, baselineDirectory].every(value => typeof value === 'string' && isAbsolute(value))) throw Error('AIGC_RUNTIME_INPUT_MISSING')
  for (const path of [sourceDirectory, outputDirectory, bunExecutable, primaryRuntimeDirectory, baselineDirectory]) await regular(path)
  for (const input of [sourceDirectory, primaryRuntimeDirectory, dshDirectory, ...baselineManifests.map(([name]) => join(baselineDirectory, name))]) { const offset = relative(input, outputDirectory); if (!offset || !isAbsolute(offset) && offset !== '..' && !offset.startsWith('..' + sep)) throw Error('AIGC_RUNTIME_PATH_DENIED') }
  if (await lstat(outputDirectory).catch(error => { if (error.code !== 'ENOENT') throw error })) throw Error('AIGC_RUNTIME_ALREADY_EXISTS')
  const self = fileURLToPath(import.meta.url), assemblerSha256 = sha(await readFile(self)), identity = await sourceIdentity(sourceDirectory)
  const stampBytes = await readFile(join(sourceDirectory, 'build/studyBuddyBuild.json')), stamp = JSON.parse(stampBytes.toString('utf8'))
  if (stamp.schemaVersion !== 1 || ['sourceDigest', 'lockDigest'].some(key => stamp[key] !== identity[key]) || stamp.bunVersion !== '1.3.14' || stamp.bunSha256 !== sha(await readFile(bunExecutable)) || stamp.platform !== process.platform || stamp.arch !== process.arch) throw Error('AIGC_BUILD_INPUT_MISMATCH')
  const built = (await inventory(join(sourceDirectory, 'build'))).filter(row => row.path !== 'studyBuddyBuild.json')
  if (!same(built, stamp.files)) throw Error('AIGC_BUILD_OUTPUT_MISMATCH')
  const closureBytes = await readFile(join(sourceDirectory, 'build/server/domainClosure.json')), closure = JSON.parse(closureBytes.toString('utf8'))
  if (closure.schemaVersion !== 1 || closure.domainSha256 !== built.find(row => row.path === 'server/domain.js')?.sha256 || closure.workerSha256 !== built.find(row => row.path === 'server/image-resize-worker.js')?.sha256) throw Error('AIGC_BUILD_CLOSURE_INVALID')
  const selected = selectAigcNativeFiles(built, closure.nativePackages), migration = await bundledMigration(baselineDirectory, selected)
  const shared = await sharedIdentity(primaryRuntimeDirectory, dshDirectory), dshClosure = await discoverResearchDshScopes(dshDirectory, 'aigc')
  const integrity = await createResearchSharedIntegrity({ primaryRuntimeDirectory, dshDirectory }, {
    dshScopes: dshClosure.scopes, dshResolutions: dshClosure.resolutions, workspaceDirectory,
    generatorSha256: sha(await readFile(fileURLToPath(new URL('../../apps/desktop/src/studybuddy/research-shared-integrity.ts', import.meta.url)))) })
  const sharedRows = new Map(integrity.dsh.files.map(row => [row.path, row]))
  for (const input of dshClosure.inputs) if (!same(input, sharedRows.get(input.path))) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  await mkdir(outputDirectory, { recursive: false })
  for (const row of selected) { await mkdir(dirname(join(outputDirectory, row.path)), { recursive: true }); await cp(join(sourceDirectory, 'build', row.path), join(outputDirectory, row.path), { errorOnExist: true, force: false }) }
  await mkdir(join(outputDirectory, 'bin'))
  for (const media of AIGC_MEDIA_BYTES) {
    const path = join(baselineDirectory, 'studybuddy-aigc', media.path); await regular(path); const bytes = await readFile(path)
    if (bytes.length !== media.size || sha(bytes) !== media.sha256) throw Error('AIGC_MEDIA_BYTES_CHANGED')
    await writeFile(join(outputDirectory, media.path), bytes, { flag: 'wx' })
  }
  await mkdir(join(outputDirectory, 'build'))
  await writeFile(join(outputDirectory, 'build/studyBuddyBuild.json'), stampBytes, { flag: 'wx' })
  await writeFile(join(outputDirectory, 'build/bundledMigration.json'), JSON.stringify(migration, null, 2) + '\n', { flag: 'wx' })
  if (!same(await sourceIdentity(sourceDirectory), identity) || sha(await readFile(self)) !== assemblerSha256 || !same(await sharedIdentity(primaryRuntimeDirectory, dshDirectory), shared)) throw Error('AIGC_BUILD_INPUT_CHANGED')
  if (!same((await inventory(join(sourceDirectory, 'build'))).filter(row => row.path !== 'studyBuddyBuild.json'), built)) throw Error('AIGC_BUILD_OUTPUT_MISMATCH')
  await verifyResearchSharedIntegrity(integrity, { primaryRuntimeDirectory, dshDirectory }, { workspaceDirectory })
  const manifest = { schemaVersion: 2, kind: 'studybuddy-aigc-plugin', profile: 'studybuddy-aigc', platform: process.platform, arch: process.arch, entry: 'server/domain.js', staticEntry: 'web/index.html',
    upstream: { repository, commit: upstreamCommit }, ...identity, sharedRuntime: { ...shared, integrity },
    build: { assemblerSha256, sourceBuildSha256: sha(stampBytes), domainClosureSha256: sha(closureBytes) }, files: await inventory(outputDirectory) }
  const encoded = JSON.stringify(manifest, null, 2) + '\n', pin = { manifestSha256: sha(encoded), ...identity }
  await writeFile(join(outputDirectory, 'manifest.json'), encoded, { flag: 'wx' }); await verifyAigcNativeFiles(outputDirectory, pin)
  return { ...pin, files: manifest.files.length, bytes: manifest.files.reduce((sum, row) => sum + row.size, 0) }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [sourceDirectory, outputDirectory, bunExecutable, primaryRuntimeDirectory, dshDirectory, baselineDirectory, workspaceDirectory] = process.argv.slice(2)
  process.stdout.write(JSON.stringify(await prepareAigcNativeRuntime({ sourceDirectory, outputDirectory, bunExecutable, primaryRuntimeDirectory, dshDirectory, baselineDirectory, workspaceDirectory })) + '\n')
}
