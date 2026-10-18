// Real sandbox/preload/resource module; only its private protocol peer is synthetic.
import { app, BrowserWindow, WebContentsView, session, ipcMain, protocol } from 'electron'
import { writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const [runtimeRoot, temporary, node] = process.argv.slice(2),
  receipt = join(temporary, 'receipt.json')
app.setPath('userData', join(temporary, 'profile'))
protocol.registerSchemesAsPrivileged([
  { scheme: 'dsh-tools', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])
let owner,
  views,
  native,
  bridge,
  scope = { accountId: 'synthetic-page-owner', generation: 1 }
const checks = [],
  navigation = []
function check(value, label) {
  if (!value) throw Error(label)
  checks.push(label)
}
const wait = async (predicate) => {
  const end = Date.now() + 20000
  while (!(await predicate())) {
    if (Date.now() > end) throw Error('PAGE_WAIT_TIMEOUT')
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
const handle = (channel, callback) =>
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await callback(event, ...args) }
    } catch (error) {
      return { ok: false, error: { code: error.code ?? 'FIXTURE_FAILED', message: error.message } }
    }
  })
void (async () => {
  try {
    await writeFile(receipt, JSON.stringify({ checks, error: 'fixture startup incomplete' }))
    const { ToolCenterViews } = await import('../../lib/types/studybuddy/tool-center-views.js')
    await writeFile(receipt, JSON.stringify({ checks, error: 'tool views imported' }))
    const { ToolCenterBridge } = await import('../../lib/types/studybuddy/tool-center-bridge.js')
    await writeFile(receipt, JSON.stringify({ checks, error: 'tool bridge imported' }))
    const { NativeAccountClient } = await import('../../lib/types/studybuddy/native-account-client.js')
    const { verifyTrustedNativeRuntime } = await import('../../lib/types/studybuddy/trusted-native-runtime.js')
    const { STUDYBUDDY_IPC: IPC } = await import('../../lib/types/studybuddy/types.js')
    await writeFile(receipt, JSON.stringify({ checks, error: 'imports complete; app ready pending' }))
    await app.whenReady()
    await writeFile(receipt, JSON.stringify({ checks, error: 'app ready; view pending' }))
    owner = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    await owner.loadURL('data:text/html,<title>Isolated tool surface host</title>')
    native = new NativeAccountClient({
      start: async () =>
        spawn(node, [fileURLToPath(new URL('./studybuddy-tool-page-pipe.mjs', import.meta.url))], {
          stdio: 'pipe',
          windowsHide: true,
        }),
    })
    native.useSession({ scope, accessToken: 'synthetic-not-production' })
    views = new ToolCenterViews({
      scope: () => scope,
      owner: () => owner,
      runtime: () => verifyTrustedNativeRuntime(runtimeRoot),
      create: (options) => new WebContentsView(options),
      session: (partition) => session.fromPartition(partition),
      preload: fileURLToPath(new URL('../../lib/preload-studybuddy-tools.cjs', import.meta.url)),
      released: (lease) => bridge.release(lease),
    })
    bridge = new ToolCenterBridge(
      views,
      native,
      async () => null,
      async () => {
        throw Error('EXTERNAL_OPEN_FORBIDDEN')
      },
      (notice) => navigation.push(notice),
    )
    handle(IPC.toolPageState, (event) => bridge.state(event))
    handle(IPC.toolOperation, (event, ...args) => bridge.invoke(event, ...args))
    handle(IPC.toolNavigate, (event, ...args) => bridge.navigation(event, ...args))
    handle(IPC.toolInstallSubscribe, (event, id) => bridge.subscribe(event, id))
    handle(IPC.toolInstallUnsubscribe, (event, id) => bridge.unsubscribe(event, id))
    const lease = await views.acquire(scope),
      row = views.get(lease.lease),
      wc = row.view.webContents
    await writeFile(receipt, JSON.stringify({ checks, error: 'view acquired; page verification incomplete' }))
    await views.resize(lease.lease, { x: 0, y: 0, width: 1000, height: 800 })
    await views.setVisible(lease.lease, true)
    await wait(() => wc.executeJavaScript("document.querySelectorAll('.native-tool-tile').length>=6"))
    const names = await wc.executeJavaScript(
      "[...document.querySelectorAll('.native-tool-tile')].slice(0,6).map(row=>row.querySelector('h2').textContent)",
    )
    check(
      JSON.stringify(names) ===
        JSON.stringify(['Codex', 'Claude Code', 'Hermes Desktop', 'Kimi CLI', 'OpenClaw', 'WorkBuddy']),
      'six original cards',
    )
    check(
      await wc.executeJavaScript(
        "typeof require==='undefined'&&typeof window.studybuddyTools.api.invoke==='undefined'",
      ),
      'sandbox named capability surface',
    )
    const catalog = await wc.executeJavaScript('window.studybuddyTools.api.getNativeToolCatalog()')
    check(catalog.catalogRevision === 'synthetic-page', 'preload to private pipe round trip')
    await wc.executeJavaScript('document.querySelector(\'button[aria-label="了解 Codex"]\').click()')
    check(
      await wc.executeJavaScript('!!document.querySelector(\'aside[aria-label="工具详情与连接"]\')'),
      'original right-hand detail',
    )
    await wc.executeJavaScript("window.studybuddyTools.navigate('sources')")
    check(navigation.at(-1).scope.accountId === scope.accountId, 'existing source owner navigation')
    await views.setTheme(lease.lease, {
      mode: 'dark',
      variables: { '--dsw-alias-bg-layer-1': '#232930', '--dsw-alias-label-primary': '#eeeeee' },
    })
    await wait(() => wc.executeJavaScript("document.documentElement.dataset.theme==='dark'"))
    checks.push('dark theme delivered')
    await views.setVisible(lease.lease, false)
    check(!owner.contentView.children.includes(row.view), 'hidden input layer detached')
    await views.setVisible(lease.lease, true)
    check(views.get(lease.lease).view === row.view, 'same view retained on return')
    owner.webContents.setZoomFactor(1.25)
    await views.resize(lease.lease, { x: 10, y: 20, width: 600, height: 500 })
    check(row.view.getBounds().width === 750, '125 percent CSS to DIP')
    owner.webContents.setZoomFactor(1.5)
    await views.resize(lease.lease, { x: 10, y: 20, width: 600, height: 500 })
    check(row.view.getBounds().width === 900, '150 percent CSS to DIP')
    await wc.executeJavaScript(
      'window.__fixtureEvents=[];window.studybuddyTools.api.listenInstallEvents(event=>window.__fixtureEvents.push(event)).then(off=>{window.__fixtureOff=off})',
    )
    await wait(() => wc.executeJavaScript('window.__fixtureEvents.length>0'))
    checks.push('private progress event delivered')
    scope = { ...scope, generation: 2 }
    await views.dispose()
    check(wc.isDestroyed(), 'account switch destroys old document')
    await writeFile(receipt, JSON.stringify({ checks, productionCredentials: false, realToolWrites: false }))
    await native.dispose()
    owner.destroy()
    app.exit(0)
  } catch (error) {
    await writeFile(receipt, JSON.stringify({ error: error.stack, checks }))
    await views?.dispose()
    await native?.dispose()
    owner?.destroy()
    app.exit(1)
  }
})()
