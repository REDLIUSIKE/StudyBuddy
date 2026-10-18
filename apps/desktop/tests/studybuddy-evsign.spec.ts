import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STUDYBUDDY_EVSIGN_CLI_PATH,
  STUDYBUDDY_EVSIGN_CLI_SHA256,
  STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT,
  STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT,
  STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER,
  createStudyBuddyEvSignSigner,
} from '../scripts/studybuddy-evsign.mjs'

const roots: string[] = []
const licence = '01234567-89ab-cdef-0123-456789abcdef'

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-evsign-'))
  roots.push(root)
  const target = join(root, 'StudyBuddy.exe')
  await writeFile(target, 'unsigned fixture')
  let signed = false
  const execute = vi.fn(async (file: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
    expect(file).toBe(STUDYBUDDY_EVSIGN_CLI_PATH)
    expect(args).toEqual([target, '-key', licence, '-sha256', '-t', 'http://timestamp.digicert.com'])
    expect(options.env).not.toHaveProperty('STUDYBUDDY_EVSIGN_LICENSE')
    expect(options.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
    expect(options.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
    await writeFile(target, `${await readFile(target, 'utf8')}\nsigned fixture`)
    signed = true
    return { stdout: `signed with ${licence}`, stderr: '' }
  })
  const inspectSignature = vi.fn(async (path: string) => path === STUDYBUDDY_EVSIGN_CLI_PATH
    ? { status: 'Valid', timestamped: true, thumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT }
    : signed
      ? { status: 'Valid', timestamped: true, thumbprint: STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT }
      : { status: 'NotSigned', timestamped: false, thumbprint: null })
  const signer = createStudyBuddyEvSignSigner({
    candidateRoot: root,
    licence,
    environment: {
      SystemRoot: 'C:\\Windows',
      STUDYBUDDY_EVSIGN_LICENSE: licence,
      TAURI_SIGNING_PRIVATE_KEY: 'retired-private-key',
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'retired-password',
    },
    execute,
    inspectSignature,
    fileSha256: async path => path === STUDYBUDDY_EVSIGN_CLI_PATH
      ? STUDYBUDDY_EVSIGN_CLI_SHA256
      : '0'.repeat(64),
  })
  return { root, target, signer, execute, inspectSignature, setSigned: (value: boolean) => { signed = value } }
}

describe('StudyBuddy EV Sign electron-builder adapter', () => {
  it('accepts the Keroro product certificate rotation explicitly approved on 2026-10-16', async () => {
    expect(STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT).toBe('EC6346287B2F343CB7BFA4CF4CAB7DB02379A0AD')
    expect(STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER)
      .toBe('CN=Keroro Software Ltd,O=Keroro Software Ltd,C=CN')
    const options = await fixture()
    options.inspectSignature.mockImplementation(async path => path === STUDYBUDDY_EVSIGN_CLI_PATH
      ? { status: 'Valid', timestamped: true, thumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT }
      : options.execute.mock.calls.length === 0
        ? { status: 'NotSigned', timestamped: false, thumbprint: null }
        : { status: 'Valid', timestamped: true, thumbprint: 'EC6346287B2F343CB7BFA4CF4CAB7DB02379A0AD' })
    await expect(options.signer({ path: options.target, hash: 'sha256', isNest: false })).resolves.toBeUndefined()
  })

  it('submits only the main executable and final installer to EV Sign', async () => {
    const module = await import('../scripts/studybuddy-evsign.mjs')
    const createReleaseSigner = Reflect.get(module, 'createStudyBuddyWindowsReleaseSigner') as undefined | ((options: {
      mainExecutable: string
      installer: string
      sign: (configuration: { path: string, hash: string, isNest: boolean }) => Promise<void>
      record?: (event: object) => void
    }) => (configuration: { path: string, hash: string, isNest: boolean }) => Promise<void>)
    expect(createReleaseSigner).toBeTypeOf('function')
    if (createReleaseSigner === undefined) return
    const root = await mkdtemp(join(tmpdir(), 'studybuddy-release-signing-'))
    roots.push(root)
    const mainExecutable = join(root, 'win-unpacked', 'StudyBuddy.exe')
    const installer = join(root, 'StudyBuddy-Windows-x64-1.0.0.exe')
    const sign = vi.fn(async (_configuration: { path: string, hash: string, isNest: boolean }) => {})
    const signer = createReleaseSigner({ mainExecutable, installer, sign })
    for (const path of [
      mainExecutable,
      join(root, 'installer-ui', 'window-frame.dll'),
      join(root, 'StudyBuddy-Windows-x64-1.0.0__uninstaller.exe'),
      join(root, 'win-unpacked', 'resources', 'elevate.exe'),
      join(root, 'win-unpacked', 'resources', 'runtime', 'node.exe'),
      installer,
    ]) await signer({ path, hash: 'sha256', isNest: false })
    expect(sign.mock.calls.map(([configuration]) => configuration.path)).toEqual([mainExecutable, installer])
  })

  it('pins the reviewed CLI and verifies the exact product signer and timestamp after one SHA-256 signature', async () => {
    const options = await fixture()
    await expect(options.signer({ path: options.target, hash: 'sha256', isNest: false })).resolves.toBeUndefined()
    expect(options.execute).toHaveBeenCalledOnce()
    expect(options.inspectSignature).toHaveBeenCalledWith(STUDYBUDDY_EVSIGN_CLI_PATH)
    expect(options.inspectSignature).toHaveBeenLastCalledWith(options.target)
  })

  it.each([
    { hash: 'sha1', isNest: false, message: 'requires SHA-256' },
    { hash: 'sha256', isNest: true, message: 'does not support nested signatures' },
  ])('rejects unsupported electron-builder signing input %#', async ({ hash, isNest, message }) => {
    const options = await fixture()
    await expect(options.signer({ path: options.target, hash, isNest })).rejects.toThrow(message)
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('rejects a missing licence before launching the reviewed CLI', async () => {
    const options = await fixture()
    const signer = createStudyBuddyEvSignSigner({
      candidateRoot: options.root,
      licence: '',
      execute: options.execute,
      inspectSignature: options.inspectSignature,
      fileSha256: async () => STUDYBUDDY_EVSIGN_CLI_SHA256,
    })
    await expect(signer({ path: options.target, hash: 'sha256', isNest: false })).rejects.toThrow('licence is missing')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('rejects a substituted CLI path or changed reviewed CLI bytes', async () => {
    const options = await fixture()
    expect(() => createStudyBuddyEvSignSigner({
      candidateRoot: options.root,
      licence,
      cliPath: join(options.root, 'EvSignClientConsole.exe'),
    })).toThrow('reviewed CLI path')
    const signer = createStudyBuddyEvSignSigner({
      candidateRoot: options.root,
      licence,
      execute: options.execute,
      inspectSignature: options.inspectSignature,
      fileSha256: async () => 'f'.repeat(64),
    })
    await expect(signer({ path: options.target, hash: 'sha256', isNest: false })).rejects.toThrow('reviewed CLI SHA-256')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('rejects a file outside the protected candidate root', async () => {
    const options = await fixture()
    const outside = join(await mkdtemp(join(tmpdir(), 'studybuddy-evsign-outside-')), 'outside.exe')
    roots.push(join(outside, '..'))
    await writeFile(outside, 'unsigned fixture')
    await expect(options.signer({ path: outside, hash: 'sha256', isNest: false })).rejects.toThrow('outside the protected candidate root')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('rejects a hard-linked candidate', async () => {
    const options = await fixture()
    await link(options.target, join(options.root, 'second-link.exe'))
    await expect(options.signer({ path: options.target, hash: 'sha256', isNest: false })).rejects.toThrow('hard-linked')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it.runIf(process.platform === 'win32')('rejects a reparse-point candidate root', async () => {
    const realRoot = await mkdtemp(join(tmpdir(), 'studybuddy-evsign-real-'))
    const parent = await mkdtemp(join(tmpdir(), 'studybuddy-evsign-link-'))
    roots.push(realRoot, parent)
    const linkedRoot = join(parent, 'candidate')
    await symlink(realRoot, linkedRoot, 'junction')
    const target = join(linkedRoot, 'StudyBuddy.exe')
    await writeFile(join(realRoot, 'StudyBuddy.exe'), 'unsigned fixture')
    const signer = createStudyBuddyEvSignSigner({
      candidateRoot: linkedRoot,
      licence,
      execute: vi.fn(),
      inspectSignature: vi.fn(),
      fileSha256: async () => STUDYBUDDY_EVSIGN_CLI_SHA256,
    })
    await expect(signer({ path: target, hash: 'sha256', isNest: false })).rejects.toThrow('reparse point')
  })

  it.each([
    { signature: { status: 'Valid', timestamped: false, thumbprint: STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT }, message: 'timestamp' },
    { signature: { status: 'Valid', timestamped: true, thumbprint: 'A'.repeat(40) }, message: 'product signer' },
  ])('fails closed when post-sign evidence is invalid %#', async ({ signature, message }) => {
    const options = await fixture()
    options.inspectSignature.mockImplementation(async path => path === STUDYBUDDY_EVSIGN_CLI_PATH
      ? { status: 'Valid', timestamped: true, thumbprint: STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT }
      : options.execute.mock.calls.length === 0
        ? { status: 'NotSigned', timestamped: false, thumbprint: null }
        : signature)
    await expect(options.signer({ path: options.target, hash: 'sha256', isNest: false })).rejects.toThrow(message)
  })

  it('redacts CLI diagnostics and never echoes the licence', async () => {
    const options = await fixture()
    options.execute.mockRejectedValueOnce(Object.assign(new Error(`failed ${licence}`), {
      stdout: `licence=${licence}`,
      stderr: `provider rejected ${licence}`,
      cmd: `${STUDYBUDDY_EVSIGN_CLI_PATH} -key ${licence}`,
    }))
    const failure = await options.signer({ path: options.target, hash: 'sha256', isNest: false })
      .then(() => undefined, error => error as Error)
    expect(failure?.message).toContain('<redacted>')
    expect(failure?.message).not.toContain(licence)
    expect(failure).not.toHaveProperty('cause')
    expect(failure).not.toHaveProperty('cmd')
  })
})
