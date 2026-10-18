import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { AIGC_MEDIA_BYTES, verifyAigcNativeFiles } from '../src/studybuddy/aigc-native-resources.ts'
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
it('verifies real retained media bytes and rejects missing dynamic resources, extra files and repinned Bun payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-native-files-'))
  const pin = { manifestSha256: '', sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), lockDigest: 'c'.repeat(64) }
  const paths = ['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json', 'build/bundledMigration.json', 'web/index.html', 'node_modules/sharp/package.json', 'node_modules/zod/package.json', 'node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm', 'notices/license.txt']
  const files = paths.map(path => ({ path, size: path.length, sha256: sha(path) }))
  const primaryFiles = [{ path: 'runtime.json', size: 1, sha256: sha('x') }], dshFiles = [{ path: 'node_modules/shared/package.json', size: 1, sha256: sha('x') }]
  const manifest = { schemaVersion: 2, kind: 'studybuddy-aigc-plugin', profile: 'studybuddy-aigc', platform: process.platform, arch: process.arch,
    entry: 'server/domain.js', staticEntry: 'web/index.html', upstream: { repository: 'https://github.com/HBAI-Ltd/Toonflow-app.git', commit: 'd'.repeat(40) },
    sourceCommit: pin.sourceCommit, sourceDigest: pin.sourceDigest, lockDigest: pin.lockDigest,
    sharedRuntime: { nodeVersion: '24.21.0', payloadDigest: 'e'.repeat(64), nodeSha256: 'e'.repeat(64), dshVersion: '1.0.1', dshEntrySha256: 'f'.repeat(64), hostPluginSha256: 'f'.repeat(64),
      integrity: { schemaVersion: 1, generatorSha256: 'f'.repeat(64), primary: { files: primaryFiles, filesSha256: sha(JSON.stringify(primaryFiles)) },
        dsh: { files: dshFiles, filesSha256: sha(JSON.stringify(dshFiles)), scopes: [{ packageName: 'shared', path: 'node_modules/shared', entries: ['package.json'] }], resolutions: [] } } },
    build: { assemblerSha256: 'e'.repeat(64), sourceBuildSha256: 'e'.repeat(64), domainClosureSha256: 'e'.repeat(64) }, files: [...files, ...AIGC_MEDIA_BYTES] }
  const publish = async () => { const text = JSON.stringify(manifest); await writeFile(join(root, 'manifest.json'), text); pin.manifestSha256 = sha(text) }
  try {
    for (const row of files) { await mkdir(dirname(join(root, row.path)), { recursive: true }); await writeFile(join(root, row.path), row.path) }
    for (const row of AIGC_MEDIA_BYTES) { await mkdir(dirname(join(root, row.path)), { recursive: true }); await copyFile(new URL('../../../.dsh-build/studybuddy-aigc/' + row.path, import.meta.url), join(root, row.path)) }
    await publish(); expect((await verifyAigcNativeFiles(root, pin)).entry).toBe('server/domain.js')
    await writeFile(join(root, 'server/unlisted.js'), 'unreviewed'); await expect(verifyAigcNativeFiles(root, pin)).rejects.toThrow('AIGC_RESOURCE_HASH_MISMATCH'); await rm(join(root, 'server/unlisted.js'))
    const worker = manifest.files.findIndex(row => row.path === 'server/image-resize-worker.js'), saved = manifest.files.splice(worker, 1)[0]!
    await publish(); await expect(verifyAigcNativeFiles(root, pin)).rejects.toThrow('AIGC_NATIVE_RESOURCE_MISSING'); manifest.files.splice(worker, 0, saved)
    manifest.files.push({ path: 'bin/bun.exe', size: 3, sha256: sha('bun') }); await publish(); await expect(verifyAigcNativeFiles(root, pin)).rejects.toThrow('AIGC_NATIVE_MANIFEST_INVALID'); manifest.files.pop()
    await publish(); await writeFile(join(root, 'server/domain.js'), 'changed'); await expect(verifyAigcNativeFiles(root, pin)).rejects.toThrow('AIGC_RESOURCE_HASH_MISMATCH')
    expect((await readFile(join(root, 'bin/ffmpeg.exe'))).length).toBe(AIGC_MEDIA_BYTES[0].size)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 20000)
