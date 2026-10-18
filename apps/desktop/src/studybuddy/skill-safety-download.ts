/** Fixed native preparation; shared flights never grant model access or target-skill installation. */
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns'
import { lstat, mkdir, mkdtemp, open, readdir, rename, rmdir, statfs, unlink } from 'node:fs/promises'
import { request } from 'node:https'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { LookupFunction } from 'node:net'
import extractZip from 'extract-zip'
import { SkillScannerResourceError, type SkillScannerRelease } from './skill-safety-release.ts'
import { scannerResourceSchema, validateSkillScannerRelativePath, verifySkillScannerDirectoryPath, verifySkillScannerResources, type SkillScannerResourceManifest } from './skill-safety-resources.ts'
import { isPublicSkillSourceAddress } from './skill-safety-public-request.ts'
/** Actual network response; the owner validates status, headers and every streamed byte. */
export interface SkillScannerDownloadReply {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: AsyncIterable<Uint8Array>
  /** Close the response, including a rejected/unconsumed body, and await its transport. */
  close(): Promise<void>
}
/** Real transport and disk boundary, without changing preparation or verification in tests. */
export interface SkillScannerDownloadDependencies {
  readonly open: (url: URL, signal: AbortSignal) => Promise<SkillScannerDownloadReply>
  readonly freeBytes: (directory: string) => Promise<number>
}
/** Keyless current resource state; HTTP completion is not readiness. */
export interface SkillScannerDownloadStatus { readonly state: 'missing' | 'downloading' | 'ready' | 'failed'; readonly scannerVersion: '2.2.2'; readonly receivedBytes: number; readonly totalBytes: number; readonly code?: string }
/** Private verified paths, never a renderer/model result. */
export interface SkillScannerVerifiedResources { readonly directory: string; readonly runtimeDirectory: string; readonly manifest: SkillScannerResourceManifest }
/** One native resource manager shared by manual and helper callers. */
export interface SkillScannerDownload {
  /** Inspect local bytes without downloading. */
  status(signal: AbortSignal): Promise<SkillScannerDownloadStatus>
  /** Verify a cache or prepare it for the requesting caller. */
  prepare(signal: AbortSignal, onProgress?: (status: SkillScannerDownloadStatus) => void): Promise<SkillScannerVerifiedResources>
  /** Stop owned work and await quiescence. */
  dispose(): Promise<void>
}
/**
 * Create one fixed preparation owner; its external transport/disk operations may be injected.
 * @param input - Client-owned release and private cache/runtime roots, never model JSON.
 * @param dependencies - Native I/O boundaries; omitted for the actual desktop transport.
 * @returns One shared preparation owner; failures preserve other versions and clean only owned staging.
 */
export function createSkillScannerDownload(input: { release: SkillScannerRelease; cacheDirectory: string; runtimeDirectory: string }, dependencies?: SkillScannerDownloadDependencies): SkillScannerDownload {
  if (!isAbsolute(input.cacheDirectory) || !isAbsolute(input.runtimeDirectory)) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID')
  const cache = resolve(input.cacheDirectory), runtime = resolve(input.runtimeDirectory), release = input.release
  const destination = join(cache, release.archiveSha256)
  const io = dependencies ?? { open: openResourceResponse, freeBytes: async (directory: string) => { const stat = await statfs(directory); return stat.bavail * stat.bsize } }
  let current: SkillScannerDownloadStatus = { state: 'missing', scannerVersion: '2.2.2', receivedBytes: 0, totalBytes: release.archiveSizeBytes }
  let disposed = false
  type Waiter = { progress?: (status: SkillScannerDownloadStatus) => void }
  type Flight = { controller: AbortController; work: Promise<SkillScannerVerifiedResources>; waiters: Set<Waiter> }
  let flight: Flight | undefined
  const cancelled = (signal: AbortSignal) => { if (disposed || signal.aborted) throw new SkillScannerResourceError('SKILL_SAFETY_CANCELLED') }
  const update = (status: SkillScannerDownloadStatus) => {
    current = Object.freeze(status)
    for (const waiter of flight?.waiters ?? []) {
      try { waiter.progress?.(current) } catch (error) { console.warn('SKILL_SAFETY_RESOURCE_PROGRESS_FAILED') }
    }
  }
  const cleanStatus = (state: SkillScannerDownloadStatus['state'], receivedBytes: number): SkillScannerDownloadStatus => ({
    state, receivedBytes, scannerVersion: release.scannerVersion, totalBytes: release.archiveSizeBytes,
  })
  const ready = async (): Promise<SkillScannerVerifiedResources | undefined> => {
    try { await lstat(destination) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
    const manifest = await verifySkillScannerResources(destination, runtime, release.manifestSha256)
    return { directory: destination, runtimeDirectory: runtime, manifest }
  }
  const run = async (signal: AbortSignal): Promise<SkillScannerVerifiedResources> => {
    let stage: string | undefined
    try {
      cancelled(signal)
      const existing = await ready(); cancelled(signal)
      if (existing) { update(cleanStatus('ready', release.archiveSizeBytes)); return existing }
      await verifySkillScannerDirectoryPath(cache, true); await mkdir(cache, { recursive: true }); await verifySkillScannerDirectoryPath(cache)
      const required = release.archiveSizeBytes + release.extractedSizeBytes + 64 * 1024 * 1024
      if (await io.freeBytes(cache) < required) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DISK_SPACE')
      cancelled(signal)
      stage = await mkdtemp(join(cache, '.prepare-'))
      const archive = join(stage, 'payload.zip'), output = join(stage, 'resources')
      update(cleanStatus('downloading', 0))
      const response = await io.open(new URL(release.archiveUrl), signal)
      try {
        if (response.status !== 200) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED')
        const length = response.headers['content-length']
        if (length !== undefined && length !== String(release.archiveSizeBytes)) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID')
        const writer = await open(archive, 'wx', 0o600), hash = createHash('sha256')
        let received = 0
        try {
          for await (const bytes of downloadBody(response.body)) {
            cancelled(signal); received += bytes.byteLength
            if (received > release.archiveSizeBytes) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID')
            hash.update(bytes)
            let offset = 0
            while (offset < bytes.byteLength) { const written = await writer.write(bytes, offset); if (written.bytesWritten === 0) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED'); offset += written.bytesWritten }
            update({ ...current, receivedBytes: received })
          }
        } finally { await writer.close() }
        if (received !== release.archiveSizeBytes || hash.digest('hex') !== release.archiveSha256) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID')
      } finally { await response.close() }
      cancelled(signal)
      await preflightResourceArchive(archive, release, signal)
      await extractZip(archive, { dir: output, defaultDirMode: 0o700, defaultFileMode: 0o600, onEntry: () => cancelled(signal) })
      const manifest = await verifySkillScannerResources(output, runtime, release.manifestSha256)
      cancelled(signal)
      await verifySkillScannerDirectoryPath(cache)
      // Never replace an existing/corrupt cache or another version; rename's destination is absent.
      try { await lstat(destination); throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID') }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
      await rename(output, destination)
      update(cleanStatus('ready', release.archiveSizeBytes))
      return { directory: destination, runtimeDirectory: runtime, manifest }
    } catch (error) {
      const failure = signal.aborted || disposed ? new SkillScannerResourceError('SKILL_SAFETY_CANCELLED', error)
        : error instanceof SkillScannerResourceError ? error : new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID', error)
      update({ ...current, state: 'failed', code: failure.code }); throw failure
    } finally { if (stage !== undefined) await removeOwnedStage(stage, cache) }
  }
  return {
    status: async signal => {
      cancelled(signal)
      if (flight) return current
      try {
        const existing = await ready(); cancelled(signal)
        if (existing) update(cleanStatus('ready', release.archiveSizeBytes))
        else if (current.state === 'ready') update(cleanStatus('missing', 0))
      } catch (error) {
        cancelled(signal)
        update({ ...current, state: 'failed', code: 'SKILL_SAFETY_RESOURCE_INVALID' })
      }
      return current
    },
    prepare: (signal, progress) => {
      try { cancelled(signal) } catch (error) { return Promise.reject(error) }
      if (!flight) {
        const controller = new AbortController(), waiters = new Set<Waiter>()
        const work = run(controller.signal)
        const owned: Flight = { controller, waiters, work }
        flight = owned
        void work.finally(() => { if (flight === owned) flight = undefined }).catch(() => { /* Each waiter receives the failure; dispose awaits the same owned work. */ })
      }
      const owned = flight, waiter: Waiter = { ...(progress === undefined ? {} : { progress }) }
      owned.waiters.add(waiter)
      return new Promise((accept, reject) => {
        let settled = false
        const cleanup = () => { signal.removeEventListener('abort', abort); owned.waiters.delete(waiter) }
        const abort = () => {
          if (settled) return
          settled = true; cleanup()
          const rejectCancelled = () => reject(new SkillScannerResourceError('SKILL_SAFETY_CANCELLED'))
          if (owned.waiters.size === 0) { owned.controller.abort(); void owned.work.then(rejectCancelled, rejectCancelled) }
          else rejectCancelled()
        }
        signal.addEventListener('abort', abort, { once: true })
        owned.work.then(value => { if (settled) return; settled = true; cleanup(); if (signal.aborted) reject(new SkillScannerResourceError('SKILL_SAFETY_CANCELLED')); else accept(value) }, error => { if (settled) return; settled = true; cleanup(); reject(error) })
        if (signal.aborted) abort()
      })
    },
    dispose: async () => {
      disposed = true
      const owned = flight
      if (owned) { owned.controller.abort(); try { await owned.work } catch (error) { /* The owned flight records its failure and performs cleanup before settlement. */ } }
    },
  }
}

// Transport interruptions permit a retry; they do not establish corrupt resource bytes.
async function* downloadBody(body: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  try { for await (const bytes of body) yield bytes }
  catch (error) { throw error instanceof SkillScannerResourceError ? error : new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED', error) }
}

type ZipEntry = Parameters<NonNullable<extractZip.Options['onEntry']>>[0]
type ZipFile = Parameters<NonNullable<extractZip.Options['onEntry']>>[1]
// Use extract-zip's own maintained parser/locked dependency, without adding a second ZIP implementation.
const zipReader: { open: (path: string, options: { lazyEntries: boolean; strictFileNames: boolean }, callback: (error: Error | null, file?: ZipFile) => void) => void } = createRequire(createRequire(import.meta.url).resolve('extract-zip'))('yauzl')
async function preflightResourceArchive(path: string, release: SkillScannerRelease, signal: AbortSignal): Promise<void> {
  const entries = new Map<string, number>()
  const aliases = new Set<string>()
  let manifest: SkillScannerResourceManifest | undefined, total = 0
  await new Promise<void>((accept, reject) => zipReader.open(path, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
    if (error || !zip) { reject(new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID', error)); return }
    const fail = (cause: unknown) => { zip.close(); reject(new SkillScannerResourceError(signal.aborted ? 'SKILL_SAFETY_CANCELLED' : 'SKILL_SAFETY_RESOURCE_INVALID', cause)) }
    const abort = () => fail(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    zip.once('error', fail)
    zip.once('close', () => signal.removeEventListener('abort', abort))
    zip.once('end', () => {
      if (entries.size !== release.fileCount || total !== release.extractedSizeBytes || !manifest || entries.size !== manifest.files.length + 1) { fail(Error()); return }
      for (const file of manifest.files) if (entries.get(file.path) !== file.size) { fail(Error()); return }
      accept()
    })
    zip.on('entry', (entry: ZipEntry) => {
      void (async () => {
        signal.throwIfAborted(); validateSkillScannerRelativePath(entry.fileName)
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000
        if ((mode !== 0 && mode !== 0o100000) || entry.fileName.endsWith('/') || entry.externalFileAttributes === 16 || aliases.has(entry.fileName.toLowerCase())) throw Error()
        aliases.add(entry.fileName.toLowerCase()); entries.set(entry.fileName, entry.uncompressedSize); total += entry.uncompressedSize
        if (entries.size > release.fileCount || total > release.extractedSizeBytes || entry.uncompressedSize > 256 * 1024 * 1024) throw Error()
        if (entry.fileName === 'scanner-manifest.json') {
          if (entry.uncompressedSize > 8 * 1024 * 1024) throw Error()
          const stream = await new Promise<AsyncIterable<unknown>>((resolve, reject) => zip.openReadStream(entry, (error, stream) => { if (error || !stream) reject(error); else resolve(stream) }))
          const parts: Uint8Array[] = []; let size = 0
          for await (const part of stream) { signal.throwIfAborted(); if (!(part instanceof Uint8Array)) throw Error(); size += part.byteLength; if (size > 8 * 1024 * 1024) throw Error(); parts.push(part) }
          const bytes = Buffer.concat(parts)
          if (createHash('sha256').update(bytes).digest('hex') !== release.manifestSha256) throw Error()
          manifest = scannerResourceSchema.parse(JSON.parse(bytes.toString('utf8')))
        }
        zip.readEntry()
      })().catch(fail)
    })
    if (signal.aborted) abort(); else zip.readEntry()
  }))
}
async function removeOwnedStage(stage: string, cache: string): Promise<void> {
  if (dirname(stage) !== cache || !basename(stage).startsWith('.prepare-')) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID')
  await verifySkillScannerDirectoryPath(stage)
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) await unlink(path)
      else if (entry.isDirectory()) { await walk(path); await rmdir(path) }
      else await unlink(path)
    }
  }
  await walk(stage); await rmdir(stage)
}
async function openResourceResponse(url: URL, signal: AbortSignal): Promise<SkillScannerDownloadReply> {
  const resolver: LookupFunction = (hostname, options, callback) => lookup(hostname, { all: true }, (error, rows) => {
    if (error) { callback(error, []); return }
    if (!rows.length || rows.some(row => !isPublicSkillSourceAddress(row.address))) { callback(new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID'), []); return }
    const row = rows.find(row => !options.family || row.family === options.family)
    if (!row) { callback(new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID'), []); return }
    if (options.all) callback(null, rows); else callback(null, row.address, row.family)
  })
  return new Promise((accept, reject) => {
    const outgoing = request(url, { method: 'GET', agent: false, lookup: resolver, signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]), headers: { accept: 'application/zip', 'user-agent': 'StudyBuddy-Skill-Safety' } }, incoming => {
      const raw: AsyncIterable<unknown> = incoming
      const body = (async function* () { for await (const part of raw) { if (!(part instanceof Uint8Array)) throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID'); yield part } })()
      const length = incoming.headers['content-length']
      const responseClosed = incoming.closed ? Promise.resolve() : new Promise<void>(resolve => incoming.once('close', () => resolve()))
      accept({ status: incoming.statusCode ?? 502, headers: typeof length === 'string' ? { 'content-length': length } : {}, body,
        close: async () => { incoming.destroy(); outgoing.destroy(); await Promise.all([responseClosed, requestClosed]) },
      })
    })
    // A slow but active transfer may exceed five minutes; a stalled socket must still stop.
    outgoing.setTimeout(5 * 60_000, () => outgoing.destroy(new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED')))
    const requestClosed = new Promise<void>(resolve => outgoing.once('close', () => resolve()))
    outgoing.once('error', error => reject(new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED', error))); outgoing.end()
  })
}
