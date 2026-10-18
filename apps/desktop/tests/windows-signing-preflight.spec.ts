import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createPackagingRun } from '../scripts/packaging-run.mjs'
import { preflightWindowsSigning } from '../scripts/windows-signing-preflight.ts'
import { STUDYBUDDY_EVSIGN_CLI_PATH, STUDYBUDDY_EVSIGN_CLI_SHA256,
  STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT } from '../scripts/studybuddy-evsign.mjs'

const roots: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('rejects a missing protected EV licence before compiling or signing', async () => {
  const options = await fixture()
  options.environment.STUDYBUDDY_EVSIGN_LICENSE = ''
  await expect(preflightWindowsSigning(options)).rejects.toThrow('licence is missing')
  expect(options.verifyCli).not.toHaveBeenCalled()
})

it('validates the fixed EV signing client without submitting an unreviewed synthetic executable', async () => {
  const options = await fixture()
  await preflightWindowsSigning(options)
  expect(options.sequence).toEqual(['verify-cli'])
  expect(await readFile(join(options.runDirectory, 'events.jsonl'), 'utf8')).toContain('signing-preflight-success')
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'signing-preflight-'))
  roots.push(root)
  const run = createPackagingRun(join(root, 'records'), {})
  const environment = { SystemRoot: root,
    STUDYBUDDY_EVSIGN_LICENSE: '01234567-89ab-cdef-0123-456789abcdef' }
  const sequence: string[] = []
  const verifyCli = vi.fn(async () => {
    sequence.push('verify-cli')
    return { path: STUDYBUDDY_EVSIGN_CLI_PATH, sha256: STUDYBUDDY_EVSIGN_CLI_SHA256,
      thumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT }
  })
  return { root, sequence, runDirectory: run.directory, environment, verifyCli }
}

it('records the fixed signing client identity before success', async () => {
  const options = await fixture()
  await preflightWindowsSigning(options)
  expect(options.sequence).toEqual(['verify-cli'])
  const events = await readFile(join(options.runDirectory, 'events.jsonl'), 'utf8')
  expect(events).toContain('signing-preflight-success')
  expect(events).toContain('"syntheticExecutableSubmitted":false')
  expect(events).not.toContain('fixture-pin')
})

it.each(['fatal', 'audit', 'cli'] as const)
('rejects static %s failure without successful evidence', async (failure) => {
  const options = await fixture()
  if (failure === 'fatal') await writeFile(join(options.runDirectory, 'fatal.json'), 'failed')
  else if (failure === 'cli') options.verifyCli.mockRejectedValueOnce(new Error('reviewed CLI changed'))
  else {
    await rm(join(options.runDirectory, 'events.jsonl'))
    await mkdir(join(options.runDirectory, 'events.jsonl'))
  }
  await expect(preflightWindowsSigning(options)).rejects.toThrow()
  if (failure === 'fatal') expect(options.verifyCli).not.toHaveBeenCalled()
  else expect(options.verifyCli).toHaveBeenCalledOnce()
})
