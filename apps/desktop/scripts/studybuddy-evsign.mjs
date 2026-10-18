/** Fixed Windows EV code-signing adapter for the StudyBuddy Electron release. */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'

export const STUDYBUDDY_EVSIGN_CLI_PATH = 'C:\\Users\\Public\\StudyBuddyReleaseRunner\\tools\\EvSignClientConsole-1.0.1.0.exe'
export const STUDYBUDDY_EVSIGN_CLI_SHA256 = 'b1b2168a1d0ea757f26db18ac2e2b14e06fb74021f0d67add5e6be1a47dffd97'
export const STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT = '6DCBCC70A507DCAE74135DCB57047CC3365E9F03'
// Product owner explicitly approved this exact certificate rotation on 2026-10-16.
export const STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT = 'EC6346287B2F343CB7BFA4CF4CAB7DB02379A0AD'
export const STUDYBUDDY_EVSIGN_TIMESTAMP_SERVER = 'http://timestamp.digicert.com'
export const STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER = 'CN=Keroro Software Ltd,O=Keroro Software Ltd,C=CN'

const execFileAsync = promisify(execFile)
const LICENCE_PATTERN = /^[\dA-F]{8}-(?:[\dA-F]{4}-){3}[\dA-F]{12}$/iu

/** Validate the one secret the protected Electron build may receive. */
export function validateStudyBuddyEvSignEnvironment(environment) {
  const licence = environment.STUDYBUDDY_EVSIGN_LICENSE ?? ''
  if (!LICENCE_PATTERN.test(licence)) throw new Error('StudyBuddy EV Sign licence is missing or invalid')
  for (const retired of ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD']) {
    if (environment[retired] !== undefined) throw new Error(`StudyBuddy EV Sign rejects retired updater secret ${retired}`)
  }
  return { licence }
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
    : left === right
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function sanitizedOutput(value, licence) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : ''
  return text.replaceAll(licence, '<redacted>').trim()
}

function executionFailure(error, path, licence) {
  const record = error !== null && typeof error === 'object' ? error : undefined
  const code = record !== undefined && 'code' in record
    && (typeof record.code === 'number' || typeof record.code === 'string')
    ? ` (exit ${String(record.code)})`
    : ''
  const stderr = record !== undefined && 'stderr' in record ? sanitizedOutput(record.stderr, licence) : ''
  const stdout = record !== undefined && 'stdout' in record ? sanitizedOutput(record.stdout, licence) : ''
  const detail = stderr || stdout
  return new Error(`StudyBuddy EV Sign failed for ${path}${code}${detail === '' ? '' : `: ${detail}`}`)
}

async function inspectSignature(path) {
  const { inspectWindowsRuntimeSignature } = await import('./windows-runtime-signature.mjs')
  return inspectWindowsRuntimeSignature(path)
}

/** Verify the fixed reviewed signing client without submitting an arbitrary executable. */
export async function verifyStudyBuddyEvSignCli(options = {}) {
  const cliPath = resolve(options.cliPath ?? STUDYBUDDY_EVSIGN_CLI_PATH)
  if (!samePath(cliPath, resolve(STUDYBUDDY_EVSIGN_CLI_PATH))) {
    throw new Error(`StudyBuddy EV Sign requires the reviewed CLI path ${STUDYBUDDY_EVSIGN_CLI_PATH}`)
  }
  const fileSha256 = options.fileSha256 ?? sha256
  const inspect = options.inspectSignature ?? inspectSignature
  if (await fileSha256(cliPath) !== STUDYBUDDY_EVSIGN_CLI_SHA256) {
    throw new Error('StudyBuddy EV Sign reviewed CLI SHA-256 does not match')
  }
  const signature = await inspect(cliPath)
  if (signature.status !== 'Valid'
    || signature.thumbprint?.toUpperCase() !== STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT) {
    throw new Error('StudyBuddy EV Sign reviewed CLI Authenticode identity does not match')
  }
  return { path: cliPath, sha256: STUDYBUDDY_EVSIGN_CLI_SHA256,
    thumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT }
}

async function assertPlainCandidateRoot(candidateRoot) {
  const root = resolve(candidateRoot)
  const item = await lstat(root).catch(() => undefined)
  if (item === undefined) throw new Error('StudyBuddy EV Sign protected candidate root is missing')
  if (item.isSymbolicLink()) {
    throw new Error('StudyBuddy EV Sign protected candidate root is a reparse point')
  }
  if (!item.isDirectory()) throw new Error('StudyBuddy EV Sign protected candidate root is missing')
  if (!samePath(await realpath(root), root)) throw new Error('StudyBuddy EV Sign protected candidate root is a reparse point')
  return root
}

async function assertCandidateFile(candidateRoot, candidatePath) {
  const root = await assertPlainCandidateRoot(candidateRoot)
  const path = resolve(candidatePath)
  const suffix = relative(root, path)
  if (suffix === '' || suffix === '..' || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) {
    throw new Error('StudyBuddy EV Sign target is outside the protected candidate root')
  }
  let directory = root
  const parentSuffix = relative(root, dirname(path))
  for (const component of parentSuffix === '' ? [] : parentSuffix.split(sep)) {
    directory = resolve(directory, component)
    const item = await lstat(directory).catch(() => undefined)
    if (item === undefined || !item.isDirectory() || item.isSymbolicLink() || !samePath(await realpath(directory), directory)) {
      throw new Error('StudyBuddy EV Sign target traverses a reparse point')
    }
  }
  const item = await lstat(path).catch(() => undefined)
  if (item === undefined || !item.isFile()) throw new Error('StudyBuddy EV Sign target is not a regular file')
  if (item.isSymbolicLink() || !samePath(await realpath(path), path)) {
    throw new Error('StudyBuddy EV Sign target is a reparse point')
  }
  if (item.nlink !== 1) throw new Error('StudyBuddy EV Sign target is hard-linked')
  return path
}

function requireProductSignature(signature) {
  if (signature.status !== 'Valid') throw new Error('StudyBuddy EV Sign product signature is invalid')
  if (!signature.timestamped) throw new Error('StudyBuddy EV Sign product signature has no timestamp')
  if (signature.thumbprint?.toUpperCase() !== STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT) {
    throw new Error('StudyBuddy EV Sign product signer does not match the fixed certificate')
  }
}

/**
 * Create electron-builder's signer without exposing a general-purpose signing RPC.
 * @param {{candidateRoot: string, licence?: string, cliPath?: string, environment?: NodeJS.ProcessEnv, execute?: Function, inspectSignature?: Function, fileSha256?: Function, preserveSignature?: (path: string) => Promise<boolean>, record?: (event: object) => void}} options Fixed candidate boundary and injected test seams.
 * @returns {(configuration: {path: string, hash: string, isNest: boolean}) => Promise<void>}
 */
export function createStudyBuddyEvSignSigner(options) {
  const cliPath = resolve(options.cliPath ?? STUDYBUDDY_EVSIGN_CLI_PATH)
  if (!samePath(cliPath, resolve(STUDYBUDDY_EVSIGN_CLI_PATH))) {
    throw new Error(`StudyBuddy EV Sign requires the reviewed CLI path ${STUDYBUDDY_EVSIGN_CLI_PATH}`)
  }
  const licence = options.licence ?? process.env.STUDYBUDDY_EVSIGN_LICENSE ?? ''
  const execute = options.execute ?? execFileAsync
  const inspect = options.inspectSignature ?? inspectSignature
  const fileSha256 = options.fileSha256 ?? sha256
  let cliIdentity
  let pending = Promise.resolve()

  async function verifyCli() {
    if (cliIdentity === undefined) {
      cliIdentity = verifyStudyBuddyEvSignCli({ cliPath, fileSha256, inspectSignature: inspect })
    }
    return cliIdentity
  }

  return (configuration) => {
    pending = pending.then(async () => {
      if (configuration.hash !== 'sha256') throw new Error('StudyBuddy EV Sign requires SHA-256')
      if (configuration.isNest) throw new Error('StudyBuddy EV Sign does not support nested signatures')
      if (!LICENCE_PATTERN.test(licence)) throw new Error('StudyBuddy EV Sign licence is missing or invalid')
      const path = await assertCandidateFile(options.candidateRoot, configuration.path)
      if (await options.preserveSignature?.(path)) return
      await verifyCli()
      const existing = await inspect(path)
      if (existing.status !== 'NotSigned') throw new Error('StudyBuddy EV Sign target must be unsigned')
      const before = await sha256(path)
      try {
        await execute(cliPath, [path, '-key', licence, '-sha256', '-t', STUDYBUDDY_EVSIGN_TIMESTAMP_SERVER], {
          env: scrubWindowsSigningEnvironment(options.environment ?? process.env),
          windowsHide: true,
          timeout: 120_000,
          maxBuffer: 64 * 1024,
        })
      }
      catch (error) {
        throw executionFailure(error, path, licence)
      }
      await assertCandidateFile(options.candidateRoot, path)
      const after = await sha256(path)
      if (after === before) throw new Error('StudyBuddy EV Sign completed without changing target bytes')
      const signature = await inspect(path)
      requireProductSignature(signature)
      options.record?.({ type: 'studybuddy-evsign-complete', path, sha256: after,
        thumbprint: STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT, timestamped: true })
    })
    return pending
  }
}

/**
 * Restrict the formal Windows release to the two user-approved EV-signing targets.
 * electron-builder may ask its custom signer about helpers, dependencies and the
 * generated uninstaller; those requests are deliberately acknowledged without
 * submitting the files to EV Sign.
 */
export function createStudyBuddyWindowsReleaseSigner(options) {
  const mainExecutable = resolve(options.mainExecutable)
  const installer = resolve(options.installer)
  if (samePath(mainExecutable, installer)) throw new Error('StudyBuddy EV Sign release targets must be distinct')
  return async (configuration) => {
    const path = resolve(configuration.path)
    const kind = samePath(path, mainExecutable) ? 'main-executable'
      : samePath(path, installer) ? 'installer' : undefined
    if (kind === undefined) {
      options.record?.({ type: 'studybuddy-evsign-target-skipped', path })
      return
    }
    options.record?.({ type: 'studybuddy-evsign-target-selected', kind, path })
    await options.sign({ ...configuration, path })
  }
}

