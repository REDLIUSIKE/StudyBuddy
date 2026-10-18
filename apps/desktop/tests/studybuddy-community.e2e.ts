/** Runs emitted main/preload code in real Electron without public requests or production credentials. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
it('built community guest retains original transport and revokes all old-account capabilities', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'studybuddy-community-')),
    root = fileURLToPath(new URL('../../../', import.meta.url)),
    electron = createRequire(new URL('../package.json', import.meta.url))('electron') as string,
    child = spawn(electron, [fileURLToPath(new URL('./fixtures/studybuddy-community-electron.mjs', import.meta.url)), temporary, process.execPath,
      ...(process.env.STUDYBUDDY_SKILLS_WEB_DIST ? [process.env.STUDYBUDDY_SKILLS_WEB_DIST] : [])], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  child.stdout.resume()
  const watchdog = setTimeout(() => child.kill(), 60000)
  try {
    const status = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    const receipt = JSON.parse(await readFile(join(temporary, 'receipt.json'), 'utf8').catch(() => { throw Error('ELECTRON_RECEIPT_MISSING: ' + stderr.slice(-4096)) })) as { error?: string; checks: string[]; productionCredentials: boolean; realToolWrites: boolean }
    expect(receipt.error, stderr + JSON.stringify(receipt)).toBeUndefined()
    expect(status).toBe(0)
    expect(receipt.checks).toContain('original command traverses real preload and private pipe')
    expect(receipt.checks).toContain('opaque original progress channel delivered')
    expect(receipt.checks).toContain('logout destroys old authenticated document')
    expect(receipt.checks).toContain('logout awaits private process quiescence')
    expect(receipt.checks).toContain('expired access destroys the guest and awaits its private process')
    expect(receipt.checks).toContain('fresh sandbox transport reconnects after expiry')
    expect(receipt.checks).toHaveLength(process.env.STUDYBUDDY_SKILLS_WEB_DIST ? 20 : 19)
    if (process.env.STUDYBUDDY_SKILLS_WEB_DIST) {
      expect(receipt.checks).toContain('built original Skill App connects through the admitted sandbox transport')
    }
    expect(receipt.productionCredentials).toBe(false)
    expect(receipt.realToolWrites).toBe(false)
  } finally {
    clearTimeout(watchdog)
    if (child.exitCode === null) child.kill()
    await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
}, 70000)
