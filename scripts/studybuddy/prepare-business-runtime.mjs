/** Prepare checked StudyBuddy inputs; this script never publishes or signs them. */
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile, lstat, rename, mkdtemp, rm, realpath } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const portable = (path) => path.split(sep).join('/')
const digestPattern = /^[a-f0-9]{64}$/
const headPattern = /^[a-f0-9]{40}$/
const sourceTrees = ['packages/contracts/src', 'apps/desktop/src', 'apps/desktop/src-tauri/src']
const sourceInputs = [
  'packages/contracts/package.json',
  'packages/contracts/tsconfig.json',
  'packages/contracts/tsconfig.build.json',
  'apps/desktop/package.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'apps/desktop/src-tauri/Cargo.lock',
  'apps/desktop/src-tauri/build.rs',
  'apps/desktop/src-tauri/build_identity_config.rs',
  'apps/desktop/src-tauri/build_support.rs',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/vite.harness-tools.config.ts',
  'apps/desktop/harness-tools.html',
  'apps/desktop/harness-labs.html',
  'apps/desktop/tsconfig.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'tsconfig.base.json',
  'rust-toolchain.toml',
  '.cargo/config.toml',
  'apps/desktop/src-tauri/.cargo/config.toml',
  'scripts/windows/production-install-catalog-binding.mjs',
]
const optionalTrees = ['apps/desktop/public', 'apps/desktop/src-tauri/vendor/echobird-tool-runtime/tools']
const localDependencyRoot = 'apps/desktop/src-tauri/vendor'
const generatedDependencyDirectories = new Set(['target', 'node_modules', '.git', '__pycache__'])

async function safePath(path) {
  let current = resolve(path)
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error('RUNTIME_LINK_DENIED')
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return path
}
function checkedPath(directory, name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\\') ||
    name.includes(':') ||
    isAbsolute(name) ||
    name.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('RUNTIME_PATH_DENIED')
  }
  const path = resolve(directory, name)
  if (relative(resolve(directory), path).startsWith('..')) throw new Error('RUNTIME_PATH_DENIED')
  return path
}
async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
async function files(directory, excludedDirectories = new Set()) {
  await safePath(directory)
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('RUNTIME_LINK_DENIED')
    if (entry.isDirectory()) result.push(...(await files(path, excludedDirectories)))
    else if (entry.isFile()) result.push(path)
    else throw new Error('RUNTIME_FILE_INVALID')
  }
  return result.sort()
}
async function hashes(base, paths) {
  const entries = []
  for (const path of paths.sort()) {
    await safePath(path)
    const name = portable(relative(base, path))
    checkedPath(base, name)
    entries.push([name, sha(await readFile(path))])
  }
  return Object.fromEntries(entries)
}
/** Record original service, configuration, frontend and recipe inputs.
 * @param {string} source Absolute checked StudyBuddy checkout.
 * @returns {Promise<Record<string,string>>} Relative source paths and SHA-256.
 */
export async function collectSourceFiles(source) {
  if (!isAbsolute(source)) throw new Error('RUNTIME_SOURCE_INVALID')
  await safePath(source)
  const entries = []
  for (const tree of sourceTrees) entries.push(...(await files(join(source, tree))))
  for (const tree of optionalTrees)
    if (await exists(join(source, tree))) entries.push(...(await files(join(source, tree))))
  if (await exists(join(source, localDependencyRoot)))
    entries.push(...(await files(join(source, localDependencyRoot), generatedDependencyDirectories)))
  for (const name of sourceInputs) if (await exists(join(source, name))) entries.push(join(source, name))
  return hashes(source, [...new Set(entries)])
}
function moduleIdentity(files) {
  return 'sha256:' + sha(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))
}
/** Record complete runtime bytes and the source identity that produced them.
 * @param {object} options Checked source, companion, contracts, recipes and tool module directories.
 * @returns {Promise<object>} Versioned runtime manifest; no credentials.
 */
export async function createRuntimeManifest({ source, sourceHead, companion, contracts, recipes, module, resources, buildIdentity }) {
  if (!headPattern.test(sourceHead) || !source || !recipes || !module) throw new Error('RUNTIME_SOURCE_REQUIRED')
  const base = dirname(companion)
  const sourceFiles = await collectSourceFiles(source)
  const moduleFiles = await hashes(module, await files(module))
  if (!Object.hasOwn(moduleFiles, 'index.html')) throw new Error('RUNTIME_MODULE_INVALID')
  const entries = [companion, ...(await files(contracts)), ...(await files(recipes)), ...(await files(module))]
  if (resources) entries.push(...(await files(resources)))
  const manifest = {
    schemaVersion: 2,
    protocolVersion: 2,
    sourceHead,
    ...(buildIdentity ? { buildIdentity } : {}),
    sourceFiles,
    companion: basename(companion),
    files: await hashes(base, entries),
    module: { moduleId: moduleIdentity(moduleFiles), entry: 'index.html', files: moduleFiles },
  }
  await verifyRuntimeManifest(manifest, base)
  return manifest
}
/** Reject modified bytes, linked paths, incomplete modules and mismatched build inputs.
 * @param {object} manifest Parsed runtime manifest.
 * @param {string} directory Checked runtime directory.
 * @param {{source?:string,sourceHead?:string}} expected Optional current source identity, required for reuse.
 * @returns {Promise<void>} Resolves only after every listed byte has been checked.
 */
export async function verifyRuntimeManifest(manifest, directory, expected = {}) {
  if (manifest.buildIdentity !== undefined) {
    const value = manifest.buildIdentity
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'buildId,kind,sourceGitSha' ||
        value.kind !== 'development' || typeof value.buildId !== 'string' || !/^[a-f0-9]{32}$/.test(value.buildId) ||
        value.sourceGitSha !== manifest.sourceHead) throw new Error('RUNTIME_BUILD_IDENTITY_INVALID')
  }
  if (
    manifest.schemaVersion !== 2 ||
    manifest.protocolVersion !== 2 ||
    !headPattern.test(manifest.sourceHead) ||
    !manifest.files ||
    !manifest.sourceFiles ||
    !manifest.module ||
    manifest.module.entry !== 'index.html' ||
    !Object.hasOwn(manifest.files, manifest.companion) ||
    !Object.hasOwn(manifest.module.files, 'index.html') ||
    manifest.module.moduleId !== moduleIdentity(manifest.module.files)
  )
    throw new Error('RUNTIME_MANIFEST_INVALID')
  for (const name of Object.keys(manifest.files)) checkedPath(directory, name)
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!digestPattern.test(digest)) throw new Error('RUNTIME_MANIFEST_INVALID')
    const path = checkedPath(directory, name)
    await safePath(path)
    if (sha(await readFile(path)) !== digest) throw new Error('RUNTIME_HASH_MISMATCH')
  }
  for (const [name, digest] of Object.entries(manifest.module.files)) {
    checkedPath(directory, name)
    if (manifest.files['module/' + name] !== digest) throw new Error('RUNTIME_MODULE_INVALID')
  }
  for (const [name, digest] of Object.entries(manifest.sourceFiles)) {
    checkedPath(directory, name)
    if (!digestPattern.test(digest)) throw new Error('RUNTIME_MANIFEST_INVALID')
  }
  if (expected.source) {
    const current = await collectSourceFiles(expected.source)
    if (
      expected.sourceHead !== manifest.sourceHead ||
      JSON.stringify(current) !== JSON.stringify(manifest.sourceFiles)
    ) {
      throw new Error('RUNTIME_SOURCE_MISMATCH')
    }
  }
}
function run(executable, args, cwd, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, windowsHide: true, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error('RUNTIME_BUILD_FAILED')
}

/** Require the native executable's own assembly check before publishing staged bytes.
 * @param {{status:number|null,signal:string|null,stdout:Buffer,error?:Error}} result Captured child result.
 * @returns {void} Returns only for a successful verified runtime response.
 */
export function assertNativeAssemblyProbe(result) {
  if (result.status !== 0 || result.signal !== null || result.error !== undefined ||
    !Buffer.isBuffer(result.stdout) || result.stdout.toString('utf8').trim() !== 'STUDYBUDDY_NATIVE_RUNTIME_VERIFIED_V2') {
    throw new Error('RUNTIME_ASSEMBLY_INVALID')
  }
}

function verifyNativeAssembly(directory, companion) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/KEY|SECRET|TOKEN|PASSWORD/u.test(key) && key !== 'STUDYBUDDY_API_BASE_URL'))
  assertNativeAssemblyProbe(spawnSync(join(directory, companion), ['--verify-runtime'], {
    cwd: directory, env, windowsHide: true, input: Buffer.alloc(0), timeout: 15_000, maxBuffer: 1024 * 1024,
  }))
}
/** Bind the already published public catalog identity; no signing material is admitted.
 * @param {{schemaVersion:number,keyId:string,publicKeySpkiBase64:string}} value Reviewed native-source public pin.
 * @param {Record<string,string|undefined>} environment Inherited build variables checked for conflicts.
 * @returns {{STUDYBUDDY_INSTALL_CATALOG_KEY_ID:string,STUDYBUDDY_INSTALL_CATALOG_PUBLIC_KEY_BASE64:string}} Native-only public build values.
 */
export function compileCatalogTrust(value, environment = process.env) {
  const keyId = 'studybuddy-install-catalog-ed25519-2026-10-local'
  const publicKey = 'MCowBQYDK2VwAyEA25rqZrPHg4RFgKE9AJw4gO4euFBVM0CoCeHtWzjuyhw='
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'keyId,publicKeySpkiBase64,schemaVersion' ||
      value.schemaVersion !== 1 || value.keyId !== keyId || value.publicKeySpkiBase64 !== publicKey)
    throw new Error('RUNTIME_CATALOG_TRUST_INVALID')
  const values = { STUDYBUDDY_INSTALL_CATALOG_KEY_ID: keyId,
    STUDYBUDDY_INSTALL_CATALOG_PUBLIC_KEY_BASE64: Buffer.from(publicKey, 'base64').subarray(12).toString('base64') }
  for (const [name, expected] of Object.entries(values))
    if (environment[name] !== undefined && environment[name] !== expected)
      throw new Error('RUNTIME_CATALOG_TRUST_INVALID')
  return values
}
/** Verify the signed installation input with the existing production verifier.
 * Public trust alone cannot initialize the installer; no private key is read here. */
export async function compileNativeInstallCatalog(source, environment = process.env) {
  const native=join(source,'apps/desktop/src-tauri')
  const trust=JSON.parse(await readFile(join(native,'src/labs/install-catalog-public-trust.json'),'utf8'))
  const publicTrust=compileCatalogTrust(trust,environment)
  const envelopePath=join(native,'src/environment/production-install-catalog-envelope.json')
  await safePath(envelopePath)
  const envelope=await readFile(envelopePath)
  let version
  try{const signed=JSON.parse(envelope);version=JSON.parse(Buffer.from(signed.payload,'base64')).catalogVersion}
  catch{throw new Error('RUNTIME_INSTALL_CATALOG_REQUIRED')}
  const validatorPath=join(source,'scripts/windows/production-install-catalog-binding.mjs')
  await safePath(validatorPath)
  const {resolveProductionCatalogBinding}=await import(pathToFileURL(validatorPath).href)
  const verified=await resolveProductionCatalogBinding({envelopeBase64:envelope.toString('base64'),sha256:sha(envelope),
    version,keyId:trust.keyId,publicKeySpkiBase64:trust.publicKeySpkiBase64})
  const values={...publicTrust,STUDYBUDDY_INSTALL_CATALOG_EMBEDDED:'1',STUDYBUDDY_INSTALL_CATALOG_VERSION:verified.STUDYBUDDY_INSTALL_CATALOG_VERSION}
  for(const [name,value]of Object.entries(values))if(environment[name]!==undefined&&environment[name]!==value)throw new Error('RUNTIME_CATALOG_TRUST_INVALID')
  return values
}
/** Give this checked development build a diagnostic identity without production privileges.
 * @param {string} head Exact current business checkout HEAD.
 * @param {Record<string,string|undefined>} environment Inherited identity fields must not override the build.
 * @returns {{STUDYBUDDY_BUILD_CLASS:string,STUDYBUDDY_BUILD_ID:string,STUDYBUDDY_SOURCE_GIT_SHA:string}} Native-only build values.
 */
export function compileDevelopmentBuild(head, environment = process.env) {
  if (!headPattern.test(head) || environment.STUDYBUDDY_BUILD_ID !== undefined ||
      environment.STUDYBUDDY_SOURCE_GIT_SHA !== undefined ||
      (environment.STUDYBUDDY_BUILD_CLASS !== undefined && environment.STUDYBUDDY_BUILD_CLASS !== 'development'))
    throw new Error('RUNTIME_BUILD_IDENTITY_INVALID')
  return { STUDYBUDDY_BUILD_CLASS: 'development', STUDYBUDDY_BUILD_ID: randomUUID().replaceAll('-', ''),
    STUDYBUDDY_SOURCE_GIT_SHA: head }
}
/** Resolve only Cargo's generated target cache before an owned build. Packaged inputs never use this exception. */
export async function canonicalCargoTarget(source) {
  await safePath(source)
  const target = join(source, 'apps/desktop/src-tauri/target')
  if (!(await exists(target))) await mkdir(target, { recursive: true })
  const canonical = await realpath(target)
  await safePath(canonical)
  if (!(await lstat(canonical)).isDirectory()) throw new Error('RUNTIME_FILE_INVALID')
  return canonical
}
async function sourceHead(source) {
  if (typeof source !== 'string' || !isAbsolute(source)) throw new Error('RUNTIME_SOURCE_REQUIRED')
  await safePath(source)
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, windowsHide: true, encoding: 'utf8' })
  const head = result.stdout?.trim()
  if (result.error || result.status !== 0 || !headPattern.test(head)) throw new Error('RUNTIME_SOURCE_INVALID')
  return head
}
/** Read current TypeScript output without modifying source or trusting stale dist files. */
async function verifyContractOutput(source) {
  const directory = join(source, 'packages/contracts')
  const require = createRequire(join(directory, 'package.json'))
  const compiler = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc')
  const validation = await mkdtemp(join(directory, 'dist-check-'))
  try {
    run(process.execPath, [compiler, '-p', join(directory, 'tsconfig.build.json'), '--outDir', validation], directory)
    const emitted = await hashes(validation, await files(validation))
    const actual = await hashes(join(directory, 'dist'), await files(join(directory, 'dist')))
    if (JSON.stringify(actual) !== JSON.stringify(emitted)) throw new Error('RUNTIME_CONTRACT_BUILD_STALE')
  } finally {
    // The owned compiler output is a sibling of dist, so relative source maps are identical.
    if (dirname(validation) !== directory || !basename(validation).startsWith('dist-check-')) {
      throw new Error('RUNTIME_PATH_DENIED')
    }
    await safePath(validation)
    await rm(validation, { recursive: true })
  }
}
/** Build the private installed manifest without publishing source, maps or local synchronization records.
 * @param {{name:string,version:string,exports:Record<string,unknown>,dependencies:Record<string,string>}} original Checked source package metadata.
 * @returns {object} Private package with compiled runtime/declaration file selection.
 */
export function studyBuddyContractsPackage(original) {
  return {
    name: original.name,
    version: original.version,
    private: true,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: { '.': original.exports['.'] },
    dependencies: original.dependencies,
    files: ['dist/**/*.js', 'dist/**/*.d.ts'],
  }
}
/** Synchronize checked contracts only, without copying a companion or modifying runtime readiness.
 * @param {string} source Absolute current StudyBuddy checkout with built contracts.
 * @returns {Promise<{input:string,sourceHead:string}>} Generated vendor directory and source HEAD.
 */
export async function syncStudyBuddyContracts(source) {
  const head = await sourceHead(source)
  const sourceFiles = await collectSourceFiles(source)
  await verifyContractOutput(source)
  const contracts = join(source, 'packages/contracts')
  const input = join(root, 'vendor/studybuddy-contracts')
  const staging = join(root, '.dsh-build/contracts-sync-' + randomUUID())
  await mkdir(staging, { recursive: true })
  await cp(join(contracts, 'dist'), join(staging, 'dist'), { recursive: true })
  await cp(join(contracts, 'src'), join(staging, 'src'), { recursive: true })
  const original = JSON.parse(await readFile(join(contracts, 'package.json'), 'utf8'))
  const pkg = studyBuddyContractsPackage(original)
  await writeFile(join(staging, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  const generatedFiles = await hashes(staging, await files(staging))
  if (
    head !== (await sourceHead(source)) ||
    JSON.stringify(sourceFiles) !== JSON.stringify(await collectSourceFiles(source))
  ) {
    throw new Error('RUNTIME_SOURCE_MISMATCH')
  }
  await writeFile(
    join(staging, 'source-manifest.json'),
    JSON.stringify({ schemaVersion: 2, protocolVersion: 2, sourceHead: head, sourceFiles, generatedFiles }, null, 2) +
      '\n',
  )
  await mkdir(dirname(input), { recursive: true })
  if (await exists(input)) {
    await safePath(input)
    const history = join(root, '.dsh-build/contracts-sync-history', randomUUID())
    await mkdir(dirname(history), { recursive: true })
    await rename(input, history)
    try {
      await rename(staging, input)
    } catch (error) {
      await rename(history, input)
      throw error
    }
  } else await rename(staging, input)
  return { input, sourceHead: head }
}
/** Assemble current native/module/recipe inputs. Reuse requires the exact original source identity.
 * @param {{source:string,buildNative?:boolean}} options Explicit checkout and native build selection.
 * @returns {Promise<{runtime:string,input:string,sourceHead:string}>} Checked local assembly.
 */
export async function prepareBusinessRuntime({ source, buildNative = true } = {}) {
  const head = await sourceHead(source)
  const before = await collectSourceFiles(source)
  const oldRuntime = join(root, '.dsh-build/studybuddy-business')
  if (!buildNative) {
    const manifest = JSON.parse(await readFile(join(oldRuntime, 'manifest.json'), 'utf8'))
    await verifyRuntimeManifest(manifest, oldRuntime, { source, sourceHead: head })
    const synced = await syncStudyBuddyContracts(source)
    return { ...synced, runtime: oldRuntime }
  }
  const native = join(source, 'apps/desktop/src-tauri')
  const build = compileDevelopmentBuild(head)
  const nativeEnvironment = { ...process.env, ...await compileNativeInstallCatalog(source), ...build }
  const target = await canonicalCargoTarget(source)
  const require = createRequire(join(source, 'apps/desktop/package.json'))
  run(
    process.execPath,
    [
      join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
      'build',
      '--config',
      'vite.harness-tools.config.ts',
    ],
    join(source, 'apps/desktop'),
  )
  run(
    'cargo',
    [
      'build',
      '--manifest-path',
      join(native, 'Cargo.toml'),
      '--features',
      'harness-native-cli',
      '--target-dir',
      target,
      '--bin',
      'studybuddy-harness-native',
    ],
    source,
    nativeEnvironment,
  )
  if (
    head !== (await sourceHead(source)) ||
    JSON.stringify(before) !== JSON.stringify(await collectSourceFiles(source))
  )
    throw new Error('RUNTIME_SOURCE_MISMATCH')
  const executable = process.platform === 'win32' ? 'studybuddy-harness-native.exe' : 'studybuddy-harness-native'
  const staging = join(root, '.dsh-build/runtime-stage-' + randomUUID())
  await mkdir(staging, { recursive: true })
  await safePath(join(target, 'debug', executable))
  await cp(join(target, 'debug', executable), join(staging, executable))
  await cp(join(source, 'packages/contracts/dist'), join(staging, 'contracts'), { recursive: true })
  await cp(join(source, 'apps/desktop/dist/harness-tools'), join(staging, 'module'), { recursive: true })
  await mkdir(join(staging, 'recipes'))
  await cp(
    join(native, 'src/environment/priority-install-recipes.json'),
    join(staging, 'recipes/priority-install-recipes.json'),
  )
  await cp(join(native, 'vendor/echobird-tool-runtime/tools'), join(staging, 'resources/tools'), { recursive: true })
  const manifest = await createRuntimeManifest({
    source,
    sourceHead: head,
    buildIdentity: { kind: 'development', buildId: build.STUDYBUDDY_BUILD_ID, sourceGitSha: head },
    companion: join(staging, executable),
    contracts: join(staging, 'contracts'),
    recipes: join(staging, 'recipes'),
    module: join(staging, 'module'),
    resources: join(staging, 'resources'),
  })
  await verifyRuntimeManifest(manifest, staging, { source, sourceHead: await sourceHead(source) })
  await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  verifyNativeAssembly(staging, executable)
  const synced = await syncStudyBuddyContracts(source)
  if (await exists(oldRuntime)) {
    await safePath(oldRuntime)
    const previous = join(root, '.dsh-build/runtime-history', randomUUID())
    await mkdir(dirname(previous), { recursive: true })
    await rename(oldRuntime, previous)
    try {
      await rename(staging, oldRuntime)
    } catch (error) {
      await rename(previous, oldRuntime)
      throw error
    }
  } else await rename(staging, oldRuntime)
  return { ...synced, runtime: oldRuntime }
}
/** Parse fixed development arguments; an explicit invalid source never falls back.
 * @param {string[]} args Command-line arguments without executable/script names.
 * @returns {{source:string,buildNative:boolean,contractsOnly:boolean}} Checked options.
 */
export function parseRuntimeArgs(args) {
  let source,
    buildNative = true,
    contractsOnly = false
  const seen = new Set()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (seen.has(arg)) throw new Error('RUNTIME_ARGUMENT_INVALID')
    seen.add(arg)
    if (arg === '--source') {
      source = args[++index]
      if (!source || source.startsWith('--')) throw new Error('RUNTIME_SOURCE_REQUIRED')
      if (!isAbsolute(source)) throw new Error('RUNTIME_SOURCE_INVALID')
    } else if (arg === '--reuse-native') buildNative = false
    else if (arg === '--contracts-only') contractsOnly = true
    else throw new Error('RUNTIME_ARGUMENT_INVALID')
  }
  if (!source) throw new Error('RUNTIME_SOURCE_REQUIRED')
  if (contractsOnly && !buildNative) throw new Error('RUNTIME_ARGUMENT_INVALID')
  return { source, buildNative, contractsOnly }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseRuntimeArgs(process.argv.slice(2))
  const prepared = options.contractsOnly
    ? await syncStudyBuddyContracts(options.source)
    : await prepareBusinessRuntime(options)
  console.log(JSON.stringify(prepared))
}
