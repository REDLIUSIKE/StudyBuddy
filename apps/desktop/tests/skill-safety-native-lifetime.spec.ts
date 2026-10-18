import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionId } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import { parseSkillSafetyPrepared, parseSkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/wire'
import type { SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import type { OwnedScope } from '@studybuddy/contracts'
import type { MainSession } from '../src/studybuddy/services.ts'
import { SkillSafetyMain } from '../src/studybuddy/skill-safety-main.ts'

const pipeFixture = fileURLToPath(new URL('./fixtures/skill-safety-native-inventory.mjs', import.meta.url))
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'safety-native-lifetime-'))
  const credentialFile = join(directory, 'fixture-credential'), bootsFile = join(directory, 'boots.jsonl'), releaseFile = join(directory, 'release.json'), exitFile = join(directory, 'exit-once')
  const scope: OwnedScope = { accountId: 'original-fixture', generation: 1 }, sessionId = SessionId('native-lifetime-session')
  const hostGeneration = 'native-lifetime-host', actor = { ...scope, sessionId }
  let credential = 'fixture-first'
  await writeFile(credentialFile, credential)
  const hash = 'a'.repeat(64)
  await writeFile(releaseFile, JSON.stringify({ schemaVersion: 1, target: 'win32-x64', pythonVersion: '3.12.14', scannerVersion: '2.2.2', archiveUrl: 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/' + hash + '.zip', archiveSha256: hash, archiveSizeBytes: 42, manifestSha256: hash, extractedSizeBytes: 100, fileCount: 4 }))
  const unexpected = async (): Promise<never> => { throw new Error('Inventory cannot download or call an inference service') }
  const host = {
    builtinContext: (current: OwnedScope) => ({ scope: current, hostGeneration }),
    async skillSafetyCommand(action: string): Promise<unknown> {
      if (action === 'scope') return null
      if (action === 'begin-session') return { workspaceId: 'fixture-workspace', sessionId }
      if (action === 'bind') return actor
      throw new Error('Unexpected model or registry action')
    },
  }
  const main = new SkillSafetyMain({
    auth: { scope: () => scope, withSession: async <T>(run: (session: MainSession) => Promise<T>) => run({ scope, accessToken: credential }) },
    host: () => host, userDataDirectory: directory, harnessHome: () => join(directory, 'harness', scope.accountId),
    runtimeDirectory: directory, releaseFile, version: 'fixture',
    nativeRuntime: { start: async () => spawn(process.execPath, [pipeFixture, credentialFile, bootsFile, exitFile], { windowsHide: true, stdio: 'pipe', env: {} }) },
    consumer: { consumerCatalog: unexpected, prepareConsumerRequest: unexpected, consumerRequestStatus: unexpected },
    platform: { consumerCatalog: unexpected, prepareAigcRequest: unexpected }, fetch: unexpected,
  })
  await main.begin('native-lifetime-entry')
  const context = { actor, hostGeneration }
  return {
    main,
    async find(request: string) {
      const signal = new AbortController().signal
      const prepared = parseSkillSafetyPrepared(await main.handle({ rpcId: randomUUID(), context,
        operation: { kind: 'preflight', command: { kind: 'find', requestId: brandString<SkillSafetyRequestId>(request), query: 'PDF' } } }, signal))
      expect(prepared.question).toBeUndefined()
      const executable = { intentId: prepared.intentId, requestId: prepared.requestId, argumentDigest: prepared.argumentDigest }
      try {
        return parseSkillSafetyResult(await main.handle({ rpcId: randomUUID(), context, operation: { kind: 'execute', prepared: executable } }, signal))
      } finally { await main.handle({ rpcId: randomUUID(), context, operation: { kind: 'release', prepared: executable } }, signal) }
    },
    async refresh() { credential = 'fixture-refreshed'; await writeFile(credentialFile, credential) },
    async exitOnNextRequest() { await writeFile(exitFile, 'fixture-only') },
    async boots() { return (await readFile(bootsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) },
    async close() { await main.dispose(); await rm(directory, { recursive: true }) },
  }
}

it('same-account credential refresh preserves source lookup through a current private bootstrap', async () => {
  const f = await fixture()
  try {
    await expect(f.find('before-refresh')).resolves.toMatchObject({ kind: 'candidates', value: { status: 'matches', candidates: [{ displayName: 'fixture-pdf', sourceLabel: 'Claude Code' }] } })
    await f.refresh()
    await expect(f.find('after-refresh')).resolves.toMatchObject({ kind: 'candidates', value: { status: 'matches', candidates: [{ displayName: 'fixture-pdf', sourceLabel: 'Claude Code' }] } })
    expect((await f.boots()).map(row => row.credential)).toEqual(['fixture-first', 'fixture-refreshed'])
  } finally { await f.close() }
})

it('an exited private pipe is reported once and retired for the next explicit lookup', async () => {
  const f = await fixture()
  try {
    await f.exitOnNextRequest()
    await expect(f.find('exited-pipe')).resolves.toMatchObject({ kind: 'candidates', value: { status: 'incomplete', candidates: [], failure: { code: 'SKILL_SAFETY_INVENTORY_INCOMPLETE', action: 'retry' } } })
    expect(await f.boots()).toHaveLength(1)
    await expect(f.find('explicit-retry')).resolves.toMatchObject({ kind: 'candidates', value: { status: 'matches', candidates: [{ displayName: 'fixture-pdf' }] } })
    expect(await f.boots()).toHaveLength(2)
  } finally { await f.close() }
})

it('concurrent lookups share the current bootstrap without racing its disposal', async () => {
  const f = await fixture()
  try {
    await f.find('before-concurrent-refresh'); await f.refresh()
    const results = await Promise.all([f.find('concurrent-a'), f.find('concurrent-b')])
    expect(results).toEqual([
      expect.objectContaining({ kind: 'candidates', value: expect.objectContaining({ status: 'matches', candidates: [expect.objectContaining({ displayName: 'fixture-pdf' })] }) }),
      expect.objectContaining({ kind: 'candidates', value: expect.objectContaining({ status: 'matches', candidates: [expect.objectContaining({ displayName: 'fixture-pdf' })] }) }),
    ])
    expect((await f.boots()).map(row => row.credential)).toEqual(['fixture-first', 'fixture-refreshed'])
  } finally { await f.close() }
})
