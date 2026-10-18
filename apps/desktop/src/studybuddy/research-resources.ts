/** Every executable resource is checked against the integrated candidate's byte pin. */
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ResearchResourcePin, ResearchRuntimeManifest } from './research-types.ts'
import { parseResearchSharedIntegrity } from './research-shared-integrity.ts'

const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Refuse junctions/symlinks through all existing ancestors.
 * @param value - Main-owned absolute resource or data path.
 * @returns Completion after path admission. */
export async function assertResearchPath(value: string): Promise<void> {
  let current = resolve(value)
  for (;;) {
    const info = await lstat(current).catch((error: unknown) => {
      if (isRecord(error) && error.code === 'ENOENT') return undefined
      throw error
    })
    if (info?.isSymbolicLink()) throw Error('RESEARCH_PATH_DENIED')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}
/** Check identity, links and the complete compiled research inventory before launch.
 * @param directory - Candidate's admitted resource directory.
 * @param pin - Trusted source and byte identities compiled with Main.
 * @returns Validated manifest. */
export async function verifyResearchRuntime(directory: string, pin: ResearchResourcePin): Promise<ResearchRuntimeManifest> {
  await assertResearchPath(directory)
  const bytes = await readFile(join(directory, 'manifest.json'))
  if (createHash('sha256').update(bytes).digest('hex') !== pin.manifestSha256) throw Error('RESEARCH_RESOURCE_PIN_MISMATCH')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 2 ||
    !('platform' in value) || value.platform !== process.platform || !('arch' in value) || value.arch !== process.arch ||
    !('kind' in value) || value.kind !== 'studybuddy-research-plugin' || !('profile' in value) || value.profile !== 'studybuddy-research' ||
    !('entry' in value) || value.entry !== 'server/research-domain.mjs' || !('staticEntry' in value) || value.staticEntry !== 'web/index.html' ||
    !('upstream' in value) || !value.upstream || typeof value.upstream !== 'object' ||
    !('repository' in value.upstream) || value.upstream.repository !== 'https://github.com/K-Dense-AI/k-dense-byok.git' ||
    !('commit' in value.upstream) || value.upstream.commit !== '44c52cee8e9fdc343c6132909769f49accf14a82' ||
    !('files' in value) || !Array.isArray(value.files) || !value.files.length) throw Error('RESEARCH_MANIFEST_INVALID')
  const shared: unknown = Reflect.get(value, 'sharedRuntime'), build: unknown = Reflect.get(value, 'build')
  if (!isRecord(shared) || shared.nodeVersion !== '24.21.0' || shared.pythonVersion !== '3.12.14' || typeof shared.dshVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(shared.dshVersion) ||
    !['payloadDigest', 'nodeSha256', 'pythonSha256', 'dshEntrySha256', 'hostPluginSha256'].every(key => isDigest(shared[key])) ||
    !isRecord(build) || !['assemblerSha256', 'serverBuildSha256', 'webBuildSha256'].every(key => isDigest(build[key]))) throw Error('RESEARCH_MANIFEST_INVALID')
  try { parseResearchSharedIntegrity(shared.integrity) } catch { throw Error('RESEARCH_MANIFEST_INVALID') }
  for (const key of ['sourceCommit', 'sourceDigest', 'lockDigest'] as const) {
    const item: unknown = Reflect.get(value, key)
    if (item !== pin[key] || typeof item !== 'string' || !(key === 'sourceCommit' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(item)) throw Error('RESEARCH_RESOURCE_PIN_MISMATCH')
  }
  const seen = new Set<string>(), folded = new Set<string>(), directories = new Set<string>()
  const rawFiles: readonly unknown[] = value.files, files: ResearchRuntimeManifest['files'][number][] = []
  for (const file of rawFiles) {
    if (!isRecord(file)) throw Error('RESEARCH_MANIFEST_INVALID')
    const { path, size, sha256 } = file
    if (typeof path !== 'string' || path === 'manifest.json' || path.includes('\\') || path.includes(':') || /[\x00-\x1f]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
      folded.has(path.toLowerCase()) || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || !isDigest(sha256) ||
      /^(?:bin|source|web\/node_modules|web\/\.next)(?:\/|$)/i.test(path) || /(?:^|\/)(?:src|\.next|\.git)(?:\/|$)/i.test(path) ||
      /(?:^|\/)node(?:\.exe)?$/i.test(path) || /\.map$/i.test(path) || /(?:^|\/)\.env(?:\.|$)/i.test(path) ||
      /(?:^|\/)node_modules\/(?:next|@next\/[^/]+|tsx|@earendil-works\/pi-(?:coding-agent|agent-core|ai))(?:\/|$)/i.test(path) ||
      ['server/embedded.js', 'server/embedded-entry.js', 'server/embedded-entry.mjs'].includes(path.toLowerCase())) throw Error('RESEARCH_MANIFEST_INVALID')
    files.push({ path, size, sha256 }); seen.add(path); folded.add(path.toLowerCase())
    const parts = path.split('/')
    for (let length = 1; length < parts.length; length++) directories.add(parts.slice(0, length).join('/'))
  }
  const walk = async (folder: string, prefix: string): Promise<void> => {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const name = prefix + item.name
      if (item.isSymbolicLink()) throw Error('RESEARCH_PATH_DENIED')
      if (item.isDirectory()) {
        if (!directories.has(name)) throw Error('RESEARCH_RESOURCE_HASH_MISMATCH')
        await walk(join(folder, item.name), name + '/')
      }
      else if (!item.isFile() || name !== 'manifest.json' && !seen.has(name)) throw Error('RESEARCH_RESOURCE_HASH_MISMATCH')
    }
  }
  // Check every directory before and after the byte pass. Repeating every
  // ancestor lstat for each of tens of thousands of files stalls Windows I/O.
  await walk(directory, '')
  let cursor=0,failed=false
  const workers=Array.from({ length:Math.min(8,files.length) },async()=>{
    try {for(;;){if(failed)return;const file=files[cursor++];if(!file)return
      const target=join(directory,file.path),info=await lstat(target)
      if(!info.isFile()||info.isSymbolicLink())throw Error('RESEARCH_PATH_DENIED')
      const actual=await readFile(target)
      if(actual.length!==file.size||createHash('sha256').update(actual).digest('hex')!==file.sha256)throw Error('RESEARCH_RESOURCE_HASH_MISMATCH')
    }}catch(error){failed=true;throw error}
  })
  const results=await Promise.allSettled(workers),failure=results.find(result=>result.status==='rejected')
  if(failure?.status==='rejected')throw failure.reason
  await assertResearchPath(directory);await walk(directory,'')
  for (const required of ['server/research-domain.mjs', 'web/index.html']) if (!seen.has(required)) throw Error('RESEARCH_MANIFEST_INVALID')
  return value as ResearchRuntimeManifest
}
