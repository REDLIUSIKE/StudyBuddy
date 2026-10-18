/** Start the real packaged Electron main process against the existing Windows profile, then quit normally. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { createWriteStream } from 'node:fs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function smokePackagedMain(executable, resources, { startupTimeoutMs = 90_000 } = {}) {
  assert(Number.isFinite(startupTimeoutMs) && startupTimeoutMs > 0 && startupTimeoutMs <= 120_000, 'PACKAGED_MAIN_STARTUP_BUDGET_INVALID')
  const startedAt = Date.now()
  const profile = join(process.env.APPDATA, 'StudyBuddy-Harness')
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD|LICEN[CS]E|CSC_|^ELECTRON_RUN_AS_NODE$/i.test(name)))
  const logPath = join(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR ?? resolve(resources, '../../..'), 'main-startup.log')
  const log = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(executable, [`--inspect=127.0.0.1:${port}`], { cwd: resolve(executable, '..'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
  let exited = false, exitCode, ws, nextId = 0, lastState, startupError
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => { exited = true; exitCode = code; resolve() })
  })
  const pending = new Map()
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(Error('PACKAGED_MAIN_INSPECTOR_TIMEOUT')) }, Math.min(30_000, startupTimeoutMs))
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject })
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
  })
  const electron = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')"
  try {
    const deadline = startedAt + startupTimeoutMs
    let targets
    while (Date.now() < deadline && !exited) {
      targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => undefined)
      if (targets?.[0]?.webSocketDebuggerUrl) break
      await pause(200)
    }
    assert(targets?.[0]?.webSocketDebuggerUrl, 'PACKAGED_MAIN_DID_NOT_START')
    ws = new WebSocket(targets[0].webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    ws.onmessage = event => {
      const message = JSON.parse(event.data), item = pending.get(message.id)
      if (!item) return
      pending.delete(message.id)
      if (message.error || message.result?.exceptionDetails) {
        const detail = message.error?.message ?? message.result?.exceptionDetails?.exception?.description
          ?? message.result?.exceptionDetails?.text ?? 'Unknown inspector evaluation error'
        item.reject(Error(`PACKAGED_MAIN_EVALUATION_FAILED: ${String(detail).slice(0, 1200)}`))
      }
      else item.resolve(message.result?.result?.value)
    }
    while (Date.now() < deadline && !exited) {
      lastState = await evaluate(`(() => { const e=${electron}; const windows=e.BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()).map(w=>({visible:w.isVisible(),loading:w.webContents.isLoadingMainFrame(),protocol:w.webContents.getURL().split(':')[0]})); return { packaged:e.app.isPackaged, profile:e.app.getPath('userData'), appPath:e.app.getAppPath(), version:e.app.getVersion(), ready:e.app.isReady(), windows, loadedWindows:windows.filter(w=>!w.loading&&w.protocol==='dsh-app').length }; })()`)
      if (lastState?.ready && lastState.loadedWindows > 0) break
      await pause(250)
    }
    assert.equal(lastState?.packaged, true)
    assert.equal(resolve(lastState.profile).toLowerCase(), resolve(profile).toLowerCase())
    assert.equal(resolve(lastState.appPath).toLowerCase(), resolve(resources, 'app.asar').toLowerCase())
    assert(lastState.ready && lastState.loadedWindows > 0, 'PACKAGED_MAIN_WINDOW_NOT_READY')
    console.log(`PACKAGED_MAIN_READY ${JSON.stringify({ version:lastState.version, originalProfile:true, loadedWindows:lastState.loadedWindows, elapsedMs:Date.now()-startedAt })}`)
  } catch (error) {
    startupError = error
    // Keep account URLs out of diagnostics; only window protocols are collected above.
    const message = String(error?.message ?? error).replace(/https?:\/\/\S+/gu, '[URL]')
    console.error(`PACKAGED_MAIN_STARTUP_FAILED ${JSON.stringify({ message, exited, exitCode, lastState })}`)
    throw error
  } finally {
    if (ws?.readyState === WebSocket.OPEN && !exited) {
      await evaluate(`(() => { const e=${electron}; setTimeout(()=>e.app.quit(),100); return true; })()`).catch(() => {})
    }
    ws?.close()
    await Promise.race([exit, pause(10000)])
    log.end()
    if (startupError) console.error(`PACKAGED_MAIN_CLEANUP ${JSON.stringify({ exited, exitCode })}`)
    else assert(exited, 'PACKAGED_MAIN_NORMAL_QUIT_REQUIRED')
  }
  assert.equal(exitCode, 0, 'PACKAGED_MAIN_EXIT_FAILED')
}
