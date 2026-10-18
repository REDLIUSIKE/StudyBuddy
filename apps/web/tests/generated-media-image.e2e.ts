// Recorded native-media metadata through the built Harness client. External image bytes are a keyless fixture.
import {chromium} from 'playwright'
import {expect,it} from 'vitest'
import {Session,SessionId,SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session'
import {ToolCallId,createAssistantMessage,createToolResultMessage,createUserMessage} from '@deepseek-ai/dsh-llm'
import {launchWebScaffold,seedSession} from './scaffold.ts'
import {newEnglishPage,WEB_FIXTURE_TIME} from './support.ts'
const id='44444444-4444-4444-8444-444444444444',unknown='55555555-5555-4555-8555-555555555555'
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
function fixture(finalReply = `![Owned generated image](${id})\n\n![Unknown request](${unknown})\n\nGENERATED_MEDIA_READY`){
 const session=Session.create(SessionId('generated-media-image-source')),callId=ToolCallId('image-fixture')
 const args=JSON.stringify({modelId:'doubao-seedream-5-0-flash-260915',prompt:'keyless image fixture',size:'1K'})
 const task={schemaVersion:1,requestId:id,sessionId:'{{sessionId}}',kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true}
 session.append('turn/start',{turn:1})
 session.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Display the existing generated image.'}]}),{surfaceOp:'append'})
 session.append('step/start',{turn:1,step:1})
 session.append('assistant/message',{stream:[],turn:1,step:1,message:createAssistantMessage({source:{provider:'fixture',model:'fixture'},
  content:[{type:'tool-call',id:callId,name:'generate_image',arguments:args}]})},{surfaceOp:'append'})
 const source=session.append('tool/call',{turn:1,step:1,callId,name:'generate_image',arguments:args})
 session.append('tool/result',{turn:1,step:1,meta:task,message:createToolResultMessage({callId,isError:false,
  content:[{type:'text',text:JSON.stringify(task)}]})},{surfaceOp:'append',sourceEventSeqs:[source.seq]})
 session.append('step/end',{turn:1,step:1});session.append('step/start',{turn:1,step:2})
 session.append('assistant/message',{stream:[],turn:1,step:2,message:createAssistantMessage({source:{provider:'fixture',model:'fixture'},
  content:[{type:'text',text:finalReply}]})},{surfaceOp:'append'})
 session.append('step/end',{turn:1,step:2});session.append('turn/end',{turn:1,reason:{kind:'completed'}})
 return[JSON.stringify({type:'session',version:SESSION_FORMAT_VERSION,id:'{{sessionId}}',createdAt:0,cwd:'{{cwd}}',isSeeded:false,delegationDepth:0}),
  ...session.snapshotEvents().map(event=>JSON.stringify({...event,time:WEB_FIXTURE_TIME+event.seq*1000})), ''].join('\n')
}
it('renders a recorded generated image through the owned media endpoint after history reload, leaving unknown IDs as file failures',async()=>{
 const scaffold=await launchWebScaffold({}),browser=await chromium.launch()
 try{
  await seedSession(scaffold,fixture(),'generated-media-image-web-e2e',undefined,{createdAt:WEB_FIXTURE_TIME-60000})
  const page=await newEnglishPage(browser),requests:URL[]=[]
  await page.route('**/api/studybuddy-media?*',async route=>{
   expect(route.request().method()).toBe('GET')
   const url=new URL(route.request().url());requests.push(url)
   expect(url.searchParams.get('requestId')).toBe(id)
   expect(url.searchParams.get('kind')).toBe('image')
   expect(url.searchParams.get('sessionId')).not.toBe('{{sessionId}}')
   if(url.searchParams.get('mode')==='status')await route.fulfill({json:{schemaVersion:1,requestId:id,sessionId:url.searchParams.get('sessionId'),
    kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true}})
   else{expect(url.searchParams.get('mode')).toBe('content');await route.fulfill({contentType:'image/png',body:PNG})}
  })
  await page.goto(scaffold.authenticatedUrl,{waitUntil:'load'})
  await page.getByRole('treeitem').first().click();await page.getByRole('treeitem').nth(1).click()
  await page.getByText('GENERATED_MEDIA_READY',{exact:true}).waitFor()
  const image=page.getByRole('img',{name:'Owned generated image',exact:true})
  await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(1)
  await page.getByText('Image preview unavailable · Unknown request',{exact:true}).waitFor()
  expect(new URL((await image.getAttribute('src'))!).pathname).toBe('/api/studybuddy-media')
  const count=requests.length
  await page.reload({waitUntil:'load'})
  await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(1)
  expect(requests.length).toBeGreaterThan(count)
 }finally{await browser.close();await scaffold.close()}
},120000)

it('shows a generated image directly below a plain final reply with Tool details closed',async()=>{
 const scaffold=await launchWebScaffold({}),browser=await chromium.launch()
 try{
  await seedSession(scaffold,fixture('Image generated. GENERATED_MEDIA_READY'),'generated-media-direct-web-e2e',undefined,{createdAt:WEB_FIXTURE_TIME-60000})
  const page=await newEnglishPage(browser)
  await page.addInitScript(() => {
   const listeners = new Set<(action: unknown) => void>()
   const host = window as Window & { dshDesktop?: unknown; __imageAction?: (action: unknown) => void }
   host.dshDesktop = { images: { subscribe(listener: (action: unknown) => void) { listeners.add(listener); return () => { listeners.delete(listener) } } } }
   host.__imageAction = action => { for (const listener of listeners) listener(action) }
  })
  await page.route('**/api/studybuddy-media?*',async route=>{
   const url=new URL(route.request().url())
   expect(route.request().method()).toBe('GET')
   expect(url.searchParams.get('requestId')).toBe(id)
   if(url.searchParams.get('mode')==='status')await route.fulfill({json:{schemaVersion:1,requestId:id,sessionId:url.searchParams.get('sessionId'),
    kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true}})
   else await route.fulfill({contentType:'image/png',body:PNG})
  })
  await page.goto(scaffold.authenticatedUrl,{waitUntil:'load'})
  await page.getByRole('treeitem').first().click();await page.getByRole('treeitem').nth(1).click()
  await page.getByText('Image generated. GENERATED_MEDIA_READY',{exact:true}).waitFor()
  const image=page.locator('[data-turn-tail] [data-generated-image] img')
  expect(await image.count()).toBe(1)
  await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(1)
  expect(await image.evaluate(element=>element.closest('[data-step-process-body]'))).toBeNull()
  expect(await image.evaluate(element=>element.closest('[data-turn-process-hidden]'))).toBeNull()
  await page.getByRole('button',{name:'View generated image'}).click()
  await page.getByRole('dialog',{name:'Generated image'}).waitFor()
  await page.keyboard.press('Escape')
  expect(await page.getByRole('dialog',{name:'Generated image'}).count()).toBe(0)
  const target=await image.evaluate(element=>({ src:(element as HTMLImageElement).src,
   sessionId:element.closest('[data-chat-session]')!.getAttribute('data-chat-session')!,name:'Existing car',x:1,y:1 }))
  await page.evaluate(target=>(window as any).__imageAction({ action:'open',target }),target)
  const tab=page.locator('[data-conversation-image-tab]')
  await tab.waitFor()
  await expect.poll(()=>tab.locator('img').evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(1)
  expect(await tab.getAttribute('data-chat-session')).toBe(target.sessionId)
  await tab.getByRole('button').click()
  await page.locator('[data-image-lightbox]').waitFor()
  await page.keyboard.press('Escape')
  await page.evaluate(target=>(window as any).__imageAction({ action:'attach',target }),target)
  await page.getByRole('img',{name:'Existing car.png',exact:true}).waitFor()
  expect(await page.getByText('Image generated. GENERATED_MEDIA_READY',{exact:true}).count()).toBe(1)
  await page.reload({waitUntil:'load'})
  await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(1)
 }finally{await browser.close();await scaffold.close()}
},120000)
