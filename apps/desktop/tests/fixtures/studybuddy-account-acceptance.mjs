/** Explicit local desktop acceptance. Read-only APIs; the candidate web build is served only in this guest. */
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(new URL('../../../web/package.json',import.meta.url)),{_electron}=require('playwright'),desktopRequire=createRequire(new URL('../../package.json',import.meta.url))
const appRoot=resolve(fileURLToPath(new URL('../../',import.meta.url))),environment={...process.env,DSH_HOME:join(appRoot,'.desktop-build/development/home'),DSH_DESKTOP_PRIMARY_RUNTIME_DIR:join(appRoot,'.desktop-build/targets/win-x64/runtime/primary-runtime'),DSH_DESKTOP_OPEN_DEVTOOLS:'0'}
delete environment.ELECTRON_RUN_AS_NODE
const application=await _electron.launch({executablePath:desktopRequire('electron'),args:['--user-data-dir='+join(appRoot,'.desktop-build/development/electron-user-data'),appRoot],cwd:appRoot,env:environment,timeout:60_000})
async function main(expression){
  expression=expression.replaceAll("require('electron')",'electron').replaceAll("require('node:fs/promises')","process.getBuiltinModule('fs/promises')").replaceAll("require('node:path')","process.getBuiltinModule('path')")
  return application.evaluate((electron,code)=>eval(code),expression)
}
const candidate=process.env.STUDYBUDDY_PROFILE_BUILD
if(!candidate)throw new Error('PROFILE_CANDIDATE_REQUIRED')
// Preserve HTTPS origin, original HttpOnly cookies and all live API requests. This is not deployment.
await application.evaluate(async({app,webContents,session},root)=>{
  const fs=process.getBuiltinModule('fs/promises'),path=process.getBuiltinModule('path'),assets=new Set(await fs.readdir(path.join(root,'assets'))),sessions=new Set()
  const install=contents=>{
    if(contents.getType()!=='window')return
    contents.on('will-attach-webview',(_event,_preferences,params)=>{
      if(!String(params.partition).startsWith('studybuddy-profile-')||!String(params.src).startsWith('about:blank#studybuddy-profile-'))return
      const guestSession=session.fromPartition(params.partition);if(sessions.has(guestSession))return;sessions.add(guestSession)
      guestSession.protocol.handle('https',async request=>{
        const url=new URL(request.url);let target=null,type='text/html'
        if(url.origin==='https://guijitongzhuo.com'&&url.pathname==='/my-ai/profile')target=path.join(root,'index.html')
        else if(url.origin==='https://guijitongzhuo.com'&&url.pathname.startsWith('/assets/')&&assets.has(url.pathname.slice(8))){target=path.join(root,'assets',url.pathname.slice(8));type=target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.svg')?'image/svg+xml':target.endsWith('.png')?'image/png':'application/octet-stream'}
        if(target)return new Response(await fs.readFile(target),{headers:{'Content-Type':type}})
        return guestSession.fetch(request,{bypassCustomProtocolHandlers:true})
      })
    })
  }
  app.on('web-contents-created',(_event,contents)=>install(contents));webContents.getAllWebContents().forEach(install)
},candidate)
const browser={contexts:()=>[application.context()],close:()=>application.close()}
try{
  await application.firstWindow();const page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().startsWith('dsh-app://app'))
  if(!page)throw new Error('DESKTOP_WORKSPACE_REQUIRED')
  await page.getByRole('button',{name:'我的 AI',exact:true}).click({timeout:30_000})
  const retry=page.getByRole('button',{name:'重试',exact:true});if(await retry.isVisible())await retry.click()
  await page.waitForFunction(()=>document.querySelector('webview[partition^="studybuddy-profile-"]')?.style.display==='flex',{timeout:30_000})
  const id=await page.evaluate(()=>document.querySelector('webview[partition^="studybuddy-profile-"]').getWebContentsId())
  const guest=code=>main(`Promise.resolve(require('electron')).then(e=>e.webContents.fromId(${id}).executeJavaScript(${JSON.stringify(code)}))`)
  const settle=async()=>{
    await guest('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  }
  // Parent Playwright captures can distort webview surfaces. Capture the native compositor instead.
  const capture=path=>application.evaluate(async({BrowserWindow},target)=>{
    const window=BrowserWindow.getAllWindows().find(value=>value.webContents.getURL().startsWith('dsh-app://app'))
    if(!window)throw new Error('DESKTOP_WORKSPACE_REQUIRED')
    await process.getBuiltinModule('fs/promises').writeFile(target,(await window.webContents.capturePage()).toPNG())
  },path)
  for(let attempt=0;attempt<80;attempt++){if(await guest('Boolean(document.querySelector("[data-harness-profile] .profile-metrics"))'))break;await new Promise(resolve=>setTimeout(resolve,250))}
  assert.equal(await guest('Boolean(document.querySelector("[data-harness-profile] .profile-metrics"))'),true,'candidate profile dashboard loaded')
  assert.equal(await page.getByRole('tab',{name:'使用记录',exact:true}).count(),0)
  assert.equal(await page.getByRole('button',{name:/^可用余额/}).count(),0)
  assert.equal(await page.getByRole('button',{name:/^余额/}).count(),1)
  assert.equal(await guest('document.querySelectorAll(".profile-heatmap-cell").length'),365)
  for(let attempt=0;attempt<120;attempt++){
    if(await guest('(()=>{const image=document.querySelector(".profile-avatar-wrap > img");return !!image?.complete&&image.naturalWidth>0})()'))break
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  assert.equal(await guest('(()=>{const image=document.querySelector(".profile-avatar-wrap > img");return !!image?.complete&&image.naturalWidth>0})()'),true,'profile avatar loaded or approved fallback loaded')
  const walletAppearance=await page.getByRole('button',{name:/^余额/}).evaluate(node=>{
    const style=getComputedStyle(node);return {border:style.borderTopWidth,shadow:style.boxShadow}
  })
  assert.equal(walletAppearance.border,'0px');assert.equal(walletAppearance.shadow,'none')
  await guest('(()=>{const input=document.createElement("input");input.id="studybuddy-acceptance-draft";input.value="retained local draft";document.body.append(input);window.scrollTo(0,100);return true})()')
  await page.getByRole('tab',{name:'自备模型',exact:true}).click();await page.getByRole('tab',{name:'个人资料',exact:true}).click()
  assert.equal(await guest('document.getElementById("studybuddy-acceptance-draft").value'),'retained local draft')
  const screenshots=process.env.STUDYBUDDY_ACCEPTANCE_OUTPUT??fileURLToPath(new URL('../../../../output/studybuddy-account-acceptance/',import.meta.url));await mkdir(screenshots,{recursive:true})
  const geometry=[]
  for(const [width,height]of [[1280,820],[900,650]]){
    await main(`Promise.resolve(require('electron')).then(e=>{const window=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('dsh-app://app'));window.setSize(${width},${height});return true})`)
    await page.getByRole('button',{name:/^余额/}).click();await page.getByRole('dialog',{name:'充值',exact:true}).waitFor()
    await page.waitForFunction(()=>document.querySelector('webview[partition^="studybuddy-profile-"]')?.style.display==='none')
    const focus=await page.evaluate(()=>({guestFocused:document.activeElement?.tagName==='WEBVIEW',balanceButtons:[...document.querySelectorAll('button')].filter(button=>button.innerText.startsWith('余额')).length}))
    assert.equal(focus.guestFocused,false);assert.equal(focus.balanceButtons,1)
    await page.getByRole('dialog',{name:'充值',exact:true}).getByRole('button',{name:'关闭',exact:true}).last().click()
    await page.waitForFunction(()=>document.querySelector('webview[partition^="studybuddy-profile-"]')?.style.display==='flex')
    await guest('window.scrollTo(0,0)')
    const box=await page.locator('webview[partition^="studybuddy-profile-"]').boundingBox();assert(box&&box.width>0&&box.height>0)
    const viewport=await guest('({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,scroll:scrollY})')
    assert(viewport.documentWidth<=viewport.width,'profile has no horizontal document overflow '+JSON.stringify(viewport))
    await settle()
    const layout=await guest(`(()=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}}
      return {clientWidth:document.documentElement.clientWidth,root:rect(document.querySelector('[data-harness-profile]')),
        avatar:rect(document.querySelector('.profile-avatar-wrap > img')),
        cards:[...document.querySelectorAll('.profile-top-grid > section')].map(rect),
        metrics:[...document.querySelectorAll('.profile-metrics > article')].map(rect)}
    })()`)
    const inside=rect=>rect.left>=layout.root.left-1&&rect.right<=layout.root.right+1
    assert(layout.root.right<=layout.clientWidth+1&&layout.cards.every(inside),'profile cards fit the guest')
    assert.equal(layout.metrics.length,5);assert(layout.metrics.every(inside),'all five metrics fit the guest')
    assert.equal(layout.avatar.width,64);assert.equal(layout.avatar.height,64);assert(inside(layout.avatar))
    geometry.push({width,height,guest:box,viewport,layout})
    await capture(join(screenshots,`my-ai-${width}x${height}.png`))
  }
  await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''))
  await page.getByRole('button',{name:/^余额/}).click();await page.getByRole('dialog',{name:'充值',exact:true}).getByRole('button',{name:'关闭',exact:true}).last().click()
  await page.waitForFunction(()=>document.querySelector('webview[partition^="studybuddy-profile-"]')?.style.display==='flex')
  assert.equal(await guest('document.body.hasAttribute("data-ds-dark-theme")'),true)
  await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'))
  await page.getByRole('button',{name:/^余额/}).click();await page.getByRole('dialog',{name:'充值',exact:true}).getByRole('button',{name:'关闭',exact:true}).last().click()
  await guest('document.getElementById("studybuddy-acceptance-draft")?.remove();window.scrollTo(0,0)')
  await main("Promise.resolve(require('electron')).then(e=>{const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('dsh-app://app'));w.setSize(1280,820);return true})")
  console.log(JSON.stringify({checks:['single balance','borderless balance','direct recharge','two tabs','candidate profile over original HTTPS APIs','365 token squares','retained guest draft','overlay hides guest','focus stays outside hidden guest','900x650','1280x820','dark guest theme','loaded approved avatar','five metric bounds','card bounds','native compositor capture'],geometry,paymentCreated:false,modelProbe:false,webPreview:'local candidate; production not deployed'}))
}finally{await browser.close()}
