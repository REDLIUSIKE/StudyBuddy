/** Built Electron, private preload and verified local Bun resources without real account logout. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
it('built AIGC guest preserves projects and fences all old-account capabilities', { timeout: 70000, retry: 0 }, async () => {
  await access(fileURLToPath(new URL('./fixtures/studybuddy-aigc-electron.mjs', import.meta.url)))
  const temporary = await mkdtemp(join(tmpdir(), 'aigc-electron-')),
    root = fileURLToPath(new URL('../../../', import.meta.url)),
    electron = createRequire(new URL('../package.json', import.meta.url))('electron') as string,
    child = spawn(electron, [fileURLToPath(new URL('./fixtures/studybuddy-aigc-electron.mjs', import.meta.url)), temporary], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    })
  let stderr = ''
  child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString() }); child.stdout.resume()
  const watchdog = setTimeout(() => child.kill(), 65000)
  try {
    const status = await new Promise<number | null>((accept, reject) => { child.once('error', reject); child.once('exit', accept) })
    const receipt = JSON.parse(await readFile(join(temporary, 'receipt.json'), 'utf8').catch(() => {
      throw Error('AIGC_ELECTRON_RECEIPT_MISSING: ' + stderr.slice(-4000))
    })) as { error?: string; checks: string[] }
    expect(receipt.error, stderr + JSON.stringify(receipt)).toBeUndefined()
    expect(status).toBe(0)
    expect(receipt.checks).toEqual(expect.arrayContaining(['private preload lease', 'StudyBuddy built page',
      'video unavailable without upstream dispatch', 'saved project survives account service restart',
      'keyless native catalog reaches real model selector', 'crash invalidates lease and starts one replacement service',
      'native Enter send Shift Enter newline and IME admission', 'real UI creates and opens the infinite canvas',
      'saved canvas reopens through real UI after service restart',
      'logout fences guest and awaits child exit', 'foreign shell and guest IPC rejected']))
  } finally {
    clearTimeout(watchdog); if (child.exitCode === null) child.kill()
    await rm(temporary, { force: true, recursive: true, maxRetries: 8, retryDelay: 100 })
  }
})
