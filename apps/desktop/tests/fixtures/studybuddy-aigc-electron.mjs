/** Real emitted owner/preload plus verified Bun assets; the account and empty catalog are synthetic. */
import { app, BrowserWindow, session, ipcMain, protocol } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
const [temporary] = process.argv.slice(2), receiptPath = join(temporary, 'receipt.json')
app.setPath('userData', join(temporary, 'profile'))
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
let scope = null, owner, foreign, aigc, gateway, guest, child
const checks = [], messages = []
const uiGrant = { handle: 'a'.repeat(64), sourceLabel: 'Fixture UI source', catalogVersion: 'fixture-1', catalogDigest: 'b'.repeat(64),
  selection: { routeId: 'fixture', sourceId: randomUUID(), localRef: 'fixture-source', providerId: 'kimi',
    exactModelId: 'fixture-ui-model', protocol: 'openai_chat_completions', connectionId: randomUUID(),
    credentialRevision: 'revision-1', grantRevision: 'c'.repeat(64), fundingSource: 'user_api' },
  authority: { logicalModelId: 'fixture-ui', providerId: 'kimi', exactModelId: 'fixture-ui-model', displayName: 'Fixture UI model',
    protocol: 'openai_chat_completions', contextWindow: 128000, maxOutputTokens: 16000, capabilityFlags: ['tool_use'],
    evidenceSha256: 'd'.repeat(64), membershipRevision: 'member-1', capabilityRevision: 'cap-1', adapterRevision: 'adapter-1',
    priceAuthorityRevision: null, availability: 'available' } }
const stage = name => writeFile(receiptPath, JSON.stringify({ error: 'startup incomplete at ' + name, checks, messages }))
function check(value, label) { if (!value) throw Error(label); checks.push(label) }
async function wait(predicate) {
  const deadline = Date.now() + 25000
  while (!await predicate()) {
    if (Date.now() > deadline) throw Error('AIGC_FIXTURE_WAIT_TIMEOUT')
    await new Promise(accept => setTimeout(accept, 25))
  }
}
void (async () => {
  try {
    const { StudyBuddyAigc } = await import('../../lib/types/studybuddy/aigc.js')
    const { AigcRuntime, accountAigcDirectory } = await import('../../lib/types/studybuddy/aigc-runtime.js')
    const { AigcGateway } = await import('../../lib/types/studybuddy/aigc-gateway.js')
    const { loadAigcResources } = await import('../../lib/types/studybuddy/aigc-resource-identity.js')
    const { launchAigcProcess } = await import('../../lib/types/studybuddy/aigc-process.js')
    await writeFile(receiptPath, JSON.stringify({ error: 'startup incomplete', checks }))
    await app.whenReady()
    await stage('app ready')
    protocol.handle('dsh-app', () => new Response('<!doctype html><title>Isolated Harness owner</title><style>html,body,#surface,webview{width:100%;height:100%;margin:0}webview{display:flex}</style><main id="surface"></main>',
      { headers: { 'Content-Type': 'text/html' } }))
    const preload = fileURLToPath(new URL('../../lib/preload-app.cjs', import.meta.url))
    const preferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: true, preload, spellcheck: false }
    owner = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: preferences })
    await stage('owner created')
    const current = captured => !!scope && captured.accountId === scope.accountId && captured.generation === scope.generation
    gateway = new AigcGateway({ isCurrent: current, logRoot: join(temporary, 'logs'), consumer: {
      consumerCatalog: async () => [uiGrant], consumerRequestStatus: async () => null,
      prepareConsumerRequest: async () => { throw Error('PAID_DISPATCH_FORBIDDEN') },
    } })
    const runtime = new AigcRuntime({ userDataRoot: app.getPath('userData'), isCurrent: current,
      resources: () => loadAigcResources(fileURLToPath(new URL('../../../../.dsh-build/studybuddy-aigc/', import.meta.url))),
      gateway: captured => gateway.start(captured), launch: (exe, args, options) => {
        child = launchAigcProcess(exe, args, options); return child
      }, invalidated: () => { void aigc?.revoke().catch(() => {}) },
    })
    const auth = { scope: () => scope, withSession: async callback => {
      if (!scope) throw Error('AUTH_REQUIRED'); return callback({ scope, accessToken: 'synthetic-only' })
    } }
    aigc = new StudyBuddyAigc({ auth, runtime, fromPartition: partition => session.fromPartition(partition),
      revokeGateway: () => gateway.revoke() })
    aigc.register(ipcMain, event => {
      if (event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame ||
        !event.senderFrame.url.startsWith('dsh-app://app/')) throw Error('AIGC_OWNER_DENIED')
    })
    aigc.bind(owner, () => () => {}, () => false)
    owner.webContents.on('console-message', event => messages.push(event.message))
    owner.webContents.on('did-attach-webview', (_event, value) => { guest = value; value.setBackgroundThrottling(false) })
    await owner.loadURL('dsh-app://app/fixture.html')
    await stage('owner loaded')
    check(await owner.webContents.executeJavaScript('!!window.studybuddy.aigc'), 'private preload lease')
    const signedOut = await owner.webContents.executeJavaScript('window.studybuddy.aigc.acquire().catch(error=>error.message)')
    check(signedOut === 'AUTH_REQUIRED', 'signed-out lease denied')
    scope = { accountId: 'synthetic-aigc-owner', generation: 1 }
    const acquire = () => owner.webContents.executeJavaScript('window.studybuddy.aigc.acquire()')
    const attach = async lease => {
      await owner.webContents.executeJavaScript(`(() => {
        document.querySelector('webview')?.remove();const webview=document.createElement('webview');
        webview.setAttribute('partition',${JSON.stringify(lease.partition)});
        webview.setAttribute('src',${JSON.stringify('about:blank#studybuddy-aigc-' + lease.lease)});
        let loaded=false;webview.addEventListener('dom-ready',()=>{if(!loaded){loaded=true;void webview.loadURL(${JSON.stringify(lease.entryUrl)})}});
        document.getElementById('surface').append(webview);
      })()`)
      await wait(() => guest && !guest.isDestroyed() && guest.getURL().startsWith(lease.entryUrl))
      await wait(() => guest.executeJavaScript("!!document.querySelector('.home,.workspacePage')"))
    }
    let lease = await acquire()
    await stage('lease acquired')
    check(!JSON.stringify(lease).includes('authorization') && !JSON.stringify(lease).includes('apiKey'), 'shell receives no credential')
    await attach(lease)
    check(await guest.executeJavaScript("document.title.includes('StudyBuddy')&&typeof window.studybuddy==='undefined'&&typeof require==='undefined'"),
      'StudyBuddy built page')
    await owner.webContents.executeJavaScript(`window.studybuddy.aigc.setTheme(${JSON.stringify(lease.lease)},
      {mode:'light',variables:{'--dsw-alias-bg-base':'#ffffff','--dsw-alias-bg-layer-1':'#ffffff',
        '--dsw-alias-label-primary':'#1c1e21','--dsw-alias-label-secondary':'#656a73','--dsw-alias-border-l4':'#e3e5e8',
        '--dsw-font-family':'Inter, Microsoft YaHei, system-ui, sans-serif'}})`)
    const artifacts = fileURLToPath(new URL('../../../../../output/studybuddy-toonflow-integration-2026-10-12/', import.meta.url))
    await guest.executeJavaScript('new Promise(accept=>requestAnimationFrame(()=>requestAnimationFrame(()=>accept(true))))')
    await writeFile(join(artifacts, 'isolated-aigc-home.png'), (await guest.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
    await guest.executeJavaScript("document.querySelector('[aria-label=\"模型与推理设置\"]').click()")
    await wait(() => guest.executeJavaScript("!!document.querySelector('.agentModelPopover .el-select__wrapper')"))
    await guest.executeJavaScript("document.querySelector('.agentModelPopover .el-select__wrapper').click()")
    check(await guest.executeJavaScript("document.body.innerText.includes('Fixture UI model')&&document.body.innerText.includes('Fixture UI source')"),
      'keyless native catalog reaches real model selector')
    check(await guest.executeJavaScript(`(() => {
      const input=document.querySelector('textarea[aria-label="创作描述"]');
      const shift=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});input.dispatchEvent(shift);
      const ime=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(ime);
      const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(enter);
      return !shift.defaultPrevented&&!ime.defaultPrevented&&enter.defaultPrevented;
    })()`), 'native Enter send Shift Enter newline and IME admission')
    check((await acquire()).lease === lease.lease, 'retained lease reused')
    const project = join(accountAigcDirectory(app.getPath('userData'), scope.accountId), 'workspaces')
    const saved = await guest.executeJavaScript(`fetch('/api/workspaces/files/write?directory='+encodeURIComponent(${JSON.stringify(project)})+'&path=fixture-canvas.json',
      {method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:'{"savedFixture":true}'}).then(value=>value.status)`)
    check(saved === 200, 'real guest saves project bytes')
    const video = await guest.executeJavaScript(`fetch('/api/ai/media/generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({directory:${JSON.stringify(project)},mediaType:'video',providerId:'missing',modelId:'missing',prompt:'no dispatch'})}).then(value=>value.json())`)
    check(video.message.includes('AIGC_VIDEO_MODEL_NOT_CONFIGURED'), 'video unavailable without upstream dispatch')
    await wait(() => guest.executeJavaScript("[...document.querySelectorAll('.workspaceBrowser')].some(v=>v.getClientRects().length>0)"))
    await wait(() => guest.executeJavaScript(`(()=>{const dialog=[...document.querySelectorAll('.workspaceBrowser')].find(v=>v.getClientRects().length>0);
      return !![...dialog.querySelectorAll('button')].find(v=>v.textContent.trim()==='新建文件夹'&&!v.disabled)})()`))
    await guest.executeJavaScript(`(()=>{const dialog=[...document.querySelectorAll('.workspaceBrowser')].find(v=>v.getClientRects().length>0);
      [...dialog.querySelectorAll('button')].find(v=>v.textContent.trim()==='新建文件夹').click();return true})()`)
    await wait(() => guest.executeJavaScript("!!document.querySelector('.el-message-box input')"))
    await guest.executeJavaScript(`(()=>{const input=document.querySelector('.el-message-box input');input.value='Fixture canvas';input.dispatchEvent(new Event('input',{bubbles:true}));
      [...document.querySelectorAll('.el-message-box button')].find(v=>v.textContent.trim()==='创建').click();return true})()`)
    await wait(() => guest.executeJavaScript("[...document.querySelectorAll('.entryName')].some(v=>v.textContent.trim()==='Fixture canvas')"))
    await guest.executeJavaScript("(()=>{[...document.querySelectorAll('.entryName')].find(v=>v.textContent.trim()==='Fixture canvas').click();return true})()")
    await wait(() => guest.executeJavaScript("[...document.querySelectorAll('.directoryPath')].some(v=>v.textContent.includes('Fixture canvas'))"))
    await guest.executeJavaScript(`(()=>{const dialog=[...document.querySelectorAll('.workspaceBrowser')].find(v=>v.getClientRects().length>0).closest('.el-dialog');
      [...dialog.querySelectorAll('button')].find(v=>v.textContent.trim()==='选择此目录').click();return true})()`)
    await wait(() => guest.executeJavaScript("!!document.querySelector('button[aria-label=\"发送\"]')"))
    await guest.executeJavaScript("document.querySelector('button[aria-label=\"发送\"]').click()")
    await wait(() => guest.executeJavaScript(`(()=>{const canvas=document.querySelector('.workspacePage .vue-flow')?.getBoundingClientRect();
      return location.hash.includes('/workspace')&&!document.querySelector('.home')&&canvas?.width>10&&canvas?.height>10&&canvas.top<innerHeight})()`))
    check((JSON.parse(await readFile(join(project, 'Fixture canvas/画布1.json'), 'utf8'))).toonflowCanvas === true,
      'real UI creates and opens the infinite canvas')
    await guest.executeJavaScript('new Promise(accept=>requestAnimationFrame(()=>requestAnimationFrame(()=>accept(true))))')
    await writeFile(join(artifacts, 'isolated-aigc-canvas.png'), (await guest.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
    await writeFile(join(artifacts, 'isolated-canvas-ui.json'), JSON.stringify(await guest.executeJavaScript("({route:location.hash,text:document.body.innerText.slice(0,2600),canvas:!!document.querySelector('.vue-flow')?.getClientRects().length})")))
    foreign = new BrowserWindow({ show: false, webPreferences: preferences })
    await foreign.loadURL('dsh-app://app/foreign.html')
    const denied = await foreign.webContents.executeJavaScript('window.studybuddy.aigc.acquire().catch(error=>error.message)')
    check(denied === 'AIGC_OWNER_DENIED' && await guest.executeJavaScript("typeof window.studybuddy==='undefined'"),
      'foreign shell and guest IPC rejected')
    await owner.webContents.executeJavaScript("(()=>{window.studybuddy.aigc.subscribeInvalid(id=>{window.__invalidLease=id});return true})()")
    const crashed = child, crashedLease = lease.lease
    child.kill()
    await wait(() => owner.webContents.executeJavaScript('window.__invalidLease').then(value => value === crashedLease))
    await wait(() => guest.isDestroyed())
    lease = await acquire(); guest = null; await attach(lease)
    check(child !== crashed && (await acquire()).lease === lease.lease, 'crash invalidates lease and starts one replacement service')
    const previousChild = child, previousGuest = guest
    scope = null
    await aigc.revoke()
    check(previousGuest.isDestroyed() && (previousChild.exitCode !== null || previousChild.signalCode !== null),
      'logout fences guest and awaits child exit')
    scope = { accountId: 'synthetic-aigc-owner', generation: 2 }
    lease = await acquire(); guest = null; await attach(lease)
    const reopened = await guest.executeJavaScript(`fetch('/api/workspaces/files/read?directory='+encodeURIComponent(${JSON.stringify(project)})+'&path=fixture-canvas.json').then(value=>value.text())`)
    check(reopened === '{"savedFixture":true}' && await readFile(join(project, 'fixture-canvas.json'), 'utf8') === reopened,
      'saved project survives account service restart')
    await wait(() => guest.executeJavaScript("!!document.querySelector('button[aria-label=\"打开项目 Fixture canvas\"]:not(:disabled)')"))
    await guest.executeJavaScript("document.querySelector('button[aria-label=\"打开项目 Fixture canvas\"]').click()")
    await wait(() => guest.executeJavaScript("location.hash.includes('/workspace')&&!document.querySelector('.home')&&!!document.querySelector('.vue-flow')?.getClientRects().length"))
    check(JSON.parse(await readFile(join(project, 'Fixture canvas/画布1.json'), 'utf8')).toonflowCanvas === true,
      'saved canvas reopens through real UI after service restart')
    await aigc.revoke()
    const receipt = JSON.stringify({ checks, paidRequests: 0, account: 'synthetic', originalProfileAcceptance: false })
    await writeFile(receiptPath, receipt)
    await writeFile(join(artifacts, 'isolated-electron-receipt.json'), receipt)
    foreign.destroy(); owner.destroy()
    app.exit(0)
  } catch (error) {
    const document = guest && !guest.isDestroyed() ? await guest.executeJavaScript('document.body.innerText.slice(0, 2048)').catch(() => null) : null
    await writeFile(receiptPath, JSON.stringify({ error: error.stack, checks, messages, document }))
    await aigc?.revoke().catch(() => {}); await gateway?.revoke().catch(() => {})
    child?.kill(); foreign?.destroy(); owner?.destroy(); app.exit(1)
  }
})()
