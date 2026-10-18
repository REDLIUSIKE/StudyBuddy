/** Check the fixed production signing client before preparing release artifacts. */
import { access, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  STUDYBUDDY_EVSIGN_CLI_PATH,
  STUDYBUDDY_EVSIGN_CLI_SHA256,
  STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT,
  STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT,
  validateStudyBuddyEvSignEnvironment,
  verifyStudyBuddyEvSignCli,
} from './studybuddy-evsign.mjs'
import { failPackagingRun, recordPackagingEvent } from './packaging-run.mjs'

interface SigningPreflightOptions {
  runDirectory: string
  environment: NodeJS.ProcessEnv
  verifyCli?: typeof verifyStudyBuddyEvSignCli
}

/**
 * Validate the fixed reviewed CLI and protected licence shape before artifact preparation.
 * The provider only accepts reviewed product binaries, so actual service access, product
 * certificate identity, and timestamping are proved by signing every release executable.
 * @param options Supervised evidence directory, file-owned settings and isolated test adapters.
 * @returns Resolves after static verification; failures retain supervised evidence.
 */
export async function preflightWindowsSigning(options: SigningPreflightOptions): Promise<void> {
  const { environment, runDirectory } = options
  const record = (event: object): void => { recordPackagingEvent(runDirectory, event) }
  validateStudyBuddyEvSignEnvironment(environment)
  await access(join(runDirectory, 'run.json'))
  for (const path of [join(runDirectory, 'fatal.json')]) {
    try { await lstat(path) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    throw new Error(`Windows signing preflight refused: inspect retained failure or interlock at ${path}; no automatic recovery`)
  }
  const cli = await (options.verifyCli ?? verifyStudyBuddyEvSignCli)()
  record({ type: 'signing-preflight-static',
    evSignCli: STUDYBUDDY_EVSIGN_CLI_PATH, evSignCliSha256: STUDYBUDDY_EVSIGN_CLI_SHA256,
    evSignCliSignerThumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT,
    productSignerThumbprint: STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT })
  record({ type: 'signing-preflight-success', cli, syntheticExecutableSubmitted: false })
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Windows signing preflight requires Windows')
  const runDirectory = process.env.DSH_DESKTOP_PACKAGING_RUN_DIR
  if (!runDirectory) throw new Error('Windows signing preflight requires a supervised packaging run')
  try { await preflightWindowsSigning({ runDirectory, environment: process.env }) }
  catch (error) {
    failPackagingRun(runDirectory, 'windows-signing-preflight-failed')
    throw error
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) await main()
