/** Real anonymous HTTPS/download/cache qualification, distinct from client and paid-model acceptance. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createSkillScannerDownload } from '../../apps/desktop/src/studybuddy/skill-safety-download.ts'
import { parseSkillScannerRelease } from '../../apps/desktop/src/studybuddy/skill-safety-release.ts'
const { values } = parseArgs({ options: { release: { type: 'string' }, runtime: { type: 'string' }, cache: { type: 'string' }, receipt: { type: 'string' } } })
if (!values.release || !values.runtime || !values.receipt || process.platform !== 'win32') throw Error('Pass --release --runtime --receipt on Windows; --cache selects a private acceptance cache')
const release = parseSkillScannerRelease(JSON.parse(await readFile(resolve(values.release), 'utf8')))
const cacheDirectory = resolve(values.cache ?? join(import.meta.dirname, '../../.dsh-build/skill-scanner-public-acceptance/win32-x64'))
const manager = createSkillScannerDownload({ release, cacheDirectory, runtimeDirectory: resolve(values.runtime) })
const start = performance.now(), signal = AbortSignal.timeout(360_000); let lastQuarter = -1, receivedBytes = 0
try {
  const initial = await manager.status(signal)
  assert.equal(initial.state, 'missing', 'Use a new owned cache to establish real public GET evidence')
  const ready = await manager.prepare(signal, status => {
    receivedBytes = status.receivedBytes
    const quarter = Math.floor(status.receivedBytes * 4 / status.totalBytes)
    if (quarter !== lastQuarter) { lastQuarter = quarter; console.log(JSON.stringify({ phase: status.state, receivedBytes: status.receivedBytes, totalBytes: status.totalBytes })) }
  })
  assert.equal(receivedBytes, release.archiveSizeBytes); assert.equal(ready.manifest.upstream.version, release.scannerVersion)
  assert.equal((await manager.status(signal)).state, 'ready')
  const cachedPhases: string[] = []
  await manager.prepare(signal, status => cachedPhases.push(status.state))
  assert(!cachedPhases.includes('downloading'))
  const receipt = { schemaVersion: 1, checkedAt: '2026-10-13', status: 'PASS', release, resourcesDirectory: ready.directory,
    runtimeDirectory: ready.runtimeDirectory, actualHttpsGetVerifiedBytes: receivedBytes, cachedPrepareReportedNoDownload: true,
    elapsedMs: Math.round(performance.now() - start), paidRequests: 0, clientInstalledAcceptance: false }
  await writeFile(resolve(values.receipt), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(receipt))
} finally { await manager.dispose() }
