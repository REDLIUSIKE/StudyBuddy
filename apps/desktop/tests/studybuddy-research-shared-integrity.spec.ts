import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createResearchSharedIntegrity, parseResearchSharedIntegrity, verifyResearchSharedIntegrity,
  type ResearchSharedDshScope,
} from '../src/studybuddy/research-shared-integrity.ts'

const mutation = vi.hoisted(() => ({
  path: '', run: undefined as undefined | (() => Promise<void>),
  heldPath: '', held: undefined as undefined | Promise<void>, heldStarted: false,
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: async (...args: Parameters<typeof actual.readFile>) => {
    const bytes = await actual.readFile(...args)
    if (args[0] === mutation.heldPath && mutation.held) { mutation.heldStarted = true; await mutation.held }
    if (args[0] === mutation.path && mutation.run) {
      const run = mutation.run; mutation.run = undefined; await run()
    }
    return bytes
  } }
})
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  mutation.path = ''; mutation.run = undefined
  mutation.heldPath = ''; mutation.held = undefined; mutation.heldStarted = false
  for (const dispose of disposers.splice(0)) await dispose()
})
async function put(root: string, path: string, bytes: string) {
  await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes)
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-shared-integrity-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const primaryRuntimeDirectory = join(root, 'primary'), dshDirectory = join(root, 'dsh')
  for (const [path, bytes] of Object.entries({
    'runtime.json': '{"node":"24.21.0"}', 'dependencies/node/bin/node.exe': 'Node executable',
    'dependencies/python/python.exe': 'Python executable', 'dependencies/python/python312.dll': 'Python DLL',
    'dependencies/python/Lib/os.py': 'Python standard library',
    'dependencies/python/Lib/site-packages/site.pth': 'import startup',
    'dependencies/python/Lib/__pycache__/os.cpython-312.pyc': 'Existing executable Python cache',
  })) await put(primaryRuntimeDirectory, path, bytes)
  const scope = { packageName: '@deepseek-ai/cordis', path: 'node_modules/@deepseek-ai/cordis', entries: ['package.json', 'lib'] }
  await put(dshDirectory, scope.path + '/package.json', '{"name":"@deepseek-ai/cordis","type":"module"}')
  await put(dshDirectory, scope.path + '/lib/index.js', 'export class Service {}')
  await put(dshDirectory, scope.path + '/lib/data.json', '{"runtime":"data"}')
  const roots = { primaryRuntimeDirectory, dshDirectory }
  const options = { dshScopes: [scope], generatorSha256: sha('generator fixture') }
  return { root, roots, options, scope, create: () => createResearchSharedIntegrity(roots, options) }
}

it('binds every primary file including DLL, stdlib, site metadata and existing executable Python cache', async () => {
  const f = await fixture(), identity = await f.create()
  expect(identity.primary.files).toHaveLength(7)
  expect(identity.primary.files.some(row => row.path.endsWith('.pyc'))).toBe(true)
  expect(identity.primary.filesSha256).toBe(sha(JSON.stringify(identity.primary.files)))
  expect(identity.dsh.filesSha256).toBe(sha(JSON.stringify(identity.dsh.files)))
  expect(JSON.stringify(identity)).not.toContain(f.root)
  await verifyResearchSharedIntegrity(identity, f.roots)
})
it.each([
  ['primaryRuntimeDirectory', 'dependencies/python/python312.dll'],
  ['primaryRuntimeDirectory', 'dependencies/python/Lib/__pycache__/os.cpython-312.pyc'],
  ['dshDirectory', 'node_modules/@deepseek-ai/cordis/lib/index.js'],
  ['dshDirectory', 'node_modules/@deepseek-ai/cordis/lib/data.json'],
] as const)('rejects changed runtime bytes %s/%s', async (kind, path) => {
  const f = await fixture(), identity = await f.create()
  await put(f.roots[kind], path, 'tampered bytes')
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
it.each(['primaryRuntimeDirectory', 'dshDirectory'] as const)('rejects missing or extra files in %s', async (kind) => {
  const f = await fixture(), identity = await f.create()
  const path = kind === 'dshDirectory' ? f.scope.path + '/lib/new.js' : 'dependencies/python/Lib/new.pyc'
  await put(f.roots[kind], path, 'extra executable bytes')
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
  await rm(join(f.roots[kind], path))
  await rm(join(f.roots[kind], kind === 'dshDirectory' ? f.scope.path + '/lib/index.js' : 'runtime.json'))
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
it('relocates unchanged bytes while rejecting changed production package metadata', async () => {
  const f = await fixture(), identity = await f.create(), relocated = join(f.root, 'relocated')
  await cp(f.roots.dshDirectory, relocated, { recursive: true })
  const roots = { ...f.roots, dshDirectory: relocated }
  await verifyResearchSharedIntegrity(identity, roots)
  await put(relocated, f.scope.path + '/package.json', '{"name":"@deepseek-ai/cordis","version":"1.0.0"}')
  await expect(verifyResearchSharedIntegrity(identity, roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
it('permits only an explicitly selected development package junction inside the canonical workspace', async () => {
  const f = await fixture(), identity = await f.create(), physical = join(f.root, 'canonical', 'cordis')
  const alias = join(f.roots.dshDirectory, f.scope.path)
  await mkdir(dirname(physical), { recursive: true }); await cp(alias, physical, { recursive: true }); await rm(alias, { recursive: true })
  await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_PATH_DENIED')
  await verifyResearchSharedIntegrity(identity, f.roots, { workspaceDirectory: join(f.root, 'canonical') })
  await expect(verifyResearchSharedIntegrity(identity, f.roots, { workspaceDirectory: f.roots.primaryRuntimeDirectory }))
    .rejects.toThrow('RESEARCH_SHARED_INTEGRITY_PATH_DENIED')
})
it('rejects linked directories inside an admitted package even in development mode', async () => {
  const f = await fixture(), identity = await f.create(), alias = join(f.roots.dshDirectory, f.scope.path, 'lib')
  const physical = join(f.root, 'outside-lib')
  await cp(alias, physical, { recursive: true }); await rm(alias, { recursive: true })
  await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(verifyResearchSharedIntegrity(identity, f.roots, { workspaceDirectory: f.root }))
    .rejects.toThrow('RESEARCH_SHARED_INTEGRITY_PATH_DENIED')
})
it('permits nested dependency junctions only through package roots explicitly admitted by the same identity', async () => {
  const f = await fixture(), alias = join(f.roots.dshDirectory, f.scope.path), physical = join(f.root, 'canonical', 'cordis')
  await mkdir(dirname(physical), { recursive: true }); await cp(alias, physical, { recursive: true }); await rm(alias, { recursive: true })
  await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const nested = { packageName: 'nested', path: f.scope.path + '/node_modules/nested', entries: ['package.json', 'index.js'] }
  await put(physical, 'node_modules/nested/package.json', '{"name":"nested"}')
  await put(physical, 'node_modules/nested/index.js', 'export const nested = true')
  const options = { ...f.options, dshScopes: [f.scope, nested], workspaceDirectory: join(f.root, 'canonical') }
  const identity = await createResearchSharedIntegrity(f.roots, options)
  await verifyResearchSharedIntegrity(identity, f.roots, { workspaceDirectory: options.workspaceDirectory })
})
it('rejects input changes while generating rather than freezing a mixed file snapshot', async () => {
  const f = await fixture()
  mutation.path = join(f.roots.primaryRuntimeDirectory, 'dependencies/python/python312.dll')
  mutation.run = () => put(f.roots.primaryRuntimeDirectory, 'dependencies/python/python312.dll', 'concurrent changed DLL')
  await expect(f.create()).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_INPUT_CHANGED')
})
it('rejects a newly added executable during hashing', async () => {
  const f = await fixture()
  mutation.path = join(f.roots.primaryRuntimeDirectory, 'dependencies/python/python312.dll')
  mutation.run = () => put(f.roots.primaryRuntimeDirectory, 'dependencies/python/new.pyc', 'concurrent new cache')
  await expect(f.create()).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_INPUT_CHANGED')
})
it('waits for already-started file reads to finish before reporting another worker failure', async () => {
  const f = await fixture()
  let release!: () => void, outcome = 'pending'
  mutation.heldPath = join(f.roots.primaryRuntimeDirectory, 'dependencies/node/bin/node.exe')
  mutation.held = new Promise<void>((resolve) => { release = resolve })
  mutation.path = join(f.roots.primaryRuntimeDirectory, 'dependencies/python/python312.dll')
  mutation.run = () => put(f.roots.primaryRuntimeDirectory, 'dependencies/python/python312.dll', 'concurrent DLL mutation')
  const pending = f.create().then(() => { outcome = 'resolved' }, (error: unknown) => {
    outcome = error instanceof Error ? error.message : String(error)
  })
  try {
    await vi.waitFor(() => { expect(mutation.heldStarted).toBe(true); expect(mutation.run).toBeUndefined() })
    expect(outcome).toBe('pending')
  } finally { release(); await pending }
  expect(outcome).toBe('RESEARCH_SHARED_INTEGRITY_INPUT_CHANGED')
})
it.each(['../escape', 'C:/escape', '/escape', 'nested\\escape', 'NUL.js', 'lib/../escape'])('rejects manifest path %s', async (path) => {
  const f = await fixture(), identity = await f.create()
  identity.primary.files[0]!.path = path
  expect(() => parseResearchSharedIntegrity(identity)).toThrow('RESEARCH_SHARED_INTEGRITY_INVALID')
})
it('rejects duplicate paths, unscoped files, mismatched inventory digests and unbound generator hashes', async () => {
  const f = await fixture(), identity = await f.create()
  const variants = [
    { ...identity, generatorSha256: '' },
    { ...identity, primary: { ...identity.primary, filesSha256: 'a'.repeat(64) } },
    { ...identity, primary: { ...identity.primary, files: [...identity.primary.files, identity.primary.files[0]] } },
    { ...identity, dsh: { ...identity.dsh, scopes: [{ ...f.scope, entries: ['package.json'] }] } },
    { ...identity, dsh: { ...identity.dsh, scopes: [{ ...f.scope, path: 'node_modules/other' }] } },
  ]
  for (const variant of variants) expect(() => parseResearchSharedIntegrity(variant)).toThrow('RESEARCH_SHARED_INTEGRITY_INVALID')
})
it('does not scan unrelated profile packages outside the sealed research scopes', async () => {
  const f = await fixture(), identity = await f.create()
  await put(f.roots.dshDirectory, 'node_modules/unrelated-ui/large.js', 'other profile')
  await verifyResearchSharedIntegrity(identity, f.roots)
  const invalid: ResearchSharedDshScope[] = [{ ...f.scope, entries: ['package.json', 'lib', 'lib/index.js'] }]
  await expect(createResearchSharedIntegrity(f.roots, { ...f.options, dshScopes: invalid }))
    .rejects.toThrow('RESEARCH_SHARED_INTEGRITY_INVALID')
})
it('keeps an admitted empty production directory under inventory checks after declaration stripping', async () => {
  const f = await fixture(), directory = join(f.roots.dshDirectory, f.scope.path, 'typings')
  await mkdir(directory)
  const identity = await createResearchSharedIntegrity(f.roots, {
    ...f.options, dshScopes: [{ ...f.scope, entries: [...f.scope.entries, 'typings'] }],
  })
  await verifyResearchSharedIntegrity(identity, f.roots)
  await put(directory, 'extra.js', 'new executable bytes')
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
  await rm(directory, { recursive: true })
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
it('rejects a new nearer package that would shadow a frozen transitive import', async () => {
  const f = await fixture()
  const consumer = { packageName: 'host', path: 'node_modules/host', entries: ['package.json', 'lib'] }
  await put(f.roots.dshDirectory, consumer.path + '/package.json', '{"name":"host","type":"module"}')
  await put(f.roots.dshDirectory, consumer.path + '/lib/index.js', 'import "@deepseek-ai/cordis";')
  const options = {
    ...f.options, dshScopes: [f.scope, consumer],
    dshResolutions: [{ from: consumer.path + '/lib/index.js', packageName: f.scope.packageName, to: f.scope.path }],
  }
  const identity = await createResearchSharedIntegrity(f.roots, options)
  await put(f.roots.dshDirectory, consumer.path + '/node_modules/@deepseek-ai/cordis/package.json',
    '{"name":"@deepseek-ai/cordis","main":"index.js"}')
  await put(f.roots.dshDirectory, consumer.path + '/node_modules/@deepseek-ai/cordis/index.js', 'throw Error("shadowed")')
  await expect(verifyResearchSharedIntegrity(identity, f.roots)).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
})
