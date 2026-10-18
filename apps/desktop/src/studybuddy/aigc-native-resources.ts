/** Complete native AIGC byte boundary; shared interpreters are verified in place. */
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { assertAigcPath } from './aigc-resources.ts'
import { parseResearchSharedIntegrity, verifyResearchSharedIntegrity } from './research-shared-integrity.ts'
import type { ResearchSharedIntegrity } from './research-shared-integrity-types.ts'
import type { AigcLaunchResources } from './aigc-types.ts'
export interface AigcNativePin { manifestSha256: string; sourceCommit: string; sourceDigest: string; lockDigest: string }
/** Select the prepared resource and matching identity for the current application mode.
 * @param options - Main-owned locations and separately reviewed resource pins.
 * @returns The selected directory and pin, including an unprepared null identity. */
export function resolveAigcResourceLocation(options: {
  packaged: boolean; appDirectory: string; resourcesDirectory: string
  productionPin: AigcNativePin | null; developmentPin: AigcNativePin | null
}): { directory: string; pin: AigcNativePin | null } {
  return options.packaged
    ? { directory: join(options.resourcesDirectory, 'studybuddy-aigc'), pin: options.productionPin }
    : { directory: resolve(options.appDirectory, '../..', '.dsh-build/studybuddy-aigc-development'), pin: options.developmentPin }
}
export const AIGC_MEDIA_BYTES = [
  { path: 'bin/ffmpeg.exe', size: 82797568, sha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00' },
  { path: 'bin/ffprobe.exe', size: 82668032, sha256: '3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4' },
] as const
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const file = z.strictObject({ path: z.string().min(1).max(2048), size: z.number().int().nonnegative(), sha256: digest })
const manifestSchema = z.strictObject({ schemaVersion: z.literal(2), kind: z.literal('studybuddy-aigc-plugin'), profile: z.literal('studybuddy-aigc'),
  platform: z.string(), arch: z.string(), entry: z.literal('server/domain.js'), staticEntry: z.literal('web/index.html'),
  upstream: z.strictObject({ repository: z.literal('https://github.com/HBAI-Ltd/Toonflow-app.git'), commit: z.string().regex(/^[a-f0-9]{40}$/) }),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), sourceDigest: digest, lockDigest: digest,
  sharedRuntime: z.strictObject({ nodeVersion: z.literal('24.21.0'), payloadDigest: digest, nodeSha256: digest, dshVersion: z.string(), dshEntrySha256: digest, hostPluginSha256: digest, integrity: z.unknown() }),
  build: z.strictObject({ assemblerSha256: digest, sourceBuildSha256: digest, domainClosureSha256: digest }), files: z.array(file).min(1).max(30000) })
export type AigcNativeManifest = Omit<z.infer<typeof manifestSchema>, 'sharedRuntime'> & { sharedRuntime: Omit<z.infer<typeof manifestSchema>['sharedRuntime'], 'integrity'> & { integrity: ResearchSharedIntegrity } }
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function admitted(path: string): boolean {
  if (path.includes('\\') || path.includes(':') || /[\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return false
  if (!/^(?:web|nodes|tools|ext|skills|notices|node_modules|build)\//.test(path) && !['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json', ...AIGC_MEDIA_BYTES.map(row => row.path)].includes(path)) return false
  if (/\.map$|(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:\.git|src|\.next)(?:\/|$)|(?:^|\/)(?:bun|node|python)(?:\.exe)?$/i.test(path)) return false
  if (/\.exe$/i.test(path) && !AIGC_MEDIA_BYTES.some(row => row.path === path)) return false
  return !/(?:^|\/)node_modules\/(?:@earendil-works\/pi-(?:coding-agent|agent-core|ai)|next|tsx)(?:\/|$)/i.test(path)
}
export function parseAigcNativeManifest(value: unknown, pin: AigcNativePin): AigcNativeManifest {
  const parsed = manifestSchema.parse(value)
  if (parsed.platform !== process.platform || parsed.arch !== process.arch || parsed.sourceCommit !== pin.sourceCommit || parsed.sourceDigest !== pin.sourceDigest || parsed.lockDigest !== pin.lockDigest) throw Error('AIGC_RESOURCE_PIN_MISMATCH')
  const seen = new Set<string>()
  for (const file of parsed.files) { const key = file.path.toLowerCase(); if (!admitted(file.path) || seen.has(key)) throw Error('AIGC_NATIVE_MANIFEST_INVALID'); seen.add(key) }
  for (const name of ['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json', 'build/bundledMigration.json', 'web/index.html', 'node_modules/sharp/package.json', 'node_modules/zod/package.json', 'node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm']) if (!seen.has(name.toLowerCase())) throw Error('AIGC_NATIVE_RESOURCE_MISSING')
  for (const media of AIGC_MEDIA_BYTES) if (!parsed.files.some(file => file.path === media.path && file.size === media.size && file.sha256 === media.sha256)) throw Error('AIGC_MEDIA_BYTES_CHANGED')
  return { ...parsed, sharedRuntime: { ...parsed.sharedRuntime, integrity: parseResearchSharedIntegrity(parsed.sharedRuntime.integrity) } }
}
export async function verifyAigcNativeFiles(directory: string, pin: AigcNativePin): Promise<AigcNativeManifest> {
  if (!isAbsolute(directory)) throw Error('AIGC_RESOURCE_PATH_INVALID')
  await assertAigcPath(directory)
  const bytes = await readFile(join(directory, 'manifest.json')); if (sha(bytes) !== pin.manifestSha256) throw Error('AIGC_RUNTIME_IDENTITY_MISMATCH')
  const manifest = parseAigcNativeManifest(JSON.parse(bytes.toString('utf8')), pin), names = new Set(manifest.files.map(row => row.path)), directories = new Set<string>()
  for (const name of names) { const parts = name.split('/'); for (let count = 1; count < parts.length; count++) directories.add(parts.slice(0, count).join('/')) }
  const walk = async (prefix = ''): Promise<void> => {
    for (const item of await readdir(join(directory, prefix), { withFileTypes: true })) {
      const path = prefix + item.name
      if (item.isSymbolicLink() || !item.isDirectory() && !item.isFile()) throw Error('AIGC_RUNTIME_PATH_DENIED')
      if (item.isDirectory()) { if (!directories.has(path)) throw Error('AIGC_RESOURCE_HASH_MISMATCH'); await walk(path + '/') }
      else if (path !== 'manifest.json' && !names.has(path)) throw Error('AIGC_RESOURCE_HASH_MISMATCH')
    }
  }
  await walk()
  let cursor = 0
  const work = await Promise.allSettled(Array.from({ length: 8 }, async () => {
    for (;;) { const row = manifest.files[cursor++]; if (!row) return
      const path = join(directory, row.path), stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw Error('AIGC_RUNTIME_PATH_DENIED')
      const content = await readFile(path); if (content.length !== row.size || sha(content) !== row.sha256) throw Error('AIGC_RESOURCE_HASH_MISMATCH')
    }
  }))
  for (const result of work) if (result.status === 'rejected') throw result.reason
  await assertAigcPath(directory); await walk(); return manifest
}
export async function loadAigcNativeResources(directory: string, pin: AigcNativePin, roots: { primaryRuntimeDirectory: string; dshDirectory: string; workspaceDirectory?: string }): Promise<AigcLaunchResources> {
  const manifest = await verifyAigcNativeFiles(directory, pin), shared = manifest.sharedRuntime
  if (![roots.primaryRuntimeDirectory, roots.dshDirectory].every(isAbsolute) || /\.asar(?:[\\/]|$)/.test(roots.dshDirectory)) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  await assertAigcPath(roots.primaryRuntimeDirectory)
  const metadata = z.object({ node: z.literal('24.21.0'), payloadDigest: digest, platform: z.literal(process.platform), arch: z.literal(process.arch) }).parse(JSON.parse(await readFile(join(roots.primaryRuntimeDirectory, 'runtime.json'), 'utf8')))
  if (metadata.payloadDigest !== shared.payloadDigest) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  const node = join(roots.primaryRuntimeDirectory, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node'), entry = join(roots.dshDirectory, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), plugin = join(roots.dshDirectory, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/aigc-plugin.js')
  for (const [path, expected] of [[node, shared.nodeSha256], [entry, shared.dshEntrySha256], [plugin, shared.hostPluginSha256]] as const) if (sha(await readFile(path)) !== expected) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  for (const name of ['dsh', 'dsh-desktop-host']) {
    const metadata = z.object({ name: z.literal('@deepseek-ai/' + name), version: z.literal(shared.dshVersion) }).safeParse(JSON.parse(await readFile(join(roots.dshDirectory, 'node_modules/@deepseek-ai', name, 'package.json'), 'utf8')))
    if (!metadata.success) throw Error('AIGC_SHARED_RUNTIME_MISMATCH')
  }
  await verifyResearchSharedIntegrity(shared.integrity, roots, roots.workspaceDirectory ? { workspaceDirectory: roots.workspaceDirectory } : {})
  return { directory, node, entry, plugin, domainEntry: join(directory, manifest.entry), staticDirectory: join(directory, 'web'), manifestSha256: pin.manifestSha256 }
}
