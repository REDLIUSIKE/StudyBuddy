import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { discoverResearchDshScopes, prepareResearchRuntime } from './prepare-research-runtime.mjs'

const state = vi.hoisted(() => ({ sources: new Map<string, string[]>(), nodeVersion: 'v24.21.0', afterCopy: undefined as undefined | (() => Promise<void>) }))
// Fixture repositories have no upstream object store or executable. All byte
// reads/copies stay real; only Git identity and Node version queries are replaced.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFileSync: vi.fn((executable: string, args: string[], options: object) => {
    if (executable === 'git') {
      if (args.includes('get-url')) return 'https://github.com/K-Dense-AI/k-dense-byok.git\n'
      if (args.includes('rev-parse')) return '1'.repeat(40) + '\n'
      if (args.includes('ls-files')) return (state.sources.get(args[1]!) ?? []).join('\0') + '\0'
      return ''
    }
    if (args[0] === '--version') return state.nodeVersion + '\n'
    return actual.execFileSync(executable, args, options)
  }) }
})
// One mutation after a real copy makes concurrent input changes repeatable.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, cp: async (...args: Parameters<typeof actual.cp>) => {
    await actual.cp(...args)
    const mutation = state.afterCopy
    state.afterCopy = undefined
    await mutation?.()
  } }
})
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type FileRow = { path: string; size: number; sha256: string }
type MutableProof = { files: Array<{ path: string }>; inputs: Array<{ path: string }>; sourceDigest: string }
type DebugProof = { debug?: { directory: string; files: FileRow[] } }
const sourceCommit = '1'.repeat(40), disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  state.nodeVersion = 'v24.21.0'; state.afterCopy = undefined
  for (const dispose of disposers.splice(0)) await dispose()
  state.sources.clear()
})
async function put(root: string, path: string, bytes: string) {
  await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes)
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-compiled-package-'))
  const source = join(root, 'source'), output = join(root, 'candidate'), primary = join(root, 'primary-runtime'), dsh = join(root, 'dsh')
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const sources: Record<string, string> = {
    LICENSE: 'K-Dense licence\n',
    'server/package.json': '{"name":"research-domain","version":"1.0.0","type":"module"}',
    'server/package-lock.json': '{"lockfileVersion":3,"name":"server"}',
    'server/src/research-domain.ts': 'export const domain = true\n',
    'server/scripts/build-embedded.mjs': '/* reviewed server build */\n',
    'web/package.json': '{"name":"research-static","version":"1.0.0"}',
    'web/package-lock.json': '{"lockfileVersion":3,"name":"web"}',
    'web/src/embedded-main.tsx': '/* original embedded workspace */\n',
    'web/embedded.html': '<div id="root"></div>',
    'web/vite.embedded.config.ts': '/* reviewed web build */\n',
  }
  for (const [path, bytes] of Object.entries(sources)) await put(source, path, bytes)
  state.sources.set(source, Object.keys(sources).sort())
  await put(source, 'server/node_modules/acorn/dist/acorn.js', 'exports.parse = value => value\n')
  await put(source, 'server/src/embedded-entry.ts', 'standalone source stays outside candidate\n')
  await put(source, 'web/node_modules/next/package.json', '{"name":"next"}')
  await put(primary, 'runtime.json', JSON.stringify({ node: '24.21.0', python: '3.12.14', payloadDigest: 'a'.repeat(64), platform: process.platform, arch: process.arch }))
  await put(primary, 'dependencies/node/bin/' + (process.platform === 'win32' ? 'node.exe' : 'node'), 'shared portable node bytes')
  await put(primary, 'dependencies/python/' + (process.platform === 'win32' ? 'python.exe' : 'bin/python3'), 'shared portable python bytes')
  await put(primary, 'dependencies/python/python312.dll', 'shared Python DLL bytes')
  await put(primary, 'dependencies/python/Lib/site-packages/example/__pycache__/module.cpython-312.pyc', 'existing Python cache bytes')
  for (const name of ['dsh', 'dsh-desktop-host']) await put(dsh, `node_modules/@deepseek-ai/${name}/package.json`, JSON.stringify({ name: `@deepseek-ai/${name}`, version: '0.0.0', files: ['lib'] }))
  await put(dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js', '/* reviewed public dsh launcher */')
  await put(dsh, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/research-plugin.js', 'import { Service } from "@deepseek-ai/cordis"; /* reviewed Host research plugin */')
  await put(dsh, 'node_modules/@deepseek-ai/cordis/package.json', '{"name":"@deepseek-ai/cordis","version":"4.0.5","type":"module","exports":"./lib/index.js","files":["lib"]}')
  await put(dsh, 'node_modules/@deepseek-ai/cordis/lib/index.js', 'export class Service {}')
  const outputs = {
    server: {
      'research-domain.mjs': 'export const createEmbeddedResearchDomain = async () => ({ close: async () => {} });\n',
      'helpers/runner.py': '# exact runtime helper\n',
      'subagents-resources/prompts/workflow.md': 'Locked workflow prompt\n',
      'node_modules/acorn/package.json': '{"name":"acorn","version":"8.15.0","main":"dist/acorn.js"}',
      'node_modules/acorn/dist/acorn.js': 'exports.parse = value => value\n',
      'node_modules/acorn/LICENSE': 'Acorn MIT licence\n',
      'licenses/dependencies.txt': 'Bundled runtime licences\n',
    } as Record<string, string>,
    web: {
      'index.html': '<html><title>StudyBuddy 研究工作台</title><script src="/assets/workspace.js"></script></html>',
      'assets/workspace.js': '/* compiled React 19 workspace */\n',
      'assets/geist.woff2': 'font bytes',
      'licenses/geist-OFL.txt': 'SIL Open Font License\n',
    } as Record<string, string>,
  }
  const debugOutputs = {
    server: { 'research-domain.mjs.map': JSON.stringify({ version: 3, sources: ['../src/research-domain.ts'], mappings: 'AAAA', sourcesContent: ['export const domain = true'] }) },
    web: { 'assets/workspace.js.map': JSON.stringify({ version: 3, sources: ['../../src/embedded-main.tsx'], mappings: 'AAAA', sourcesContent: ['/* workspace */'] }) },
  } as Record<'server' | 'web', Record<string, string>>
  const canonicalIdentity = async () => {
    const hash = createHash('sha256')
    for (const name of state.sources.get(source)!) hash.update(name).update('\0').update(await readFile(join(source, name))).update('\0')
    return { sourceCommit, sourceDigest: hash.digest('hex'), lockDigest: sha(Buffer.concat([await readFile(join(source, 'server/package-lock.json')), await readFile(join(source, 'web/package-lock.json'))])) }
  }
  const writeProof = async (profile: 'server' | 'web') => {
    const rows = Object.entries(outputs[profile])
      .map(([path, bytes]) => ({ path, size: Buffer.byteLength(bytes), sha256: sha(bytes) }))
      .sort((a, b) => a.path.localeCompare(b.path))
    for (const [path, bytes] of Object.entries(outputs[profile])) await put(source, `${profile}/dist-embedded/${path}`, bytes)
    const inputPaths = profile === 'server'
      ? ['server/package.json', 'server/package-lock.json', 'server/scripts/build-embedded.mjs', 'server/src/research-domain.ts', 'server/node_modules/acorn/dist/acorn.js']
      : ['../server/package.json', 'embedded.html', 'package.json', 'package-lock.json', 'src/embedded-main.tsx', 'vite.embedded.config.ts']
    const inputs = await Promise.all(inputPaths.map(async (path) => {
      const bytes = await readFile(join(profile === 'server' ? source : join(source, 'web'), path))
      return profile === 'server' ? { path, size: bytes.length, sha256: sha(bytes) } : { path, bytes: bytes.length, sha256: sha(bytes) }
    }))
    const proof = profile === 'server'
      ? { schemaVersion: 1, kind: 'studybuddy-research-server-build', inputBase: '.', sourceDigestKind: 'canonical-git', ...await canonicalIdentity(), buildSha256: sha(sources['server/scripts/build-embedded.mjs']!), inputs, files: rows, closure: { requiredFiles: ['helpers/runner.py', 'subagents-resources/prompts/workflow.md', 'node_modules/acorn/package.json', 'node_modules/acorn/dist/acorn.js', 'node_modules/acorn/LICENSE', 'licenses/dependencies.txt'] } }
      : { schemaVersion: 1, kind: 'studybuddy-research-web-build', inputBase: 'web', sourceDigestKind: 'inputs-json', profile: 'studybuddy', entry: 'index.html', nodeVersion: 'v24.21.0', sourceDigest: sha(JSON.stringify(inputs)), inputs, files: rows.map(row => ({ path: row.path, bytes: row.size, sha256: row.sha256 })) }
    const debugFiles = Object.entries(debugOutputs[profile])
      .map(([path, contents]) => ({ path, size: Buffer.byteLength(contents), sha256: sha(contents) }))
    for (const [path, contents] of Object.entries(debugOutputs[profile])) await put(source, `${profile}/dist-embedded.debug/${path}`, contents)
    await put(source, `${profile}/dist-embedded.build.json`, JSON.stringify({ ...proof, debug: { directory: 'dist-embedded.debug', files: debugFiles } }, null, 2) + '\n')
  }
  await writeProof('server'); await writeProof('web')
  return { root, source, output, primary, dsh, outputs, debugOutputs, writeProof, canonicalIdentity,
    prepare: (extra: { debugDirectory?: string } = {}) => prepareResearchRuntime({
      sourceDirectory: source, outputDirectory: output, primaryRuntimeDirectory: primary, dshDirectory: dsh, ...extra,
    }),
    manifest: async () => JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as { files: FileRow[] },
  }
}

it('materializes only reviewed compiled files and pins exact shared-runtime and build bytes', async () => {
  const f = await fixture(), pin = await f.prepare(), manifest = await f.manifest()
  expect(pin).toEqual({ ...await f.canonicalIdentity(), manifestSha256: sha(await readFile(join(f.output, 'manifest.json'))) })
  expect(manifest).toMatchObject({ schemaVersion: 2, kind: 'studybuddy-research-plugin', profile: 'studybuddy-research', entry: 'server/research-domain.mjs', staticEntry: 'web/index.html', platform: process.platform, arch: process.arch,
    sharedRuntime: { nodeVersion: '24.21.0', pythonVersion: '3.12.14', payloadDigest: 'a'.repeat(64), nodeSha256: sha('shared portable node bytes'), pythonSha256: sha('shared portable python bytes'), dshVersion: '0.0.0', dshEntrySha256: sha('/* reviewed public dsh launcher */'), hostPluginSha256: sha('import { Service } from "@deepseek-ai/cordis"; /* reviewed Host research plugin */') },
    build: { assemblerSha256: sha(await readFile(new URL('./prepare-research-runtime.mjs', import.meta.url))), serverBuildSha256: sha(await readFile(join(f.source, 'server/dist-embedded.build.json'))), webBuildSha256: sha(await readFile(join(f.source, 'web/dist-embedded.build.json'))) },
  })
  expect(manifest.files.map((row: { path: string }) => row.path).sort()).toEqual(['LICENSE', 'build/server.build.json', 'build/web.build.json', ...Object.keys(f.outputs.server).map(path => 'server/' + path), ...Object.keys(f.outputs.web).map(path => 'web/' + path)].sort())
  for (const row of manifest.files) {
    const bytes = await readFile(join(f.output, row.path))
    expect({ size: bytes.length, sha256: sha(bytes) }).toEqual({ size: row.size, sha256: row.sha256 })
  }
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_ALREADY_EXISTS')
})

it.each(['node_modules/next/package.json', 'node_modules/@next/swc-win32-x64-msvc/package.json', 'node_modules/tsx/package.json', 'node_modules/@earendil-works/pi-coding-agent/package.json', 'embedded.js', 'src/embedded-entry.ts', 'bin/node.exe', 'research-domain.mjs.map'])('rejects forbidden production resource %s even when its proof lists it', async (path) => {
  const f = await fixture(); f.outputs.server[path] = 'forbidden bytes'; await f.writeProof('server')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_FORBIDDEN_RESOURCE')
})
it('rejects a changed frontend output instead of assigning it a fresh manifest hash', async () => {
  const f = await fixture(); await put(f.source, 'web/dist-embedded/assets/workspace.js', 'stale output replaced')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_OUTPUT_MISMATCH')
})
it('rejects unlisted files in a compiled tree', async () => {
  const f = await fixture(); await put(f.source, 'server/dist-embedded/unreviewed.dat', 'not in build proof')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_OUTPUT_MISMATCH')
})
it('rejects missing Worker and helper resources declared by the build closure', async () => {
  const f = await fixture(); delete f.outputs.server['helpers/runner.py']; await rm(join(f.source, 'server/dist-embedded/helpers/runner.py')); await f.writeProof('server')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_CLOSURE_MISSING')
})
it.each(['../outside.bin', '/outside.bin', 'C:/outside.bin', 'nested\\outside.bin'])('rejects output proof path %s', async (path) => {
  const f = await fixture(), file = join(f.source, 'server/dist-embedded.build.json'), proof = JSON.parse(await readFile(file, 'utf8')) as MutableProof
  const first = proof.files[0]; if (first === undefined) throw new Error('fixture output is missing')
  first.path = path; await writeFile(file, JSON.stringify(proof))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects proof inputs outside the canonical source root', async () => {
  const f = await fixture(), file = join(f.source, 'web/dist-embedded.build.json'), proof = JSON.parse(await readFile(file, 'utf8')) as MutableProof
  const first = proof.inputs[0]; if (first === undefined) throw new Error('fixture input is missing')
  first.path = '../../outside.bin'; proof.sourceDigest = sha(JSON.stringify(proof.inputs)); await writeFile(file, JSON.stringify(proof))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects linked source paths without reading outside bytes', async () => {
  const f = await fixture(), directory = join(f.source, 'server/src'), outside = join(f.root, 'outside')
  await mkdir(outside); await put(outside, 'research-domain.ts', 'outside source'); await rm(directory, { recursive: true }); await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects linked compiled resource directories', async () => {
  const f = await fixture(), directory = join(f.source, 'web/dist-embedded/assets'), outside = join(f.root, 'outside')
  await mkdir(outside); await rm(directory, { recursive: true }); await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects secret source files before computing a distributable source identity', async () => {
  const f = await fixture(); state.sources.get(f.source)!.push('.env'); await put(f.source, '.env', 'SECRET=not-distributable')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_SOURCE_INVALID')
})
it.each(['server/src/research-domain.ts', 'server/package-lock.json'])('rejects a build made from older canonical source or lock bytes: %s', async (path) => {
  const f = await fixture(); await put(f.source, path, 'changed after reviewed build')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_INPUT_MISMATCH')
})
it('rejects a source edit made while materializing the candidate', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.source, 'server/src/research-domain.ts', 'concurrent source edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_INPUT_CHANGED')
})
it('rechecks dependency-file inputs outside the Git source identity', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.source, 'server/node_modules/acorn/dist/acorn.js', 'concurrent dependency edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_INPUT_CHANGED')
})
it('rejects changed proof bytes during candidate materialization', async () => {
  const f = await fixture(); state.afterCopy = async () => { const file = join(f.source, 'web/dist-embedded.build.json'); await writeFile(file, (await readFile(file, 'utf8')) + '\n') }
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_OUTPUT_CHANGED')
})
it('rejects a compiled output changed during materialization', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.source, 'web/dist-embedded/assets/workspace.js', 'concurrent compiled output edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_BUILD_OUTPUT_CHANGED')
})
it('requires the exact shared Node version from the executable', async () => {
  const f = await fixture(); state.nodeVersion = 'v24.19.0'
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it('rejects incompatible shared runtime metadata', async () => {
  const f = await fixture(); await put(f.primary, 'runtime.json', JSON.stringify({ node: '24.19.0', payloadDigest: 'a'.repeat(64), platform: process.platform, arch: process.arch }))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it('requires matching shared dsh and Host package versions', async () => {
  const f = await fixture(); await put(f.dsh, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json', '{"name":"@deepseek-ai/dsh-desktop-host","version":"0.0.1"}')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it('rejects shared Python bytes changed during materialization', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.primary, 'dependencies/python/' + (process.platform === 'win32' ? 'python.exe' : 'bin/python3'), 'concurrent Python edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it('requires the managed Python metadata version for Office and scientific helpers', async () => {
  const f = await fixture(); await put(f.primary, 'runtime.json', JSON.stringify({ node: '24.21.0', python: '3.12.13', payloadDigest: 'a'.repeat(64), platform: process.platform, arch: process.arch }))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it('rejects shared Host plugin bytes changed during materialization', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.dsh, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/research-plugin.js', 'concurrent plugin edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
})
it.each([
  ['primary', 'dependencies/python/python312.dll'],
  ['dsh', 'node_modules/@deepseek-ai/cordis/lib/index.js'],
] as const)('rejects changed transitive shared runtime bytes: %s/%s', async (kind, path) => {
  const f = await fixture(); state.afterCopy = () => put(f[kind], path, 'changed transitive runtime bytes')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
it('follows multiline compiled imports and freezes actual transitive package runtime roots', async () => {
  const f = await fixture()
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js', 'import {\n Service\n} from "@deepseek-ai/cordis";')
  const closure = await discoverResearchDshScopes(f.dsh)
  expect(closure.scopes.map(row => row.packageName)).toContain('@deepseek-ai/cordis')
  expect(closure.scopes.find(row => row.packageName === '@deepseek-ai/cordis')?.entries).toContain('lib')
})
it('selects only the requested sealed AIGC Host entry and rejects unknown profiles', async () => {
  const f = await fixture()
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/aigc-plugin.js', 'import { Service } from "@deepseek-ai/cordis";')
  const closure = await discoverResearchDshScopes(f.dsh, 'aigc')
  const scope = closure.scopes.find(row => row.packageName === '@deepseek-ai/dsh-desktop-host')!
  expect(scope.entries).toEqual(['lib/aigc-plugin.js', 'package.json'])
  expect(closure.inputs.some(row => row.path.endsWith('/lib/research-plugin.js'))).toBe(false)
  await expect(discoverResearchDshScopes(f.dsh, 'unknown' as never)).rejects.toThrow('SHARED_PROFILE_INVALID')
})
it('rejects an unreviewed computed shared import instead of producing a narrower identity', async () => {
  const f = await fixture()
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js', 'await import(process.env.UNREVIEWED_PLUGIN);')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_SHARED_DYNAMIC_IMPORT_UNREVIEWED')
})

const internalBridge = `function internalModules() {
  const require = createRequire(import.meta.url);
  const builtins = process.execArgv.includes('--expose-internals')
    ? { requireBuiltin: (moduleId) => require(moduleId) }
    : require('node-addon-require-builtin');
  const esm = builtins.requireBuiltin('internal/modules/esm/loader');
  builtins.requireBuiltin('internal/modules/cjs/loader');
  builtins.requireBuiltin('internal/modules/helpers');
  builtins.requireBuiltin('internal/modules/esm/utils');
  builtins.requireBuiltin('internal/modules/esm/resolve');
  return esm;
}`
async function bootBridgeFixture(code: string) {
  const f = await fixture()
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js', 'import "@deepseek-ai/dsh-app-boot";')
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh-app-boot/package.json', JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '1.0.6', type: 'module', files: ['lib'], exports: './lib/index.js' }))
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js', `import {createRequire} from 'node:module';\n${code}`)
  await put(f.dsh, 'node_modules/node-addon-require-builtin/package.json', JSON.stringify({ name: 'node-addon-require-builtin', version: '1.0.0', main: 'index.cjs' }))
  await put(f.dsh, 'node_modules/node-addon-require-builtin/index.cjs', 'exports.requireBuiltin = () => {};')
  return f
}
it('seals the exposed-internals bridge only when all five callers are fixed Node internal modules', async () => {
  const f = await bootBridgeFixture(internalBridge)
  const closure = await discoverResearchDshScopes(f.dsh)
  expect(closure.dynamicImports).toMatchObject([{ packageName: '@deepseek-ai/dsh-app-boot', expression: 'moduleId', mode: 'require' }])
  expect(closure.scopes.some(row => row.packageName === 'node-addon-require-builtin')).toBe(true)
})
it.each([
  internalBridge.replace('internal/modules/helpers', 'external-package'),
  internalBridge.replace("'internal/modules/helpers'", 'process.env.MODULE'),
  internalBridge.replace('return esm;', 'return builtins;'),
  internalBridge.replace('--expose-internals', '--different-flag'),
  internalBridge.replace('require(moduleId)', 'require(process.env.MODULE)'),
  internalBridge + '\nfunction other(moduleId) { require(moduleId); }',
])('rejects an expanded or escaping internal bridge without admitting arbitrary requires', async code => {
  const f = await bootBridgeFixture(code)
  await expect(discoverResearchDshScopes(f.dsh)).rejects.toThrow('RESEARCH_SHARED_DYNAMIC_IMPORT_UNREVIEWED')
})
it('excludes only the explicit public-bin commands unavailable in the Main-sealed research argv', async () => {
  const f = await fixture()
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/profile.js', 'import "@deepseek-ai/cordis";')
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js', [
    'switch(invocation.mode) {',
    'case "profile": await import("./profile.js"); break;',
    'case "plugin": await import("unavailable-package-manager"); break;',
    '}',
  ].join('\n'))
  const closure = await discoverResearchDshScopes(f.dsh)
  expect(closure.scopes.map(row => row.packageName)).toContain('@deepseek-ai/cordis')
  expect(closure.excludedCommands).toMatchObject([{ command: 'plugin', specifier: 'unavailable-package-manager' }])
  await put(f.dsh, 'node_modules/@deepseek-ai/dsh/lib/bin.js',
    'switch(other.mode) { case "plugin": await import("unavailable-package-manager"); }')
  await expect(discoverResearchDshScopes(f.dsh)).rejects.toThrow('RESEARCH_SHARED_CLOSURE_MISSING')
})
it('rejects an output directory contained in a compiled input tree', async () => {
  const f = await fixture()
  await expect(prepareResearchRuntime({ sourceDirectory: f.source, outputDirectory: join(f.source, 'server/dist-embedded/candidate'), primaryRuntimeDirectory: f.primary, dshDirectory: f.dsh })).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('preserves reviewed build proofs in a separate debug directory', async () => {
  const f = await fixture(), debug = join(f.root, 'debug'); await f.prepare({ debugDirectory: debug })
  expect(await readFile(join(debug, 'server.build.json'), 'utf8')).toBe(await readFile(join(f.source, 'server/dist-embedded.build.json'), 'utf8'))
  expect(await readFile(join(debug, 'web.build.json'), 'utf8')).toBe(await readFile(join(f.source, 'web/dist-embedded.build.json'), 'utf8'))
  for (const profile of ['server', 'web'] as const) for (const [path, bytes] of Object.entries(f.debugOutputs[profile])) {
    expect(await readFile(join(debug, profile, path), 'utf8')).toBe(bytes)
  }
  const record = JSON.parse(await readFile(join(debug, 'manifest.json'), 'utf8')) as { productionManifestSha256: string; files: FileRow[] }
  expect(record.productionManifestSha256).toBe(sha(await readFile(join(f.output, 'manifest.json'))))
  expect(record.files.map(row => row.path).sort()).toEqual(['server.build.json', 'server/research-domain.mjs.map', 'web.build.json', 'web/assets/workspace.js.map'])
})

it('requires debug proofs even when no debug archive directory was requested', async () => {
  const f = await fixture(), file = join(f.source, 'server/dist-embedded.build.json')
  const proof = JSON.parse(await readFile(file, 'utf8')) as DebugProof
  delete proof.debug; await writeFile(file, JSON.stringify(proof))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_PROOF_INVALID')
})
it.each(['server', 'web'] as const)('rejects tampered %s debug-map bytes', async (profile) => {
  const f = await fixture(), path = Object.keys(f.debugOutputs[profile])[0]!
  await put(f.source, `${profile}/dist-embedded.debug/${path}`, 'changed after reviewed build')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_OUTPUT_MISMATCH')
})
it('rejects a missing declared debug map', async () => {
  const f = await fixture(); await rm(join(f.source, 'server/dist-embedded.debug/research-domain.mjs.map'))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_OUTPUT_MISMATCH')
})
it('rejects unlisted files in the debug-map tree', async () => {
  const f = await fixture(); await put(f.source, 'web/dist-embedded.debug/unreviewed.txt', 'extra debug bytes')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_OUTPUT_MISMATCH')
})
it.each(['../outside', '/outside', 'C:/outside'])('rejects a debug directory override %s', async (directory) => {
  const f = await fixture(), file = join(f.source, 'server/dist-embedded.build.json')
  const proof = JSON.parse(await readFile(file, 'utf8')) as Required<DebugProof>
  proof.debug.directory = directory; await writeFile(file, JSON.stringify(proof))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects an outside path listed in a debug proof', async () => {
  const f = await fixture(), file = join(f.source, 'server/dist-embedded.build.json')
  const proof = JSON.parse(await readFile(file, 'utf8')) as Required<DebugProof>
  proof.debug.files[0]!.path = '../outside.map'; await writeFile(file, JSON.stringify(proof))
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rejects debug maps without a corresponding production chunk', async () => {
  const f = await fixture()
  f.debugOutputs.server['unrelated.js.map'] = JSON.stringify({ version: 3, sources: ['unrelated.ts'], mappings: 'AAAA' })
  await f.writeProof('server')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_PROOF_INVALID')
})
it.each([
  '{invalid json',
  '{"version":2,"sources":["source.ts"],"mappings":"AAAA"}',
  '{"version":3,"sources":[],"mappings":"AAAA"}',
  '{"version":3,"sources":["source.ts"],"mappings":false}',
])('rejects invalid source-map data %s even with an updated debug hash', async (contents) => {
  const f = await fixture(); f.debugOutputs.server['research-domain.mjs.map'] = contents; await f.writeProof('server')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_MAP_INVALID')
})
it('rejects linked debug directories', async () => {
  const f = await fixture(), directory = join(f.source, 'server/dist-embedded.debug'), outside = join(f.root, 'outside-debug')
  await mkdir(outside); await rm(directory, { recursive: true }); await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_RUNTIME_PATH_DENIED')
})
it('rechecks debug bytes after production materialization', async () => {
  const f = await fixture(); state.afterCopy = () => put(f.source, 'server/dist-embedded.debug/research-domain.mjs.map', 'concurrent map edit')
  await expect(f.prepare()).rejects.toThrow('RESEARCH_DEBUG_OUTPUT_CHANGED')
})
