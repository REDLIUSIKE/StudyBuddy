import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { createSkillScannerDownload, type SkillScannerDownloadDependencies } from '../src/studybuddy/skill-safety-download.ts'
import { parseSkillScannerRelease } from '../src/studybuddy/skill-safety-release.ts'

const roots: string[] = []
const downloads: ReturnType<typeof createSkillScannerDownload>[] = []
afterEach(async () => { for (const download of downloads.splice(0)) await download.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function fixture(extra: Record<string, Uint8Array> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'skill-scanner-download-')); roots.push(root)
  const runtimeDirectory = join(root, 'installed-runtime'), cacheDirectory = join(root, 'resources')
  await mkdir(join(runtimeDirectory, 'dependencies/python'), { recursive: true })
  const inert = Buffer.from('inert resource fixture')
  await writeFile(join(runtimeDirectory, 'dependencies/python/python.exe'), inert)
  const entries: Record<string, Uint8Array> = Object.fromEntries(['worker.py', 'transport.py', 'network.py'].map(path => [path, inert]))
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14', upstream: { repository: 'https://github.com/cisco-ai-defense/skill-scanner', version: '2.2.2', commit: 'ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a' },
    lockDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64), files: Object.entries(entries).map(([path, bytes]) => ({ path, size: bytes.length, sha256: sha(bytes) })), runtimeFiles: [{ path: 'python.exe', size: inert.length, sha256: sha(inert) }] }))
  entries['scanner-manifest.json'] = manifest
  const archive = zipSync({ ...entries, ...extra })
  const release = { schemaVersion: 1 as const, target: 'win32-x64' as const, pythonVersion: '3.12.14' as const, scannerVersion: '2.2.2' as const,
    archiveSha256: sha(archive), archiveUrl: 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/' + sha(archive) + '.zip', archiveSizeBytes: archive.length,
    manifestSha256: sha(manifest), extractedSizeBytes: Object.values(entries).reduce((sum, value) => sum + value.length, 0), fileCount: Object.keys(entries).length }
  let requests = 0
  const dependencies: SkillScannerDownloadDependencies = { open: async (url, signal) => {
    requests++; expect(url.href).toBe(release.archiveUrl); signal.throwIfAborted()
    return { status: 200, headers: { 'content-length': String(archive.length) }, body: (async function* () { yield archive })(), close: async () => {} }
  }, freeBytes: async () => 1024 ** 3 }
  return { root, runtimeDirectory, cacheDirectory, release, archive, dependencies, requests: () => requests }
}
function create(input: Awaited<ReturnType<typeof fixture>>, dependencies = input.dependencies) {
  const download = createSkillScannerDownload(input, dependencies); downloads.push(download); return download
}
it('validates the locally trusted fixed release descriptor', async () => {
  const input = await fixture()
  expect(parseSkillScannerRelease(input.release)).toEqual(input.release)
})
it.each(['https://other.invalid/a.zip', 'http://guijitongzhuo.com/a.zip', 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/a.zip?token=secret'])('rejects a descriptor that expands download authority: %s', async (archiveUrl) => {
  const input = await fixture(); expect(() => parseSkillScannerRelease({ ...input.release, archiveUrl })).toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('missing_resources_prepare_from_fixed_server with actual extracted bytes and progress', async () => {
  const input = await fixture(), download = create(input), progress: number[] = []
  expect((await download.status(new AbortController().signal)).state).toBe('missing'); expect(input.requests()).toBe(0)
  const ready = await download.prepare(new AbortController().signal, status => progress.push(status.receivedBytes))
  expect(await readFile(join(ready.directory, 'worker.py'), 'utf8')).toBe('inert resource fixture')
  expect((await download.status(new AbortController().signal)).state).toBe('ready'); expect(progress).toContain(input.archive.length)
})
it('ready_cache_never_fetches even after a new manager is created', async () => {
  const input = await fixture(); await create(input).prepare(new AbortController().signal)
  const download = create(input); await download.prepare(new AbortController().signal)
  expect(input.requests()).toBe(1)
})
it('manual_and_helper_share_download', async () => {
  const input = await fixture(), download = create(input)
  const [manual, helper] = await Promise.all([download.prepare(new AbortController().signal), download.prepare(new AbortController().signal)])
  expect(manual.directory).toBe(helper.directory); expect(input.requests()).toBe(1)
})
it('bad_digest_blocks_readiness and leaves only owned cleanup', async () => {
  const input = await fixture(), download = create(input, { ...input.dependencies, open: async () => ({ status: 200, headers: {}, body: (async function* () { yield Buffer.alloc(input.archive.length) })(), close: async () => {} }) })
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
  expect((await download.status(new AbortController().signal)).state).not.toBe('ready')
  expect(await readdir(input.cacheDirectory)).toEqual([])
})
it('a broken response remains retryable and is not reported as corrupt resources', async () => {
  const input = await fixture(); let attempts = 0, closed = 0
  const download = create(input, { ...input.dependencies, open: async () => ({ status: 200, headers: {},
    body: (async function* () {
      if (++attempts === 1) { yield input.archive.subarray(0, 1); throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' }) }
      yield input.archive
    })(), close: async () => { closed++ },
  }) })
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED')
  expect(await readdir(input.cacheDirectory)).toEqual([])
  const ready = await download.prepare(new AbortController().signal)
  expect(await readFile(join(ready.directory, 'worker.py'), 'utf8')).toBe('inert resource fixture')
  expect(attempts).toBe(2); expect(closed).toBe(2)
})
it.each(['__MACOSX/hidden.py', 'extra.py', 'outside:stream', '../escape.py'])('unexpected or unsafe archive entries block readiness: %s', async (name) => {
  const input = await fixture({ [name]: Buffer.from('unexpected') }), download = create(input)
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
  expect((await download.status(new AbortController().signal)).state).not.toBe('ready')
})
it('disk_failure_preserves_other_verified_version and never requests bytes', async () => {
  const input = await fixture(); await mkdir(join(input.cacheDirectory, 'existing-version'), { recursive: true }); await writeFile(join(input.cacheDirectory, 'existing-version/keep'), 'preserve')
  const download = create(input, { ...input.dependencies, freeBytes: async () => 0 })
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_DISK_SPACE')
  expect(input.requests()).toBe(0); expect(await readFile(join(input.cacheDirectory, 'existing-version/keep'), 'utf8')).toBe('preserve')
})
it('stale_prepare_receipt_cannot_skip_byte_verification', async () => {
  const input = await fixture(), download = create(input), ready = await download.prepare(new AbortController().signal)
  await writeFile(join(ready.directory, 'worker.py'), 'changed')
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_RESOURCE_INVALID')
})
it('a removed cache cannot leave a stale ready status', async () => {
  const input = await fixture(), download = create(input), ready = await download.prepare(new AbortController().signal)
  await rm(ready.directory, { recursive: true })
  expect((await download.status(new AbortController().signal)).state).toBe('missing')
})
it.each([{ status: 302, headers: {} }, { status: 200, headers: { 'content-length': '1' } }])('early response rejection closes the owned body: %j', async reply => {
  const input = await fixture(); let closed = 0
  const download = create(input, { ...input.dependencies, open: async () => ({ ...reply,
    body: (async function* () { yield input.archive })(), close: async () => { closed++ },
  }) })
  await expect(download.prepare(new AbortController().signal)).rejects.toThrow()
  expect(closed).toBe(1); expect(await readdir(input.cacheDirectory)).toEqual([])
})
it('last_caller_cancel_leaves_no_ready_cache and awaits owned cleanup', async () => {
  const input = await fixture(), caller = new AbortController(); let bodyClosed = false
  let started!: () => void
  const reading = new Promise<void>(resolve => { started = resolve })
  const download = create(input, { ...input.dependencies, open: async (_url, signal) => ({ status: 200, headers: {},
    body: (async function* () {
      try {
        started(); yield input.archive.subarray(0, 1)
        await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }) })
        signal.throwIfAborted()
      } finally { bodyClosed = true }
    })(), close: async () => { bodyClosed = true },
  }) })
  const preparation = download.prepare(caller.signal); const settled = expect(preparation).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  await reading; caller.abort(); await settled
  expect(bodyClosed).toBe(true); expect(await readdir(input.cacheDirectory)).toEqual([])
})
it('one_caller_cancel_preserves_other_waiter', async () => {
  const input = await fixture(), caller = new AbortController(); let closed = 0, requests = 0
  let started!: () => void, continueReading!: () => void
  const reading = new Promise<void>(resolve => { started = resolve }), continuing = new Promise<void>(resolve => { continueReading = resolve })
  const download = create(input, { ...input.dependencies, open: async (_url, signal) => {
    requests++; return { status: 200, headers: {}, body: (async function* () {
      started(); await continuing; signal.throwIfAborted(); yield input.archive
    })(), close: async () => { closed++ } }
  } })
  const manual = download.prepare(caller.signal), helper = download.prepare(new AbortController().signal)
  const cancelled = expect(manual).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  await reading; caller.abort(); await cancelled; expect(closed).toBe(0)
  continueReading(); const ready = await helper
  expect(requests).toBe(1); expect(closed).toBe(1); expect(await readFile(join(ready.directory, 'network.py'), 'utf8')).toBe('inert resource fixture')
})
it('dispose awaits downloading resources and never leaves owned staging', async () => {
  const input = await fixture(); let started!: () => void
  const reading = new Promise<void>(resolve => { started = resolve })
  const download = create(input, { ...input.dependencies, open: async (_url, signal) => ({ status: 200, headers: {},
    body: (async function* () {
      started(); await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }) }); signal.throwIfAborted()
    })(), close: async () => {},
  }) })
  const settled = expect(download.prepare(new AbortController().signal)).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  await reading; await download.dispose(); await settled
  expect(await readdir(input.cacheDirectory)).toEqual([])
})
