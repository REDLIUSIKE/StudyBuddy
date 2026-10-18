/** Native guest presentation retained across tabs; foreground overlays always win. */
import type {EmbeddedLease,EmbeddedTheme} from '@studybuddy/contracts'
import type {ProfileController} from './profile-controller.ts'
import {observeEmbeddedSurface,projectEmbeddedSurface,readEmbeddedSurfaceTheme} from '@deepseek-ai/dsh-client-ui-primitives'
interface ProfileWebview extends HTMLElement{loadURL(url:string):Promise<void>;getURL():string}
export class ProfilePresentation{
  #container:HTMLElement|null=null
  #guest:ProfileWebview|null=null
  #lease:string|null=null
  #stop:()=>void
  #stopGeometry:(()=>void)|undefined
  #frame:number|null=null
  #disposers:(()=>void)[]=[]
  #disposed=false
  #visible=false
  constructor(private readonly controller:ProfileController){
    this.#stop=controller.subscribe(()=>this.syncLease())
  }
  attach=(container:HTMLElement):(()=>void)=>{
    this.#stopGeometry?.();this.#container=container;const off=observeEmbeddedSurface(container,()=>this.queue());this.#stopGeometry=off;this.syncLease();this.queue()
    return()=>{off();if(this.#container===container){this.#container=null;this.#stopGeometry=undefined}this.queue()}
  }
  private syncLease():void{
    const lease=this.controller.getSnapshot().lease
    if(lease?.lease===this.#lease){this.queue();return}
    this.removeGuest()
    if(lease)this.createGuest(lease)
    this.queue()
  }
  private createGuest(lease:EmbeddedLease):void{
    const guest=document.createElement('webview') as ProfileWebview
    this.#guest=guest;this.#lease=lease.lease
    guest.setAttribute('partition',lease.partition)
    guest.setAttribute('src','about:blank#studybuddy-profile-'+lease.lease)
    guest.setAttribute('aria-label','StudyBuddy')
    guest.style.cssText='position:fixed;display:none;pointer-events:none;z-index:10;'
    let navigated=false
    const ready=():void=>{if(!navigated){navigated=true;void guest.loadURL(lease.entryUrl).catch(()=>this.controller.reportFailure('PROFILE_LOAD_FAILED'))}this.queue()}
    const failed=(event:Event):void=>{const detail=event as Event&{errorCode?:number;isMainFrame?:boolean};if(detail.isMainFrame!==false&&detail.errorCode!==-3)this.controller.reportFailure('PROFILE_LOAD_FAILED')}
    guest.addEventListener('dom-ready',ready);guest.addEventListener('did-fail-load',failed)
    this.#disposers.push(()=>{guest.removeEventListener('dom-ready',ready);guest.removeEventListener('did-fail-load',failed)})
    document.body.append(guest)
  }
  theme=():EmbeddedTheme=>readEmbeddedSurfaceTheme()
  private queue=():void=>{if(this.#disposed||this.#frame!==null)return;this.#frame=requestAnimationFrame(()=>{this.#frame=null;this.place()})}
  private place():void{
    const guest=this.#guest,container=this.#container;if(!guest)return
    const projection=projectEmbeddedSurface(container),bounds=projection.bounds,visible=projection.visible&&!this.controller.getSnapshot().errorCode
    const properties:Record<string,string>=visible&&bounds?{display:'flex',pointerEvents:'auto',left:bounds.x+'px',top:bounds.y+'px',width:bounds.width+'px',height:bounds.height+'px'}:{display:'none',pointerEvents:'none'}
    for(const [name,value] of Object.entries(properties))if(Reflect.get(guest.style,name)!==value)Reflect.set(guest.style,name,value)
    const hidden=String(!visible),tabIndex=visible?0:-1
    if(guest.getAttribute('aria-hidden')!==hidden)guest.setAttribute('aria-hidden',hidden)
    if(guest.tabIndex!==tabIndex)guest.tabIndex=tabIndex
    if(visible&&!this.#visible)void this.controller.setTheme(this.theme())
    this.#visible=visible
  }
  private removeGuest():void{for(const dispose of this.#disposers.splice(0))dispose();this.#guest?.remove();this.#guest=null;this.#lease=null;this.#visible=false}
  dispose():void{if(this.#disposed)return;this.#disposed=true;this.#stop();this.#stopGeometry?.();if(this.#frame!==null)cancelAnimationFrame(this.#frame);this.removeGuest()}
}
