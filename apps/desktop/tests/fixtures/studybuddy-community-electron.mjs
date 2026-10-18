// Real guest, main module and sandboxed preload; only the private pipe/API peer is synthetic.
import { app, BrowserWindow, session, ipcMain } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const [temporary, node, webDist] = process.argv.slice(2), receipt = join(temporary, 'receipt.json')
app.setPath('userData', join(temporary, 'profile'))
let owner, community, guest, peer, browserSession, scope = { accountId: 'synthetic-community-owner', generation: 1 }
const checks = [], messages = [], requests = []
function check(value, label) { if (!value) throw Error(label); checks.push(label) }
const wait = async predicate => {
  const deadline = Date.now() + 15000
  while (!(await predicate())) {
    if (Date.now() > deadline) throw Error('COMMUNITY_WAIT_TIMEOUT')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}
void (async () => {
  try {
    await writeFile(receipt, JSON.stringify({ checks, error: 'fixture startup incomplete' }))
    const { StudyBuddyCommunity } = await import('../../lib/types/studybuddy/community.js')
    await app.whenReady()
    owner = new BrowserWindow({ show: false, width: 1200, height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: true, spellcheck: false } })
    await owner.loadURL('data:text/html,<title>Isolated community host</title>')
    const auth = {
      scope: () => scope,
      withSession: async callback => { if (!scope) throw Error('AUTH_REQUIRED'); return callback({ scope, accessToken: 'synthetic-not-production' }) },
      restore: async () => {},
    }
    community = new StudyBuddyCommunity({
      auth, fetch: async () => { throw Error('PUBLIC_API_FORBIDDEN') },
      session: partition => {
        browserSession = session.fromPartition(partition)
        browserSession.protocol.handle('https', async request => {
          const url = new URL(request.url)
          requests.push(url.pathname)
          if (url.origin !== 'https://guijitongzhuo.com') return new Response('External requests forbidden', { status: 403 })
          if (!webDist) return new Response('<!doctype html><title>Original Skill transport fixture</title><button>Original controls</button>', { headers: { 'Content-Type': 'text/html' } })
          if (url.pathname.startsWith('/api/')) {
            const data = url.pathname.endsWith('/exchange-v2') ? { ok: true, bridgeBindingId: 'b'.repeat(64) } : []
            return Response.json(data)
          }
          const name = /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname) ? url.pathname.slice(1) : 'index.html'
          const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html'
          return new Response(await readFile(join(webDist, name)), { headers: { 'Content-Type': type } })
        })
        return browserSession
      }, window: () => owner,
      runtime: { start: async () => {
        peer = spawn(node, [fileURLToPath(new URL('./studybuddy-skill-pipe.mjs', import.meta.url))], {
          stdio: 'pipe', windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
        }); return peer
      } },
      home: () => join(temporary, 'harness'), version: '0.2.1-alpha.2',
      preload: fileURLToPath(new URL('../../lib/preload-studybuddy-skills.cjs', import.meta.url)),
      pick: async () => { throw Error('REAL_DIALOG_FORBIDDEN') },
      openPath: async () => { throw Error('REAL_OPEN_FORBIDDEN') },
      openExternal: async () => { throw Error('REAL_OPEN_FORBIDDEN') },
    })
    community.register(ipcMain, event => { if (event.sender !== owner.webContents) throw Error('OWNER_MISMATCH') })
    community.bind(owner, () => () => {}, () => false)
    let lease = await community.skills.acquire(owner.webContents)
    check(lease.entryUrl.includes('host_ui=harness'), 'original ticket gains only Harness theme marker')
    const attach = async current => {
      owner.webContents.once('did-attach-webview', (_event, value) => {
        guest = value
        guest.on('console-message', event => { messages.push(event.message.slice(0, 1024)) })
      })
      await owner.webContents.executeJavaScript(`(() => {
        const view = document.createElement('webview'); view.setAttribute('partition', ${JSON.stringify(current.partition)});
        view.setAttribute('src', ${JSON.stringify('about:blank#studybuddy-skills-' + current.lease)}); document.body.append(view);
      })()`)
      await wait(() => guest && !guest.isDestroyed() && guest.getURL().startsWith('about:blank#studybuddy-skills-'))
      // The manager admits the about:blank guest on its initial DOM ready, before any remote preload runs.
      await wait(() => guest.executeJavaScript('document.readyState').then(value => value === 'complete'))
      await guest.loadURL(current.entryUrl)
    }
    await attach(lease)
    if (webDist) {
      await wait(() => guest.executeJavaScript("!!document.querySelector('.skill-page-mine')"))
      // A hidden test host starts its retained page suspended, just like an inactive sidebar panel.
      await community.skills.setVisible(owner.webContents, lease.lease, true)
      await wait(() => guest.executeJavaScript("!!document.querySelector('.skill-marketplace')&&document.body.innerText.includes('刷新本机 Skill')"))
      check(await guest.executeJavaScript("document.documentElement.hasAttribute('data-harness-business-page')&&!document.body.innerText.includes('本机管理需要新版')"), 'built original Skill App connects through the admitted sandbox transport')
    }
    check(await guest.executeJavaScript("typeof require==='undefined'&&typeof process==='undefined'"), 'real guest has no Node globals')
    check(await guest.executeJavaScript("!!window.__STUDYBUDDY_SKILL_NATIVE__&&Object.keys(window.__STUDYBUDDY_SKILL_NATIVE__).sort().join(',')==='channel,invoke'"), 'sandbox exposes only original Skill transport')
    check(await guest.executeJavaScript("window.__STUDYBUDDY_SKILL_STARTUP__.bindingId==='" + 'b'.repeat(64) + "'&&!('accessToken' in window.__STUDYBUDDY_SKILL_STARTUP__)"), 'startup contains binding without credential')
    const response = await guest.executeJavaScript("window.__STUDYBUDDY_SKILL_NATIVE__.invoke('skill_center_bridge_connect',{bindingId:window.__STUDYBUDDY_SKILL_STARTUP__.bindingId})")
    check(response.ok && response.data.bridgeSessionId === '11111111-1111-4111-8111-111111111111', 'original command traverses real preload and private pipe')
    const progress = await guest.executeJavaScript(`(async () => {
      let progress; const channel = window.__STUDYBUDDY_SKILL_NATIVE__.channel(value => { progress = value });
      const result = await window.__STUDYBUDDY_SKILL_NATIVE__.invoke('skill_center_copy', { onProgress: channel });
      return { progress, result };
    })()`)
    check(progress.progress.original === 'progress' && progress.result.ok && progress.result.data.original === 'skill_center_copy', 'opaque original progress channel delivered')
    const denied = await guest.executeJavaScript("window.__STUDYBUDDY_SKILL_NATIVE__.invoke('skill_center_copy',{selectedPath:'C:/untrusted'})")
    check(denied.ok === false && denied.error.code === 'SKILL_OPERATION_DENIED', 'remote page cannot supply a native selected path')
    await community.skills.setTheme(owner.webContents, lease.lease, { mode: 'dark', variables: { '--dsw-alias-bg-base': '#232930' } })
    check(await guest.executeJavaScript("document.body.hasAttribute('data-ds-dark-theme')&&document.body.style.getPropertyValue('--dsw-alias-bg-base')==='#232930'"), 'resolved official dark palette delivered')
    await guest.executeJavaScript("window.__visibility=[];window.addEventListener('studybuddy:embedded-resume',()=>window.__visibility.push('resume'));window.addEventListener('studybuddy:embedded-suspend',()=>window.__visibility.push('suspend'))")
    await community.skills.setVisible(owner.webContents, lease.lease, false)
    await community.skills.setTheme(owner.webContents, lease.lease, { mode: 'dark', variables: { '--dsw-alias-bg-base': '#232930' } })
    check(await guest.executeJavaScript("window.__visibility.join(',')==='suspend,suspend'"), 'hidden retained page stays suspended through theme updates')
    const originalGuest = guest
    await community.skills.setVisible(owner.webContents, lease.lease, true)
    check(guest === originalGuest && (await community.skills.acquire(owner.webContents)).lease === lease.lease, 'return reuses the original authenticated page')
    const expiredGuest = guest, expiredPeer = peer, expiredLease = lease.lease
    // Destruction can abandon executeJavaScript's promise; observe the owned cleanup barrier directly.
    void guest.executeJavaScript("window.__STUDYBUDDY_SKILL_NATIVE__.invoke('skill_center_scan',{fixtureAuthExpired:true})").catch(() => null)
    await wait(() => expiredGuest.isDestroyed() && expiredPeer.exitCode !== null)
    check(expiredGuest.isDestroyed() && expiredPeer.exitCode !== null, 'expired access destroys the guest and awaits its private process')
    lease = await community.skills.acquire(owner.webContents)
    check(lease.lease !== expiredLease, 'authenticated retry obtains a fresh lease after expiry')
    await attach(lease)
    const renewed = await guest.executeJavaScript("window.__STUDYBUDDY_SKILL_NATIVE__.invoke('skill_center_bridge_connect',{bindingId:window.__STUDYBUDDY_SKILL_STARTUP__.bindingId})")
    check(renewed.ok && renewed.data.bridgeSessionId === '11111111-1111-4111-8111-111111111111', 'fresh sandbox transport reconnects after expiry')
    let navigationBlocked = false
    guest.on('will-frame-navigate', event => { if (event.url === 'https://evil.test/') navigationBlocked = true })
    await guest.executeJavaScript("location.assign('https://evil.test/')")
    await wait(() => navigationBlocked)
    check(guest.getURL().startsWith('https://guijitongzhuo.com/skills'), 'cross-origin main-frame navigation blocked')
    await browserSession.cookies.set({ url: 'https://guijitongzhuo.com', name: 'synthetic-session', value: 'fixture' })
    scope = null
    await community.revoke()
    check(guest.isDestroyed(), 'logout destroys old authenticated document')
    check((await browserSession.cookies.get({})).length === 0, 'logout wipes isolated browser storage')
    check(peer.exitCode !== null, 'logout awaits private process quiescence')
    const reacquire = await community.skills.acquire(owner.webContents).then(() => null, error => error.message)
    check(reacquire === 'AUTH_REQUIRED', 'signed-out account cannot reacquire Skill capability')
    check(await owner.webContents.executeJavaScript("typeof window.__STUDYBUDDY_SKILL_NATIVE__==='undefined'"), 'local shell does not receive remote Skill capability')
    await writeFile(receipt, JSON.stringify({ checks, productionCredentials: false, realToolWrites: false }))
    owner.destroy(); app.exit(0)
  } catch (error) {
    const document = guest && !guest.isDestroyed() ? await guest.executeJavaScript('document.body.innerText.slice(0, 2048)').catch(() => null) : null
    await writeFile(receipt, JSON.stringify({ error: error.stack, checks, messages, requests, document }))
    await community?.revoke().catch(() => {})
    owner?.destroy(); app.exit(1)
  }
})()
