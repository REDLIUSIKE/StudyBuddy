/** Main-owned, ephemeral profile guests over the existing one-time embedded-session exchange. */
import { randomUUID } from 'node:crypto'
import type { BrowserWindow,IpcMainInvokeEvent,Session,WebContents } from 'electron'
import type { EmbeddedLease,EmbeddedTheme,OwnedScope } from '@studybuddy/contracts'
import type { MainSession,StudyBuddyAuth,StudyBuddyFetch } from './services.ts'
import { parseGrowthSaveUrl,type GrowthSaveStatus } from './growth-image.ts'
import { settleCleanup } from '../settle-cleanup.ts'
const origin='https://guijitongzhuo.com'
const prefix='about:blank#studybuddy-profile-'
const routes=['/my-ai/profile','/leaderboards','/campus-knowledge']
/** A ticket issuer may return only the existing authenticated profile entry. */
export function validateProfileEntry(value:unknown):string{
  if(typeof value!=='string'||!URL.canParse(value))throw new Error('PROFILE_ENTRY_INVALID')
  const url=new URL(value)
  if(url.origin!==origin||url.username||url.password||url.pathname!=='/my-ai/profile'||url.searchParams.get('embed')!=='desktop'||!/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash)||[...url.searchParams.keys()].some(key=>key!=='embed'))throw new Error('PROFILE_ENTRY_INVALID')
  url.searchParams.set('host_ui','harness');return url.href
}
/** Profile and existing campus flows remain inside their own web origin. */
export function profileNavigationAllowed(value:string):boolean{
  if(!URL.canParse(value))return false
  const url=new URL(value)
  return url.origin===origin&&!url.username&&!url.password&&routes.some(route=>url.pathname===route||url.pathname.startsWith(route+'/'))
}
/** Theme transfer accepts only resolved stylesheet tokens, never arbitrary guest scripts. */
export function validateEmbeddedTheme(value:unknown):EmbeddedTheme{
  if(!value||typeof value!=='object')throw new Error('PROFILE_THEME_INVALID')
  const row=value as Record<string,unknown>
  if(row.mode!=='light'&&row.mode!=='dark'||!row.variables||typeof row.variables!=='object'||Array.isArray(row.variables))throw new Error('PROFILE_THEME_INVALID')
  const entries=Object.entries(row.variables)
  if(entries.length>1200)throw new Error('PROFILE_THEME_INVALID')
  const variables:Record<string,string>={}
  for(const [name,item] of entries){
    if(!/^--(?:dsw-[a-z0-9-]+|dsh-(?:content-font-size(?:-secondary)?|terminal-font-size|font-family-[a-z0-9-]+))$/.test(name)||typeof item!=='string'||!item.length||item.length>256||/[;{}<>]|url\s*\(|@/i.test(item))throw new Error('PROFILE_THEME_INVALID')
    variables[name]=item
  }
  return { mode:row.mode,variables }
}
/** Main-owned capabilities contributed by a specific embedded business page. */
export interface EmbeddedGuestIssue {
  entryUrl:string
  requestAllowed?(url:string):boolean
  requestHeaders?(url:string):Readonly<Record<string,string>>
  startup?:{ bindingId:string;operationId:string }
  invoke?(command:string,input:Record<string,unknown>,page:string,send:(channelId:string,payload:unknown)=>void):Promise<unknown>
  dispose?():Promise<void>
}
/** Separate instances retain separate ticket issuers, routes, preloads and partitions. */
export interface EmbeddedGuestOptions {
  target:'zhilian'|'skills'|'aigc'|'research'|'video'
  validateEntry(value:unknown):string
  navigationAllowed(value:string):boolean
  issue?(session:MainSession,owner:WebContents):Promise<EmbeddedGuestIssue>
  preload?:string
  navigate?(owner:WebContents,guest:WebContents,lease:EmbeddedLease,url:string):Promise<void>
  /** Owner validates an exact external allowlist; guest navigation remains denied. */
  openExternal?(url:string):Promise<void>
}
interface LeaseState{
  lease:EmbeddedLease
  view:'profile'|'models'
  owner:WebContents
  session:Session
  attached:boolean
  saving?:boolean
  guest?:WebContents
  theme?:EmbeddedTheme
  releaseInput?:()=>void
  issued?:EmbeddedGuestIssue
  navigationPending?:boolean
  visible?:boolean
  announcedVisible?:boolean
}
/** Account lifetime owns the partition; release waits for destruction and wipes its browser storage. */
export class StudyBuddyEmbeddedGuests{
  #leases=new Map<string,LeaseState>()
  #pending=new Map<string,Promise<EmbeddedLease>>()
  #cleanup:Promise<void>=Promise.resolve()
  constructor(private readonly auth:Pick<StudyBuddyAuth,'scope'|'withSession'>,private readonly fetcher:StudyBuddyFetch,private readonly fromPartition:(partition:string)=>Session,private readonly saveGrowth?:(owner:WebContents,version:string)=>Promise<GrowthSaveStatus>,private readonly invalidated?:(owner:WebContents,lease:string)=>void,private readonly options?:EmbeddedGuestOptions){}
  private get prefix():string{return this.options?'about:blank#studybuddy-'+this.options.target+'-':prefix}
  private allowed(value:string):boolean{return this.options?this.options.navigationAllowed(value):profileNavigationAllowed(value)}
  owns(owner:WebContents,id:string):boolean{return this.#leases.get(id)?.owner===owner}
  checkedGuest(event:Pick<IpcMainInvokeEvent,'sender'|'senderFrame'>):{ lease:EmbeddedLease;issued:EmbeddedGuestIssue;guest:WebContents }{
    const row=[...this.#leases.values()].find(row=>row.guest===event.sender)
    if(!row||!row.issued||!this.sameScope(row.lease.scope)||event.senderFrame!==event.sender.mainFrame||!this.allowed(event.sender.getURL())||!this.allowed(event.senderFrame.url))throw new Error('COMMUNITY_GUEST_DENIED')
    return { lease:row.lease,issued:row.issued,guest:event.sender }
  }
  async setVisible(owner:WebContents,id:string,visible:boolean):Promise<void>{
    const row=this.#leases.get(id)
    if(!row||row.owner!==owner||!this.sameScope(row.lease.scope)||typeof visible!=='boolean')throw new Error('PROFILE_OWNER_MISMATCH')
    row.visible=visible
    await this.applyVisibility(row)
  }
  /** Theme and geometry updates do not start another page-resume transaction. */
  private async applyVisibility(row:LeaseState):Promise<void>{
    const guest=row.guest,visible=row.visible===true
    if(!guest||guest.isDestroyed()||!this.allowed(guest.getURL())||this.#leases.get(row.lease.lease)!==row||row.announcedVisible===visible)return
    row.announcedVisible=visible
    try{await guest.executeJavaScript('window.dispatchEvent(new Event('+JSON.stringify(visible?'studybuddy:embedded-resume':'studybuddy:embedded-suspend')+'))',false)}
    catch(error){if(row.announcedVisible===visible)delete row.announcedVisible;throw error}
  }
  recognizes(owner:WebContents,src:string,partition?:string):boolean{
    if(!src.startsWith(this.prefix))return false
    const row=this.#leases.get(src.slice(this.prefix.length))
    return !!row&&row.owner===owner&&(partition===undefined||row.lease.partition===partition)&&this.sameScope(row.lease.scope)
  }
  private sameScope(scope:OwnedScope):boolean{
    const current=this.auth.scope()
    return !!current&&current.accountId===scope.accountId&&current.generation===scope.generation
  }
  acquire(owner:WebContents,view:'profile'|'models'='profile'):Promise<EmbeddedLease>{
    if(!['profile','models'].includes(view)||this.options&&view!=='profile')return Promise.reject(new Error('PROFILE_TARGET_DENIED'))
    const key=`${owner.id}:${view}`,pending=this.#pending.get(key);if(pending)return pending
    const result=this.create(owner,view).finally(()=>{if(this.#pending.get(key)===result)this.#pending.delete(key)})
    this.#pending.set(key,result);return result
  }
  private async create(owner:WebContents,view:'profile'|'models'):Promise<EmbeddedLease>{
    await this.#cleanup
    let created:EmbeddedLease|undefined,issued:EmbeddedGuestIssue|undefined
    try{return await this.auth.withSession(async (privateSession)=>{
      for(const row of this.#leases.values())if(row.owner===owner&&row.view===view&&this.sameScope(row.lease.scope))return row.lease
      if(this.options?.issue)issued=await this.options.issue(privateSession,owner)
      else {
        const response=await this.fetcher(origin+'/api/v1/auth/embedded-session',{ method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{ Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+privateSession.accessToken },body:JSON.stringify({ target:this.options?.target??'personal_profile' }) })
        if(!response.ok)throw new Error(response.status===401?'AUTH_REQUIRED':'PROFILE_TICKET_FAILED')
        const data:unknown=await response.json()
        if(!data||typeof data!=='object'||!('entryUrl'in data)||typeof data.entryUrl!=='string')throw new Error('PROFILE_ENTRY_INVALID')
        issued={ entryUrl:data.entryUrl }
      }
      let entryUrl=this.options?this.options.validateEntry(issued.entryUrl):validateProfileEntry(issued.entryUrl)
      if(view==='models'){const url=new URL(entryUrl);url.searchParams.set('view','models');entryUrl=url.href}
      if(owner.isDestroyed()||!this.sameScope(privateSession.scope))throw new Error('ACCOUNT_SCOPE_CHANGED')
      const lease=randomUUID(),partition='studybuddy-'+(this.options?.target??'profile')+'-'+randomUUID(),browserSession=this.fromPartition(partition)
      this.configureSession(browserSession,issued)
      created={ lease,partition,entryUrl,scope:privateSession.scope }
      this.#leases.set(lease,{ lease:created,view,owner,session:browserSession,attached:false,issued })
      return created
    })}catch(error){if(created)await this.release(owner,created.lease);else await issued?.dispose?.();throw error}
  }
  async release(owner:WebContents,id:unknown):Promise<void>{
    if(typeof id!=='string')throw new Error('PROFILE_LEASE_INVALID')
    const row=this.#leases.get(id);if(!row)return
    if(row.owner!==owner)throw new Error('PROFILE_OWNER_MISMATCH')
    this.#leases.delete(id);row.releaseInput?.()
    const guest=row.guest
    if(guest&&!guest.isDestroyed()){
      const stopped=new Promise<void>(resolve=>guest.once('destroyed',resolve))
      guest.close({ waitForBeforeUnload:false });await stopped
    }
    await settleCleanup([row.session.clearStorageData(),row.session.clearCache(),row.issued?.dispose?.()])
  }
  revoke(notify=false):Promise<void>{
    if(notify)for(const row of this.#leases.values()){
      try{this.invalidated?.(row.owner,row.lease.lease)}catch{console.error('StudyBuddy guest invalidation notification failed')}
    }
    const operations=[...this.#leases.values()].map(row=>this.release(row.owner,row.lease.lease))
    this.#cleanup=settleCleanup([this.#cleanup,...operations])
    return this.#cleanup
  }
  async setTheme(owner:WebContents,id:unknown,value:unknown):Promise<void>{
    const theme=validateEmbeddedTheme(value)
    const row=typeof id==='string'?this.#leases.get(id):undefined
    if(!row||row.owner!==owner||!this.sameScope(row.lease.scope))throw new Error('PROFILE_OWNER_MISMATCH')
    row.theme=theme
    if(row.guest&&!row.guest.isDestroyed()&&this.allowed(row.guest.getURL()))await this.applyTheme(row)
  }
  private async applyTheme(row:LeaseState):Promise<void>{
    if(!row.guest||!row.theme)return
    // Fixed, main-owned setter. Its only inputs were validated tokens and palette mode.
    await row.guest.executeJavaScript('(()=>{const theme='+JSON.stringify(row.theme)+';document.documentElement.style.colorScheme=theme.mode;document.body.toggleAttribute("data-ds-dark-theme",theme.mode==="dark");for(const [name,value]of Object.entries(theme.variables))document.body.style.setProperty(name,value);if(!window.__studybuddyInvalidListener){window.__studybuddyInvalidListener=true;window.addEventListener("studybuddy:embedded-invalid",()=>{location.assign("studybuddy://embedded-page/invalid")})}window.dispatchEvent(new Event("studybuddy-theme-change"));'+(this.options?'':'window.dispatchEvent(new Event("studybuddy:embedded-resume"));')+'})()',false)
    if(this.options)await this.applyVisibility(row)
  }
  bind(window:BrowserWindow,attachInput:(guest:WebContents,id:string)=>()=>void,
    browserReservation:(src:string,partition?:string)=>boolean):void{
    const owner=window.webContents
    owner.on('will-attach-webview',(event,preferences,params)=>{
      const src=params.src??''
      if(browserReservation(src,params.partition))return
      const row=src.startsWith(this.prefix)?this.#leases.get(src.slice(this.prefix.length)):undefined
      if(!row||row.owner!==owner||row.attached||params.partition!==row.lease.partition||!this.sameScope(row.lease.scope)){
        event.preventDefault();return
      }
      row.attached=true
      for(const key of Object.keys(preferences))Reflect.deleteProperty(preferences,key)
      Object.assign(preferences,{
        partition:row.lease.partition,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,
        contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,
        webviewTag:false,plugins:false,navigateOnDragDrop:false,disableDialogs:true,devTools:false,
      })
      if(this.options?.preload)preferences.preload=this.options.preload
      params.httpreferrer=''
    })
    owner.on('did-attach-webview',(_event,guest)=>{
      guest.once('dom-ready',()=>{
        const initial=guest.getURL()
        if(browserReservation(initial))return
        const row=initial.startsWith(this.prefix)?this.#leases.get(initial.slice(this.prefix.length)):undefined
        if(!row||row.owner!==owner||row.guest||!this.sameScope(row.lease.scope)){guest.close({ waitForBeforeUnload:false });return}
        row.guest=guest;row.releaseInput=attachInput(guest,row.lease.lease)
        guest.setWindowOpenHandler(({url})=>{
          if(this.options?.openExternal&&this.sameScope(row.lease.scope)&&this.allowed(guest.getURL()))void this.options.openExternal(url).catch(()=>{console.error('StudyBuddy external link was not opened')})
          return { action:'deny' }
        })
        guest.on('will-frame-navigate',(event)=>{if(event.isMainFrame&&!this.allowed(event.url)){
          event.preventDefault()
          if(!this.allowed(guest.getURL())||!this.sameScope(row.lease.scope))return
          const version=parseGrowthSaveUrl(event.url)
          if(version)void this.exportGrowth(row,version)
          else if(event.url==='studybuddy://embedded-page/invalid')void this.release(owner,row.lease.lease).then(()=>this.invalidated?.(owner,row.lease.lease)).catch(()=>{this.invalidated?.(owner,row.lease.lease);console.error('StudyBuddy profile invalidation cleanup failed')})
          else if(this.options?.navigate&&!row.navigationPending){row.navigationPending=true;void this.options.navigate(owner,guest,row.lease,event.url).catch(async()=>{await this.release(owner,row.lease.lease);this.invalidated?.(owner,row.lease.lease)}).catch(()=>{this.invalidated?.(owner,row.lease.lease);console.error('StudyBuddy community cleanup failed')}).finally(()=>{row.navigationPending=false})}
        }})
        guest.on('will-redirect',(event,url,_inPlace,mainFrame)=>{if(mainFrame&&!this.allowed(url))event.preventDefault()})
        guest.on('will-attach-webview',(event)=>{event.preventDefault()})
        guest.on('login',(event,_details,_auth,callback)=>{event.preventDefault();callback()})
        guest.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)delete row.announcedVisible})
        guest.on('did-finish-load',()=>{if(row.theme||this.options)void (row.theme?this.applyTheme(row):this.applyVisibility(row)).catch(()=>{void this.release(owner,row.lease.lease).catch(()=>{})})})
        guest.once('destroyed',()=>{if(this.#leases.has(row.lease.lease))void this.release(owner,row.lease.lease).catch(()=>{})})
      })
    })
    const releaseOwner=():void=>{
      for(const row of [...this.#leases.values()])if(row.owner===owner)void this.release(owner,row.lease.lease).catch(()=>{})
    }
    owner.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)releaseOwner()})
    owner.on('render-process-gone',releaseOwner);owner.once('destroyed',releaseOwner)
  }
  private async exportGrowth(row:LeaseState,version:string):Promise<void>{
    if(row.saving||!this.saveGrowth)return
    row.saving=true
    try{
      let status:GrowthSaveStatus
      try{status=await this.saveGrowth(row.owner,version)}catch{status='failed'}
      if(this.#leases.get(row.lease.lease)===row&&this.sameScope(row.lease.scope)&&row.guest&&!row.guest.isDestroyed())await row.guest.executeJavaScript('window.dispatchEvent(new CustomEvent("studybuddy:growth-save-result",{detail:'+JSON.stringify({ status })+'}))',false)
    }catch{console.error('StudyBuddy profile export result could not be delivered')
    }finally{row.saving=false}
  }
  private configureSession(browserSession:Session,issued:EmbeddedGuestIssue):void{
    browserSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
      const audioOnly=permission==='media'&&'mediaTypes'in details&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='audio'
      callback(audioOnly&&this.researchMicrophoneAllowed(browserSession,contents,details.requestingUrl,details.isMainFrame,
        undefined,'securityOrigin'in details?details.securityOrigin:undefined)
        ||this.clipboardWriteAllowed(browserSession,contents,permission,details.requestingUrl,details.isMainFrame)
        ||this.videoFullscreenAllowed(browserSession,contents,permission,details.requestingUrl,details.isMainFrame))
    })
    browserSession.setPermissionCheckHandler((contents,permission,origin,details)=>
      permission==='media'&&details.mediaType==='audio'&&this.researchMicrophoneAllowed(browserSession,contents,
        details.requestingUrl,details.isMainFrame,origin,details.securityOrigin)
      ||this.clipboardWriteAllowed(browserSession,contents,permission,details.requestingUrl,details.isMainFrame,origin)
      ||this.videoFullscreenAllowed(browserSession,contents,permission,details.requestingUrl,details.isMainFrame,origin))
    browserSession.setDevicePermissionHandler(()=>false)
    browserSession.setDisplayMediaRequestHandler((_request,callback)=>{callback({})})
    browserSession.on('will-download',(event)=>{event.preventDefault()})
    browserSession.webRequest.onBeforeRequest((details,callback)=>{
      if(!URL.canParse(details.url)){callback({ cancel:true });return}
      const url=new URL(details.url)
      if(issued.requestAllowed){callback({ cancel:url.username!==''||url.password!==''||!issued.requestAllowed(details.url) });return}
      callback({ cancel:url.username!==''||url.password!==''||(!['about:','data:','blob:'].includes(url.protocol)&&(url.protocol!=='https:'||url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')) })
    })
    const requestHeaders=issued.requestHeaders?.bind(issued)
    if(requestHeaders)browserSession.webRequest.onBeforeSendHeaders((details,callback)=>{
      callback({ requestHeaders:{ ...details.requestHeaders,...requestHeaders(details.url) } })
    })
  }
  /** Only a live focused Research root document can request its microphone; every other capture remains denied. */
  private researchMicrophoneAllowed(browserSession:Session,contents:WebContents|null,requestingUrl:string|undefined,
    isMainFrame:boolean,requestOrigin?:string,securityOrigin?:string):boolean{
    if(this.options?.target!=='research'||!contents||contents.isDestroyed()||!contents.isFocused()||!isMainFrame||!requestingUrl)return false
    const row=[...this.#leases.values()].find(row=>row.guest===contents),page=contents.getURL()
    if(!row||!row.attached||row.session!==browserSession||row.visible!==true||row.owner.isDestroyed()||!this.sameScope(row.lease.scope)
      ||!URL.canParse(row.lease.entryUrl)||!URL.canParse(page)||!URL.canParse(requestingUrl)||!this.allowed(page)||!this.allowed(requestingUrl))return false
    const entry=new URL(row.lease.entryUrl)
    if(entry.protocol!=='http:'||entry.hostname!=='127.0.0.1'||!entry.port||Number(entry.port)>65535||entry.username||entry.password||entry.search||entry.hash)return false
    return (requestOrigin===undefined||requestOrigin===entry.origin)&&(securityOrigin===undefined||securityOrigin===entry.origin)
      &&[new URL(page),new URL(requestingUrl)].every(url=>url.href===entry.href)
  }
  /** Only the live foreground editor main frame may request video fullscreen; generated film frames stay excluded. */
  private videoFullscreenAllowed(browserSession:Session,contents:WebContents|null,permission:string,
    requestingUrl:string|undefined,isMainFrame:boolean,requestOrigin?:string):boolean{
    if(this.options?.target!=='video'||permission!=='fullscreen'||!contents||contents.isDestroyed()||!isMainFrame||!requestingUrl)return false
    const row=[...this.#leases.values()].find(row=>row.guest===contents),page=contents.getURL()
    if(!row||row.session!==browserSession||row.visible!==true||row.owner.isDestroyed()||!this.sameScope(row.lease.scope)
      ||!URL.canParse(page)||!URL.canParse(requestingUrl)||!this.allowed(page)||!this.allowed(requestingUrl))return false
    const entry=new URL(row.lease.entryUrl)
    return entry.protocol==='http:'&&entry.hostname==='127.0.0.1'
      &&(requestOrigin===undefined||requestOrigin===entry.origin)
      &&[new URL(page),new URL(requestingUrl)].every(url=>url.origin===entry.origin)
  }
  /** Only the live foreground AIGC or Skill main frame may write sanitized clipboard content. */
  private clipboardWriteAllowed(browserSession:Session,contents:WebContents|null,permission:string,
    requestingUrl:string|undefined,isMainFrame:boolean,requestOrigin?:string):boolean{
    if(!['aigc','skills'].includes(this.options?.target??'')||permission!=='clipboard-sanitized-write'||!contents||contents.isDestroyed()||!isMainFrame||!requestingUrl)return false
    const row=[...this.#leases.values()].find(row=>row.guest===contents),page=contents.getURL()
    if(!row||row.session!==browserSession||row.visible!==true||row.owner.isDestroyed()||!this.sameScope(row.lease.scope)
      ||!URL.canParse(page)||!URL.canParse(requestingUrl)||!this.allowed(page)||!this.allowed(requestingUrl))return false
    const entry=new URL(row.lease.entryUrl)
    return (requestOrigin===undefined||requestOrigin===entry.origin)
      &&[new URL(page),new URL(requestingUrl)].every(url=>url.origin===entry.origin&&url.protocol===entry.protocol)
  }
}
