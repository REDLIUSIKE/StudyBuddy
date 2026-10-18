/** Complete primary bytes and the sealed research profile's shared package bytes. */
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type {
  ResearchSharedDshResolution, ResearchSharedDshScope, ResearchSharedFile, ResearchSharedIntegrity, ResearchSharedIntegrityRoots,
} from './research-shared-integrity-types.ts'
export type {
  ResearchSharedDshResolution, ResearchSharedDshScope, ResearchSharedFile, ResearchSharedIntegrity, ResearchSharedIntegrityRoots,
} from './research-shared-integrity-types.ts'

const invalid = 'RESEARCH_SHARED_INTEGRITY_INVALID'
const denied = 'RESEARCH_SHARED_INTEGRITY_PATH_DENIED'
const mismatch = 'RESEARCH_SHARED_INTEGRITY_MISMATCH'
const changed = 'RESEARCH_SHARED_INTEGRITY_INPUT_CHANGED'
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const order = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const rowsDigest = (rows: ResearchSharedFile[]) => sha(JSON.stringify(rows))
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw Error(invalid)
  return value as Record<string, unknown>
}

function portable(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\\') || value.includes(':') || /[\x00-\x1f]/.test(value) ||
    value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error(invalid)
  return value
}

function unique(values: string[]): void {
  if (new Set(values.map(value => value.toLowerCase())).size !== values.length) throw Error(invalid)
}

function within(root: string, path: string): boolean {
  const name = relative(root, path)
  return !isAbsolute(name) && name !== '..' && !name.startsWith('..' + sep)
}

function scopesFrom(value: unknown): ResearchSharedDshScope[] {
  if (!Array.isArray(value) || !value.length) throw Error(invalid)
  const scopes = value.map((item) => {
    const row = record(item, ['packageName', 'path', 'entries'])
    if (typeof row.packageName !== 'string' || !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(row.packageName)) throw Error(invalid)
    const path = portable(row.path)
    if (!path.startsWith('node_modules/') || !path.endsWith('/' + row.packageName)) throw Error(invalid)
    if (!Array.isArray(row.entries) || !row.entries.length) throw Error(invalid)
    const entries = row.entries.map(portable).sort(order)
    unique(entries)
    if (!entries.includes('package.json') || entries.some(entry => entry === 'node_modules' || entry.startsWith('node_modules/'))) {
      throw Error(invalid)
    }
    for (const entry of entries) if (entries.some(other => entry !== other && entry.startsWith(other + '/'))) throw Error(invalid)
    return { packageName: row.packageName, path, entries }
  }).sort((left, right) => order(left.path, right.path))
  unique(scopes.map(scope => scope.path))
  return scopes
}

function filesFrom(value: unknown): ResearchSharedFile[] {
  if (!Array.isArray(value) || !value.length) throw Error(invalid)
  const files = value.map((item) => {
    const row = record(item, ['path', 'size', 'sha256'])
    if (typeof row.size !== 'number' || !Number.isSafeInteger(row.size) || row.size < 0 || !digest(row.sha256)) throw Error(invalid)
    return { path: portable(row.path), size: row.size, sha256: row.sha256 }
  }).sort((left, right) => order(left.path, right.path))
  unique(files.map(file => file.path))
  return files
}

function resolutionsFrom(value: unknown, scopes: ResearchSharedDshScope[], files: ResearchSharedFile[]): ResearchSharedDshResolution[] {
  if (!Array.isArray(value)) throw Error(invalid)
  const rows = value.map((item) => {
    const row = record(item, ['from', 'packageName', 'to'])
    const from = portable(row.from), to = portable(row.to)
    const scope = scopes.find(candidate => candidate.path === to)
    if (!scope || scope.packageName !== row.packageName || !files.some(file => file.path === from)) throw Error(invalid)
    return { from, packageName: scope.packageName, to }
  }).sort((left, right) => order(left.from + '\0' + left.packageName, right.from + '\0' + right.packageName))
  unique(rows.map(row => row.from + '\0' + row.packageName))
  return rows
}

/** Validate portable manifest fields and their complete canonical inventory digests without reading files.
 * @param value - Untrusted parsed manifest integrity object.
 * @returns A strict, path-sorted actual-byte identity. */
export function parseResearchSharedIntegrity(value: unknown): ResearchSharedIntegrity {
  const root = record(value, ['schemaVersion', 'generatorSha256', 'primary', 'dsh'])
  if (root.schemaVersion !== 1 || !digest(root.generatorSha256)) throw Error(invalid)
  const primary = record(root.primary, ['filesSha256', 'files']), dsh = record(root.dsh, ['filesSha256', 'scopes', 'files', 'resolutions'])
  const primaryFiles = filesFrom(primary.files), dshFiles = filesFrom(dsh.files), scopes = scopesFrom(dsh.scopes)
  if (rowsDigest(primaryFiles) !== primary.filesSha256 || rowsDigest(dshFiles) !== dsh.filesSha256) throw Error(invalid)
  for (const row of dshFiles) {
    if (!scopes.some(scope => scope.entries.some(entry => row.path === scope.path + '/' + entry ||
      row.path.startsWith(scope.path + '/' + entry + '/')))) throw Error(invalid)
  }
  for (const scope of scopes) if (!dshFiles.some(row => row.path === scope.path + '/package.json')) throw Error(invalid)
  return {
    schemaVersion: 1, generatorSha256: root.generatorSha256,
    primary: { filesSha256: rowsDigest(primaryFiles), files: primaryFiles },
    dsh: { filesSha256: rowsDigest(dshFiles), scopes, files: dshFiles, resolutions: resolutionsFrom(dsh.resolutions, scopes, dshFiles) },
  }
}

async function noLinks(path: string): Promise<void> {
  let cursor = resolve(path)
  for (;;) {
    if ((await lstat(cursor)).isSymbolicLink()) throw Error(denied)
    const parent = dirname(cursor)
    if (parent === cursor) return
    cursor = parent
  }
}

type Snapshot = { path: string; absolute: string; stamp: string; size: number }
const stamp = (info: Awaited<ReturnType<typeof lstat>>) =>
  [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, info.mode].join(':')

async function list(root: string, prefix: string, rows: Snapshot[]): Promise<void> {
  const absolute = join(root, prefix), info = await lstat(absolute)
  if (info.isSymbolicLink()) throw Error(denied)
  if (info.isFile()) {
    portable(prefix)
    rows.push({ path: prefix, absolute, stamp: stamp(info), size: info.size })
  } else if (info.isDirectory()) {
    const names = await readdir(absolute)
    for (const name of names.sort(order)) {
      portable(name)
      await list(root, prefix ? prefix + '/' + name : name, rows)
    }
  } else throw Error(denied)
}

async function snapshots(roots: ResearchSharedIntegrityRoots, scopes: ResearchSharedDshScope[],
  resolutions: ResearchSharedDshResolution[], workspaceDirectory?: string) {
  const primary: Snapshot[] = [], dsh: Snapshot[] = []
  for (const root of [roots.primaryRuntimeDirectory, roots.dshDirectory]) {
    if (!isAbsolute(root) || !(await lstat(root)).isDirectory()) throw Error(denied)
    await noLinks(root)
  }
  if (workspaceDirectory) {
    if (!isAbsolute(workspaceDirectory)) throw Error(denied)
    await noLinks(workspaceDirectory)
  }
  await list(roots.primaryRuntimeDirectory, '', primary)
  const admittedLinks = new Set(scopes.map(scope => scope.path))
  const physicalScopes = new Map<string, string>()
  for (const scope of scopes) {
    const path = join(roots.dshDirectory, scope.path)
    let prefix = ''
    for (const part of scope.path.split('/')) {
      prefix = prefix ? prefix + '/' + part : part
      const cursor = join(roots.dshDirectory, prefix), info = await lstat(cursor)
      if (info.isSymbolicLink()) {
        if (!workspaceDirectory || !admittedLinks.has(prefix)) throw Error(denied)
        const target = await realpath(cursor)
        if (!within(resolve(workspaceDirectory), target)) throw Error(denied)
        await noLinks(target)
      } else if (!info.isDirectory()) throw Error(denied)
    }
    const physical = await realpath(path)
    physicalScopes.set(scope.path, physical)
    const manifest = JSON.parse(await readFile(join(physical, 'package.json'), 'utf8')) as { name?: string }
    if (manifest.name !== scope.packageName) throw Error(mismatch)
    for (const entry of scope.entries) {
      const local: Snapshot[] = []
      await list(physical, entry, local)
      dsh.push(...local.map(row => ({ ...row, path: scope.path + '/' + row.path })))
    }
  }
  primary.sort((left, right) => order(left.path, right.path)); dsh.sort((left, right) => order(left.path, right.path))
  unique(primary.map(row => row.path)); unique(dsh.map(row => row.path))
  const physicalResolutions: Array<{ from: string; target: string }> = []
  for (const row of resolutions) {
    let cursor = dirname(await realpath(join(roots.dshDirectory, row.from)))
    for (;;) {
      const candidate = join(cursor, 'node_modules', row.packageName)
      const info = await lstat(candidate).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return
        throw error
      })
      if (info) {
        const target = await realpath(candidate)
        if (target !== physicalScopes.get(row.to)) throw Error(mismatch)
        physicalResolutions.push({ from: row.from, target }); break
      }
      const parent = dirname(cursor)
      if (parent === cursor) throw Error(mismatch)
      cursor = parent
    }
  }
  return { primary, dsh, physicalResolutions }
}

async function hashFiles(rows: Snapshot[]): Promise<ResearchSharedFile[]> {
  let next = 0, failure: unknown
  const result = new Array<ResearchSharedFile>(rows.length)
  const workers = await Promise.allSettled(Array.from({ length: Math.min(8, rows.length) }, async () => {
    while (!failure) {
      const index = next++, row = rows[index]
      if (!row) return
      try {
        const before = await lstat(row.absolute)
        if (!before.isFile() || before.isSymbolicLink() || stamp(before) !== row.stamp) throw Error(changed)
        const bytes = await readFile(row.absolute), after = await lstat(row.absolute)
        if (stamp(after) !== row.stamp || bytes.length !== row.size) throw Error(changed)
        result[index] = { path: row.path, size: bytes.length, sha256: sha(bytes) }
      } catch (error) { failure = error; throw error }
    }
  }))
  for (const worker of workers) if (worker.status === 'rejected') throw worker.reason
  return result
}

/** Freeze complete primary bytes and explicitly selected shared research package runtime roots.
 * @param roots - Main-selected installations whose bytes are bound without copying.
 * @param options - Reviewed package scopes, helper source hash and optional canonical development workspace.
 * @returns An identity after hashing all files and checking that the complete snapshot stayed unchanged. */
export async function createResearchSharedIntegrity(roots: ResearchSharedIntegrityRoots, options: {
  dshScopes: ResearchSharedDshScope[]
  dshResolutions?: ResearchSharedDshResolution[]
  generatorSha256: string
  workspaceDirectory?: string
}): Promise<ResearchSharedIntegrity> {
  if (!digest(options.generatorSha256)) throw Error(invalid)
  const scopes = scopesFrom(options.dshScopes)
  try {
    const resolutions = options.dshResolutions ?? []
    const before = await snapshots(roots, scopes, resolutions, options.workspaceDirectory)
    const hashed = await Promise.allSettled([hashFiles(before.primary), hashFiles(before.dsh)])
    for (const result of hashed) if (result.status === 'rejected') throw result.reason
    const primaryResult = hashed[0], dshResult = hashed[1]
    if (primaryResult.status !== 'fulfilled' || dshResult.status !== 'fulfilled') throw Error(changed)
    const primary = primaryResult.value, dsh = dshResult.value
    const after = await snapshots(roots, scopes, resolutions, options.workspaceDirectory)
    if (!same(before, after)) throw Error(changed)
    return parseResearchSharedIntegrity({
      schemaVersion: 1, generatorSha256: options.generatorSha256,
      primary: { filesSha256: rowsDigest(primary), files: primary },
      dsh: { filesSha256: rowsDigest(dsh), scopes, files: dsh, resolutions },
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('RESEARCH_SHARED_INTEGRITY_')) throw error
    throw Error(mismatch, { cause: error })
  }
}

/** Rehash the complete selected installations and reject missing, extra, linked or changed runtime bytes.
 * @param expected - Integrity frozen into the reviewed production manifest.
 * @param roots - Main-selected current shared installations.
 * @param options - Canonical workspace allowance for explicitly selected development package junctions only.
 * @returns After exact inventory and hash equality; normal Python cache writes are not ignored. */
export async function verifyResearchSharedIntegrity(expected: ResearchSharedIntegrity, roots: ResearchSharedIntegrityRoots,
  options: { workspaceDirectory?: string } = {}): Promise<void> {
  const parsed = parseResearchSharedIntegrity(expected)
  const actual = await createResearchSharedIntegrity(roots, {
    dshScopes: parsed.dsh.scopes, dshResolutions: parsed.dsh.resolutions,
    generatorSha256: parsed.generatorSha256, ...(options.workspaceDirectory ? { workspaceDirectory: options.workspaceDirectory } : {}),
  })
  if (!same(actual, parsed)) throw Error(mismatch)
}
