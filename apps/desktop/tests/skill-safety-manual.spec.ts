import { it, expect, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillSafetyMain } from '../src/studybuddy/skill-safety-main.ts'
const resource = vi.hoisted(() => ({ status: vi.fn(), prepare: vi.fn(), dispose: vi.fn(async () => {}) }))
vi.mock('../src/studybuddy/skill-safety-download.ts', () => ({ createSkillScannerDownload: () => resource }))
const status = { state: 'ready', scannerVersion: '2.2.2', receivedBytes: 42, totalBytes: 42 }
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'safety-manual-')), file = join(directory, 'release.json')
  const hash = 'a'.repeat(64)
  await writeFile(file, JSON.stringify({ schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14', scannerVersion: '2.2.2', archiveUrl: 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/' + hash + '.zip', archiveSha256: hash, archiveSizeBytes: 42, manifestSha256: hash, extractedSizeBytes: 100, fileCount: 4 }))
  let scope = { accountId: 'manual-fixture', generation: 1 }
  const host = { skillSafetyCommand: vi.fn(async () => null), builtinContext: vi.fn() }, consumer = { consumerCatalog: vi.fn() }
  const main = new SkillSafetyMain({ auth: { scope: () => scope, withSession: vi.fn() }, host: () => host, userDataDirectory: directory, harnessHome: () => join(directory, 'harness', scope.accountId), runtimeDirectory: directory, releaseFile: file, version: 'fixture', nativeRuntime: {} as never, consumer: consumer as never, platform: consumer as never, fetch: vi.fn() })
  const owner = { lease: 'manual-owner', scope: { ...scope }, moduleId: 'sha256:' + hash }
  return { main, owner, host, consumer, change: () => { scope = { ...scope, generation: 2 } }, close: async () => { await main.dispose(); await rm(directory, { recursive: true }) } }
}
it('manual status and preparation never create a session or call a model', async () => {
  resource.status.mockResolvedValue(status); resource.prepare.mockResolvedValue({})
  const f = await fixture()
  try {
    await expect(f.main.manual(f.owner, 'getSkillSafetyScannerStatus', [])).resolves.toEqual(status)
    await expect(f.main.manual(f.owner, 'prepareSkillSafetyScanner', [{ requestId: 'download' }])).resolves.toEqual(status)
    expect(f.host.skillSafetyCommand).not.toHaveBeenCalled(); expect(f.consumer.consumerCatalog).not.toHaveBeenCalled()
  } finally { await f.close() }
})
it('cancels only the initiating owner and awaits the real preparation waiter', async () => {
  let finish!: () => void, seen!: AbortSignal
  resource.prepare.mockImplementation(signal => new Promise<void>(resolve => { seen = signal; finish = resolve }))
  const f = await fixture()
  try {
    const run = f.main.manual(f.owner, 'prepareSkillSafetyScanner', [{ requestId: 'download' }]); void run.catch(() => {})
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await f.main.manual({ ...f.owner, lease: 'other' }, 'cancelSkillSafetyScannerPreparation', [{ requestId: 'download' }]); expect(seen.aborted).toBe(false)
    const cancel = f.main.manual(f.owner, 'cancelSkillSafetyScannerPreparation', [{ requestId: 'download' }])
    expect(seen.aborted).toBe(true); finish()
    await expect(run).rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' }); await cancel
  } finally { await f.close() }
})
it('account change rejects late readiness and revocation stops pending manual work', async () => {
  let finish!: () => void, seen!: AbortSignal
  resource.prepare.mockImplementation(signal => new Promise<void>(resolve => { seen = signal; finish = resolve }))
  const f = await fixture()
  try {
    const run = f.main.manual(f.owner, 'prepareSkillSafetyScanner', [{ requestId: 'download' }]); void run.catch(() => {})
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); f.change()
    const stopped = f.main.revoke(); expect(seen.aborted).toBe(true); finish()
    await expect(run).rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' }); await stopped
    await expect(f.main.manual(f.owner, 'getSkillSafetyScannerStatus', [])).rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
  } finally { await f.close() }
})
