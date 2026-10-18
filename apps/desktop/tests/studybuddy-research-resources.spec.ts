import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { verifyResearchRuntime } from '../src/studybuddy/research-resources.ts'
import type { ResearchResourcePin, ResearchRuntimeManifest } from '../src/studybuddy/research-types.ts'

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
async function fixture(run: (root: string, pin: ResearchResourcePin) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'research-resources-'))
  const files = []
  for (const name of ['server/research-domain.mjs', 'web/index.html', 'licenses/K-Dense-LICENSE']) {
    const content = name
    await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), content)
    files.push({ path: name, size: Buffer.byteLength(content), sha256: digest(content) })
  }
  const primaryFiles = [{ path: 'runtime.json', size: 1, sha256: '1'.repeat(64) }]
  const dshFiles = [{ path: 'node_modules/@deepseek-ai/dsh/package.json', size: 1, sha256: '2'.repeat(64) }]
  const integrity = { schemaVersion: 1 as const, generatorSha256: 'e'.repeat(64),
    primary: { files: primaryFiles, filesSha256: digest(JSON.stringify(primaryFiles)) },
    dsh: { files: dshFiles, filesSha256: digest(JSON.stringify(dshFiles)), scopes: [{ packageName: '@deepseek-ai/dsh', path: 'node_modules/@deepseek-ai/dsh', entries: ['package.json'] }], resolutions: [] } }
  const manifest: ResearchRuntimeManifest = { schemaVersion: 2, kind: 'studybuddy-research-plugin', profile: 'studybuddy-research', platform: process.platform, arch: process.arch,
    upstream: { repository: 'https://github.com/K-Dense-AI/k-dense-byok.git', commit: '44c52cee8e9fdc343c6132909769f49accf14a82' },
    sourceCommit: '1'.repeat(40), sourceDigest: '2'.repeat(64), lockDigest: '3'.repeat(64), entry: 'server/research-domain.mjs', staticEntry: 'web/index.html',
    sharedRuntime: { nodeVersion: '24.21.0', pythonVersion: '3.12.14', pythonSha256: 'b'.repeat(64), payloadDigest: '4'.repeat(64), nodeSha256: '5'.repeat(64), dshVersion: '1.0.1', dshEntrySha256: '6'.repeat(64), hostPluginSha256: '7'.repeat(64), integrity },
    build: { assemblerSha256: '8'.repeat(64), serverBuildSha256: '9'.repeat(64), webBuildSha256: 'a'.repeat(64) }, files }
  const encoded = JSON.stringify(manifest); await writeFile(join(root, 'manifest.json'), encoded)
  const pin = { manifestSha256: digest(encoded), sourceCommit: manifest.sourceCommit,
    sourceDigest: manifest.sourceDigest, lockDigest: manifest.lockDigest }
  try { await run(root, pin) }
  finally { await rm(root, { recursive: true, force: true }) }
}
it('admits only the selected source and complete candidate byte inventory', async () => {
  await fixture(async (root, pin) => {
    expect((await verifyResearchRuntime(root, pin)).entry).toBe('server/research-domain.mjs')
    await expect(verifyResearchRuntime(root, { ...pin, sourceDigest: '4'.repeat(64) })).rejects.toThrow('RESEARCH_RESOURCE_PIN_MISMATCH')
    await writeFile(join(root, 'server/research-domain.mjs'), 'tampered')
    await expect(verifyResearchRuntime(root, pin)).rejects.toThrow('RESEARCH_RESOURCE_HASH_MISMATCH')
  })
})
it('rejects executable resources absent from the complete manifest', async () => {
  await fixture(async (root, pin) => {
    await writeFile(join(root, 'server/extra.js'), 'unlisted')
    await expect(verifyResearchRuntime(root, pin)).rejects.toThrow('RESEARCH_RESOURCE_HASH_MISMATCH')
  })
})
it('rejects linked directories even when linked bytes have the expected hashes', async () => {
  await fixture(async (root, pin) => {
    const other = await mkdtemp(join(tmpdir(), 'research-linked-')), target = join(root, 'server')
    try {
      await writeFile(join(other, 'research-domain.mjs'), await readFile(join(target, 'research-domain.mjs')))
      await rm(target, { recursive: true }); await symlink(other, target, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(verifyResearchRuntime(root, pin)).rejects.toThrow('RESEARCH_PATH_DENIED')
    } finally { await unlink(target); await rm(other, { recursive: true, force: true }) }
  })
})
it.each(['bin/node.exe', 'web/.next/BUILD_ID', 'server/embedded.js', 'web/assets/source.js.map', 'server/node_modules/next/package.json', 'server/node_modules/tsx/package.json'])(
  'rejects a legacy application or debug resource even when its bytes are pinned (%s)', async (name) => {
    await fixture(async (root, pin) => {
      const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as ResearchRuntimeManifest
      await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), 'forbidden')
      const encoded = JSON.stringify({ ...manifest, files: [...manifest.files, { path: name, size: 9, sha256: digest('forbidden') }] })
      await writeFile(join(root, 'manifest.json'), encoded)
      await expect(verifyResearchRuntime(root, { ...pin, manifestSha256: digest(encoded) })).rejects.toThrow('RESEARCH_MANIFEST_INVALID')
    })
  },
)
it('rejects a required resource missing from disk and an unlisted empty directory', async () => {
  await fixture(async (root, pin) => {
    await mkdir(join(root, 'unexpected'))
    await expect(verifyResearchRuntime(root, pin)).rejects.toThrow('RESEARCH_RESOURCE_HASH_MISMATCH')
    await rmdir(join(root, 'unexpected')); await unlink(join(root, 'web/index.html'))
    await expect(verifyResearchRuntime(root, pin)).rejects.toThrow()
  })
})
it.each(['server/file.', 'server/file ', 'server/CON.txt', 'server/a\u0000b', 'server/embedded-entry.mjs'])(
  'rejects a nonportable or old entry path before filesystem traversal (%s)', async (path) => {
    await fixture(async (root, pin) => {
      const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as ResearchRuntimeManifest
      const encoded = JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], path }, ...manifest.files.slice(1)] })
      await writeFile(join(root, 'manifest.json'), encoded)
      await expect(verifyResearchRuntime(root, { ...pin, manifestSha256: digest(encoded) })).rejects.toThrow('RESEARCH_MANIFEST_INVALID')
    })
  },
)
it('rejects digest fields encoded as arrays and case-aliased resource names', async () => {
  await fixture(async (root, pin) => {
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as ResearchRuntimeManifest
    for (const changed of [
      { ...manifest, sharedRuntime: { ...manifest.sharedRuntime, nodeSha256: [manifest.sharedRuntime.nodeSha256] } },
      { ...manifest, sharedRuntime: { ...manifest.sharedRuntime, integrity: { ...manifest.sharedRuntime.integrity,
        primary: { ...manifest.sharedRuntime.integrity.primary, filesSha256: '0'.repeat(64) } } } },
      { ...manifest, sharedRuntime: { ...manifest.sharedRuntime, integrity: { ...manifest.sharedRuntime.integrity,
        dsh: { ...manifest.sharedRuntime.integrity.dsh, scopes: [{ packageName: '@deepseek-ai/dsh', path: '../outside', entries: ['package.json'] }] } } } },
      { ...manifest, build: { ...manifest.build, assemblerSha256: [manifest.build.assemblerSha256] } },
      { ...manifest, files: [...manifest.files, { ...manifest.files[0], path: 'SERVER/research-domain.mjs' }] },
    ]) {
      const encoded = JSON.stringify(changed); await writeFile(join(root, 'manifest.json'), encoded)
      await expect(verifyResearchRuntime(root, { ...pin, manifestSha256: digest(encoded) })).rejects.toThrow('RESEARCH_MANIFEST_INVALID')
    }
  })
})
