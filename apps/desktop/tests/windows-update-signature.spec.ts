import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn(async (_file: string, _args: string[], _options: { env: NodeJS.ProcessEnv }) => ({
  stdout: '', stderr: '',
})))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: execute }),
}))

const { verifyWindowsUpdateSignature } = await import('../src/windows-update-signature.ts')
const file = 'C:\\updates\\StudyBuddy-next.exe'
const oldPublisher = ['CN=NaisNet Technology Co.\\2c Ltd.,O=NaisNet Technology Co.\\2c Ltd.,C=CN']
const signed = { status: 'Valid', timestamped: true, thumbprint: 'EC6346287B2F343CB7BFA4CF4CAB7DB02379A0AD' }

beforeEach(() => { execute.mockReset(); execute.mockResolvedValue({ stdout: JSON.stringify(signed), stderr: '' }) })
afterEach(() => vi.unstubAllEnvs())

describe('rotating Windows update certificates', () => {
  it.each([
    'EC6346287B2F343CB7BFA4CF4CAB7DB02379A0AD',
    'B66430F5A387C1CC8287F894398A9BBB1697F9D5',
    '2DA3019820E6E4A5D30BF191FBC5D67EAD9BD960',
  ])('accepts a Windows-trusted replacement certificate %s', async (thumbprint) => {
    execute.mockResolvedValueOnce({ stdout: JSON.stringify({ ...signed, thumbprint }), stderr: '' })
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).toBeNull()
  })

  it('checks Windows trust even when no publisher names were supplied', async () => {
    expect(await verifyWindowsUpdateSignature([], file)).toBeNull()
    expect(execute).toHaveBeenCalledOnce()
  })

  it.each(['NotSigned', 'HashMismatch', 'NotTrusted', 'UnknownError'])('rejects Windows signature status %s', async (status) => {
    execute.mockResolvedValueOnce({ stdout: JSON.stringify({ ...signed, status }), stderr: '' })
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).not.toBeNull()
  })

  it.each([
    { ...signed, timestamped: false },
    { ...signed, thumbprint: null },
    { ...signed, thumbprint: 'not-a-certificate' },
    null,
    {},
  ])('rejects incomplete signature evidence %#', async (signature) => {
    execute.mockResolvedValueOnce({ stdout: JSON.stringify(signature), stderr: '' })
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).not.toBeNull()
  })

  it('rejects unavailable or malformed Windows inspection without falling back to acceptance', async () => {
    execute.mockRejectedValueOnce(new Error('PowerShell unavailable'))
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).not.toBeNull()
    execute.mockResolvedValueOnce({ stdout: 'not JSON', stderr: '' })
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).not.toBeNull()
    execute.mockResolvedValueOnce({ stdout: JSON.stringify(signed), stderr: 'verification failed' })
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).not.toBeNull()
  })

  it('does not inherit credentials or shell/module overrides into the Windows verifier', async () => {
    vi.stubEnv('STUDYBUDDY_EVSIGN_LICENSE', 'private-license')
    vi.stubEnv('API_KEY', 'private-api-key')
    vi.stubEnv('NODE_OPTIONS', '--require private-hook')
    vi.stubEnv('PSModulePath', 'private-modules')
    expect(await verifyWindowsUpdateSignature(oldPublisher, file)).toBeNull()
    const call = execute.mock.calls.at(0)
    if (call === undefined) throw new Error('Windows verification was not invoked')
    const options = call[2]
    expect(options.env).not.toHaveProperty('STUDYBUDDY_EVSIGN_LICENSE')
    expect(options.env).not.toHaveProperty('API_KEY')
    expect(options.env).not.toHaveProperty('NODE_OPTIONS')
    expect(options.env).not.toHaveProperty('PSModulePath')
  })
})
