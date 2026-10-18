/** Built Electron surface and authentic companion pre-auth guard, never production credentials. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
const root = fileURLToPath(new URL('../../../', import.meta.url)),
  runtime = join(root, '.dsh-build/studybuddy-business')
it('built desktop tool module traverses sandbox preload and the owned private pipe', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'studybuddy-built-tools-')),
    require = createRequire(new URL('../package.json', import.meta.url)),
    electron = require('electron') as string
  const child = spawn(
    electron,
    [
      fileURLToPath(new URL('./fixtures/studybuddy-tool-page-electron.mjs', import.meta.url)),
      runtime,
      temporary,
      process.execPath,
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    },
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })
  child.stdout.resume()
  const watchdog = setTimeout(() => child.kill(), 60000)
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    const receipt = JSON.parse(
      await readFile(join(temporary, 'receipt.json'), 'utf8').catch(() => {
        throw Error('ELECTRON_RECEIPT_MISSING: ' + stderr.slice(-4096))
      }),
    ) as { error?: string; checks: string[]; productionCredentials: boolean; realToolWrites: boolean }
    expect(receipt.error, stderr).toBeUndefined()
    expect(status).toBe(0)
    expect(receipt.checks).toContain('six original cards')
    expect(receipt.checks).toContain('preload to private pipe round trip')
    expect(receipt.checks).toContain('private progress event delivered')
    expect(receipt.productionCredentials).toBe(false)
    expect(receipt.realToolWrites).toBe(false)
  } finally {
    clearTimeout(watchdog)
    if (child.exitCode === null) child.kill()
    await rm(temporary, { recursive: true, force: true })
  }
}, 70000)
it('real companion rejects invalid bootstrap before reading any production account', async () => {
  const manifest = JSON.parse(await readFile(join(runtime, 'manifest.json'), 'utf8')) as { companion: string }
  const child = spawn(join(runtime, manifest.companion), [], { cwd: runtime, windowsHide: true, stdio: 'pipe' }),
    chunks: Buffer[] = []
  child.stdout.on('data', chunk => chunks.push(chunk))
  child.stderr.resume()
  const body = Buffer.from(JSON.stringify({ schemaVersion: 999, kind: 'bootstrap' })),
    head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  child.stdin.end(Buffer.concat([head, body]))
  const watchdog = setTimeout(() => child.kill(), 10000)
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', () => resolve())
    })
    const bytes = Buffer.concat(chunks)
    expect(bytes.length).toBeGreaterThan(4)
    const result = JSON.parse(bytes.subarray(4, 4 + bytes.readUInt32LE(0)).toString()) as {
      error: { code: string }
      ready?: boolean
    }
    expect(result.error.code).toBe('NATIVE_PROTOCOL_INVALID')
    expect(result.ready).not.toBe(true)
  } finally {
    clearTimeout(watchdog)
    if (child.exitCode === null) child.kill()
  }
})
