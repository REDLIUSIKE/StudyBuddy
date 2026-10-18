/** Reject altered or linked AIGC executable resources before any process starts. */
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { AigcRuntimeManifest } from './aigc-types.ts'

/** Reject links in a path and every existing ancestor.
 * @param path - Absolute source or resource path.
 * @returns Completion once the path has no linked ancestor. */
export async function assertAigcPath(path: string): Promise<void> {
  let current = resolve(path)
  for (;;) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (info?.isSymbolicLink()) throw new Error('AIGC_RUNTIME_PATH_DENIED')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}

/** Verify the complete resource byte inventory, including the portable runtime.
 * @param directory - Main-owned resource directory.
 * @returns The validated source and resource identities. */
export async function verifyAigcRuntime(directory: string): Promise<AigcRuntimeManifest> {
  await assertAigcPath(directory)
  const value: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('files' in value) || !Array.isArray(value.files) || value.files.length === 0
    || !('bunVersion' in value) || value.bunVersion !== '1.3.14'
    || !('platform' in value) || value.platform !== process.platform || !('arch' in value) || value.arch !== process.arch
    || !('entry' in value) || value.entry !== 'server/studyBuddy.js'
    || !('upstream' in value) || !value.upstream || typeof value.upstream !== 'object'
    || !('repository' in value.upstream) || value.upstream.repository !== 'https://github.com/HBAI-Ltd/Toonflow-app.git'
    || !('commit' in value.upstream) || value.upstream.commit !== '2c7fb257affb65777110fe4c6e60cd3c09187d9b') {
    throw new Error('AIGC_RUNTIME_MANIFEST_INVALID')
  }
  for (const key of ['sourceDigest', 'lockDigest', 'sourceCommit'] as const) {
    if (!(key in value) || typeof Reflect.get(value, key) !== 'string'
      || !(key === 'sourceCommit' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(Reflect.get(value, key))) {
      throw new Error('AIGC_RUNTIME_MANIFEST_INVALID')
    }
  }
  const seen = new Set<string>()
  for (const file of value.files) {
    if (!file || typeof file !== 'object' || typeof file.path !== 'string' || !file.path
      || file.path.includes('\\') || file.path.includes(':') || file.path.split('/').some((part: string) => !part || part === '.' || part === '..')
      || seen.has(file.path) || file.path === 'manifest.json' || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('AIGC_RUNTIME_MANIFEST_INVALID')
    seen.add(file.path)
    const path = join(directory, file.path)
    await assertAigcPath(path)
    const bytes = await readFile(path)
    if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error('AIGC_RUNTIME_HASH_MISMATCH')
    }
  }
  const walk = async (path: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix + entry.name
      if (entry.isSymbolicLink()) throw new Error('AIGC_RUNTIME_PATH_DENIED')
      if (entry.isDirectory()) await walk(join(path, entry.name), name + '/')
      else if (!entry.isFile() || name !== 'manifest.json' && !seen.has(name)) throw new Error('AIGC_RUNTIME_HASH_MISMATCH')
    }
  }
  await walk(directory, '')
  for (const name of ['server/studyBuddy.js', 'web/index.html', 'bin/bun.exe', 'bin/ffmpeg.exe', 'bin/ffprobe.exe']) {
    if (!seen.has(name)) throw new Error('AIGC_RUNTIME_MANIFEST_INVALID')
  }
  return value as AigcRuntimeManifest
}
