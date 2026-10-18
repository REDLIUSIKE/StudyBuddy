import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import * as identity from '../src/studybuddy/research-resource-identity.ts'
import { createResearchSharedIntegrity } from '../src/studybuddy/research-shared-integrity.ts'

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
it('admits the exact shared Node, dsh and Host plugin and refuses a changed executable', async () => {
  const verify = Reflect.get(identity, 'verifyResearchSharedRuntime') as ((expected: object, roots: object) => Promise<{ node: string; python: string; entry: string; plugin: string }>) | undefined
  expect(verify).toBeTypeOf('function')
  const root = await mkdtemp(join(tmpdir(), 'research-shared-')), primaryRuntimeDirectory = join(root, 'primary-runtime'), dshDirectory = join(root, 'dsh')
  const node = join(primaryRuntimeDirectory, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
  const python = join(primaryRuntimeDirectory, 'dependencies/python', ...(process.platform === 'win32' ? ['python.exe'] : ['bin/python3']))
  const entry = join(dshDirectory, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), plugin = join(dshDirectory, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/research-plugin.js')
  const dll = join(primaryRuntimeDirectory, 'dependencies/python/python312.dll')
  const cordis = join(dshDirectory, 'node_modules/@deepseek-ai/cordis/lib/index.js')
  const expected = { nodeVersion: '24.21.0', pythonVersion: '3.12.14', pythonSha256: sha('shared python'), payloadDigest: 'a'.repeat(64), nodeSha256: sha('shared node'), dshVersion: '1.0.1', dshEntrySha256: sha('shared dsh'), hostPluginSha256: sha('host plugin') }
  try {
    for (const [path, bytes] of [[node, 'shared node'], [python, 'shared python'], [entry, 'shared dsh'], [plugin, 'host plugin'], [dll, 'shared DLL'], [cordis, 'shared Cordis'],
      [join(dirname(dirname(cordis)), 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', version: '4.0.5-alpha.1' })],
      [join(dirname(dirname(entry)), 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.0.1' })],
      [join(dirname(dirname(plugin)), 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-desktop-host', version: '1.0.1' })],
      [join(primaryRuntimeDirectory, 'runtime.json'), JSON.stringify({ node: '24.21.0', python: '3.12.14', payloadDigest: 'a'.repeat(64), platform: process.platform, arch: process.arch })]]) {
      await mkdir(dirname(path!), { recursive: true }); await writeFile(path!, bytes!)
    }
    const admitted = { ...expected, integrity: await createResearchSharedIntegrity({ primaryRuntimeDirectory, dshDirectory }, {
      generatorSha256: 'e'.repeat(64), dshScopes: ['dsh', 'dsh-desktop-host', 'cordis'].map(name => ({
        packageName: '@deepseek-ai/' + name, path: 'node_modules/@deepseek-ai/' + name, entries: ['package.json', 'lib'],
      })),
    }) }
    expect(await verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).toEqual({ node, python, entry, plugin })
    for (const [path, original] of [[dll, 'shared DLL'], [cordis, 'shared Cordis']] as const) {
      await writeFile(path, 'changed transitive bytes')
      await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
      await writeFile(path, original)
    }
    const extra = join(dirname(cordis), 'injected.js')
    await writeFile(extra, 'extra executable')
    await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_SHARED_INTEGRITY_MISMATCH')
    await rm(extra)
    await writeFile(python, 'wrong python')
    await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
    await writeFile(python, 'shared python')
    await writeFile(node, 'wrong executable')
    await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
    await writeFile(node, 'shared node')
    const manifestPath = join(primaryRuntimeDirectory, 'runtime.json'), metadata = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, string>
    await writeFile(manifestPath, JSON.stringify({ ...metadata, node: '24.19.0' }))
    await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_SHARED_RUNTIME_MISMATCH')
    await writeFile(manifestPath, JSON.stringify(metadata))
    const pythonDirectory = dirname(python), outside = join(root, 'relocated-python')
    await rename(pythonDirectory, outside)
    await symlink(outside, pythonDirectory, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(verify!(admitted, { primaryRuntimeDirectory, dshDirectory })).rejects.toThrow('RESEARCH_PATH_DENIED')
  } finally { await rm(root, { recursive: true, force: true }) }
})
