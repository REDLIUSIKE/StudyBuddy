import {EventEmitter} from 'node:events'
import type {BrowserWindow,IpcMain,IpcMainInvokeEvent,Session,WebContents} from 'electron'
import {expect,it,vi} from 'vitest'
import {StudyBuddyResearch} from '../src/studybuddy/research.ts'
import {RESEARCH_IPC} from '../src/studybuddy/research-types.ts'
import type {ResearchRuntime} from '../src/studybuddy/research-runtime.ts'
import type {ResearchBridge} from '../src/studybuddy/research-bridge.ts'

it('opens six official sites only through the system opener while leaving the owned settings guest and native chat untouched',async()=>{
  const scope={accountId:'external-fixture',generation:1},origin='http://127.0.0.1:41513'
  let current:typeof scope|null=scope
  const owner=Object.assign(new EventEmitter(),{id:901,isDestroyed:()=>false,send:vi.fn()}) as unknown as WebContents
  const browserSession=Object.assign(Object.create(null) as Session,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},on(){},webRequest:{onBeforeRequest(){},onBeforeSendHeaders(){}},clearStorageData:async()=>{},clearCache:async()=>{}})
  const bind=vi.fn(),chats=vi.fn(),ensure=vi.fn(async()=>({origin})),opened=vi.fn(async()=>{})
  const runtime={ensure,requestHeaders:(_scope:unknown,url:string)=>URL.canParse(url)&&new URL(url).origin===origin?{'X-StudyBuddy-Research-Guest':'fixture'}:{},revoke:async()=>{}} as unknown as ResearchRuntime
  const bridge={bind,chats,revoke:async()=>{}} as unknown as ResearchBridge
  const research=new StudyBuddyResearch({userDataRoot:'unused-fixture-root',auth:{scope:()=>current,withSession:async run=>run({scope,accessToken:'fixture-not-forwarded'})},runtime,bridge,preload:'owned-preload',fromPartition:()=>browserSession,openExternal:opened})
  const handlers=new Map<string,Parameters<IpcMain['handle']>[1]>()
  const ipc:IpcMain=Object.assign(new EventEmitter(),{
    handle(name:string,handler:Parameters<IpcMain['handle']>[1]){handlers.set(name,handler)},
    handleOnce(name:string,handler:Parameters<IpcMain['handleOnce']>[1]){handlers.set(name,(event,...args)=>{handlers.delete(name);return handler(event,...args)})},
    removeHandler(name:string){handlers.delete(name)},
  })
  research.register(ipc,()=>{})
  const lease=(await handlers.get(RESEARCH_IPC.acquire)!({sender:owner} as IpcMainInvokeEvent)).data
  research.bind({webContents:owner} as BrowserWindow,()=>()=>{},()=>false)
  let page='about:blank#studybuddy-research-'+lease.lease
  const frame={url:origin+'/settings'},guest=Object.assign(new EventEmitter(),{id:902,mainFrame:frame,getURL:()=>page,isDestroyed:()=>false,hostWebContents:owner,setWindowOpenHandler(){},executeJavaScript:vi.fn(async()=>{}),close(){guest.emit('destroyed')}}) as unknown as WebContents
  owner.emit('did-attach-webview',{},guest);guest.emit('dom-ready');page=frame.url
  const request=handlers.get(RESEARCH_IPC.guestAction)!,event={sender:guest,senderFrame:frame} as unknown as IpcMainInvokeEvent
  try{
    for(const url of ['https://modal.com/','https://www.autodl.com/','https://paperclip.gxl.ai/','https://metaso.cn/','https://exa.ai/','https://open.bochaai.com/']){
      expect(await request(event,{kind:'open-service-site',url})).toEqual({ok:true,data:{opened:true}})
      expect(opened).toHaveBeenLastCalledWith(url)
    }
    expect(page).toBe(origin+'/settings');expect(bind).not.toHaveBeenCalled();expect(chats).not.toHaveBeenCalled();expect(owner.send).not.toHaveBeenCalled();expect(ensure).toHaveBeenCalledOnce()
    expect((await request(event,{kind:'open-service-site',url:'https://exa.ai/?key=secret'})).ok).toBe(false)
    expect((await request({...event,senderFrame:{url:frame.url}} as IpcMainInvokeEvent,{kind:'open-service-site',url:'https://exa.ai/'})).ok).toBe(false)
    current=null
    expect((await request(event,{kind:'open-service-site',url:'https://exa.ai/'})).ok).toBe(false)
    expect(opened).toHaveBeenCalledTimes(6)
  }finally{await research.revoke()}
})
