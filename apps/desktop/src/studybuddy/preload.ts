/** An origin-scoped product API with summary-only responses. */
import { contextBridge, ipcRenderer } from 'electron'
import { STUDYBUDDY_IPC, type StudyBuddyApi, type StudyBuddyAuthState } from './types.ts'
import { COMMUNITY_IPC } from './community-types.ts'
import { AIGC_IPC } from './aigc-types.ts'
import { RESEARCH_IPC } from './research-types.ts'
import { VIDEO_IPC } from './video-types.ts'
import { createSupportPreload } from './support-preload.ts'
export function exposeStudyBuddy(): void {
  if (location.protocol !== 'dsh-app:' || !process.isMainFrame
    || !(location.hostname === 'app' || (location.hostname === 'shell' && location.pathname === '/welcome.html'))) return
  const api: StudyBuddyApi = {
    status: () => ipcRenderer.invoke(STUDYBUDDY_IPC.status) as Promise<StudyBuddyAuthState>,
    start: () => ipcRenderer.invoke(STUDYBUDDY_IPC.start) as Promise<StudyBuddyAuthState>,
    cancel: () => ipcRenderer.invoke(STUDYBUDDY_IPC.cancel) as Promise<StudyBuddyAuthState>,
    logout: () => ipcRenderer.invoke(STUDYBUDDY_IPC.logout) as Promise<StudyBuddyAuthState>,
    checkUpdates: () => ipcRenderer.invoke(STUDYBUDDY_IPC.updates),
    subscribe(listener) {
      const handle = (_event: Electron.IpcRendererEvent, state: StudyBuddyAuthState): void => { listener(state) }
      ipcRenderer.on(STUDYBUDDY_IPC.state, handle)
      return () => { ipcRenderer.off(STUDYBUDDY_IPC.state, handle) }
    },
  }
  if(location.hostname==='app'){
    const unwrap=async<T>(operation:Promise<{ ok:true;data:T }|{ ok:false;error:{ code:string;operationId?:string } }>):Promise<T>=>{
      const response=await operation
      if(!response.ok)throw Object.assign(new Error(response.error.code),response.error)
      return response.data
    }
    Object.assign(api,{
      capabilities:{completeOpen:(id:string)=>unwrap(ipcRenderer.invoke('studybuddy:capability-open',id)),openProject:(id:string)=>unwrap(ipcRenderer.invoke('studybuddy:capability-project-open',id))},
      prompts: { invoke: (method: string, args: readonly unknown[]) => unwrap(ipcRenderer.invoke('studybuddy:prompts', method, args)) },
      support: createSupportPreload(ipcRenderer),
      video:{
        available:()=>unwrap(ipcRenderer.invoke(VIDEO_IPC.available)),
        acquire:()=>unwrap(ipcRenderer.invoke(VIDEO_IPC.acquire)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(VIDEO_IPC.release,lease)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(VIDEO_IPC.theme,lease,theme)),
        setVisible:(lease:string,visible:boolean)=>unwrap(ipcRenderer.invoke(VIDEO_IPC.visible,lease,visible)),
        acknowledgeReference:(id:string)=>unwrap(ipcRenderer.invoke(VIDEO_IPC.acknowledgeReference,id)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{const handle=(_event:Electron.IpcRendererEvent,lease:unknown):void=>{if(typeof lease==='string')listener(lease)};ipcRenderer.on(VIDEO_IPC.invalid,handle);return()=>{ipcRenderer.off(VIDEO_IPC.invalid,handle)}},
        subscribeAction:(listener:(notice:unknown)=>void)=>{const handle=(_event:Electron.IpcRendererEvent,notice:unknown):void=>listener(notice);ipcRenderer.on(VIDEO_IPC.action,handle);return()=>{ipcRenderer.off(VIDEO_IPC.action,handle)}},
      },
      research:{
        acknowledgeIntent:(id:string)=>unwrap(ipcRenderer.invoke(RESEARCH_IPC.acknowledgeIntent,id)),
        acquire:()=>unwrap(ipcRenderer.invoke(RESEARCH_IPC.acquire)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(RESEARCH_IPC.release,lease)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(RESEARCH_IPC.theme,lease,theme)),
        setVisible:(lease:string,visible:boolean)=>unwrap(ipcRenderer.invoke(RESEARCH_IPC.visible,lease,visible)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,lease:unknown):void=>{if(typeof lease==='string')listener(lease)}
          ipcRenderer.on(RESEARCH_IPC.invalid,handle);return()=>{ipcRenderer.off(RESEARCH_IPC.invalid,handle)}
        },
        subscribeAction:(listener:(notice:unknown)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,notice:unknown)=>listener(notice)
          ipcRenderer.on(RESEARCH_IPC.action,handle);return()=>{ipcRenderer.off(RESEARCH_IPC.action,handle)}
        },
      },
      aigc:{
        subscribeAction:(listener:(value:unknown)=>void)=>{const handle=(_event:Electron.IpcRendererEvent,value:unknown)=>listener(value);ipcRenderer.on(AIGC_IPC.action,handle);return()=>{ipcRenderer.off(AIGC_IPC.action,handle)}},
        interactionReady:(id:string,visible=true)=>unwrap(ipcRenderer.invoke(AIGC_IPC.interactionReady,id,visible)),
        acquire:()=>unwrap(ipcRenderer.invoke(AIGC_IPC.acquire)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(AIGC_IPC.release,lease)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(AIGC_IPC.theme,lease,theme)),
        setVisible:(lease:string,visible:boolean)=>unwrap(ipcRenderer.invoke(AIGC_IPC.visible,lease,visible)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,lease:unknown):void=>{if(typeof lease==='string')listener(lease)}
          ipcRenderer.on(AIGC_IPC.invalid,handle)
          return()=>{ipcRenderer.off(AIGC_IPC.invalid,handle)}
        },
      },
      community:{
        acquire:(target:string)=>unwrap(ipcRenderer.invoke(COMMUNITY_IPC.acquire,target)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(COMMUNITY_IPC.release,lease)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(COMMUNITY_IPC.theme,lease,theme)),
        setVisible:(lease:string,visible:boolean)=>unwrap(ipcRenderer.invoke(COMMUNITY_IPC.visible,lease,visible)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,lease:unknown):void=>{if(typeof lease==='string')listener(lease)}
          ipcRenderer.on(COMMUNITY_IPC.invalid,handle)
          return()=>{ipcRenderer.off(COMMUNITY_IPC.invalid,handle)}
        },
        subscribeNavigation:(listener:(notice:unknown)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,notice:unknown):void=>listener(notice)
          ipcRenderer.on(COMMUNITY_IPC.navigation,handle)
          return()=>{ipcRenderer.off(COMMUNITY_IPC.navigation,handle)}
        },
      },
      business:{ invoke:(method:string,args:readonly unknown[])=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.business,method,args)) },
      embedded:{
        acquire:(target:string)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedAcquire,target)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedRelease,lease)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedTheme,lease,theme)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{
          const handle=(_event:Electron.IpcRendererEvent,lease:unknown):void=>{if(typeof lease==='string')listener(lease)}
          ipcRenderer.on(STUDYBUDDY_IPC.embeddedInvalid,handle)
          return()=>{ipcRenderer.off(STUDYBUDDY_IPC.embeddedInvalid,handle)}
        },
      },
      tools:{
        acquire:(target?:'tools'|'labs')=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsAcquire,target)),
        resize:(lease:string,bounds:unknown)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsResize,lease,bounds)),
        setVisible:(lease:string,visible:boolean)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsVisible,lease,visible)),
        setTheme:(lease:string,theme:unknown)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsTheme,lease,theme)),
        release:(lease:string)=>unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsRelease,lease)),
        subscribeInvalid:(listener:(lease:string)=>void)=>{
          const callback=(_event:Electron.IpcRendererEvent,lease:string)=>listener(lease)
          ipcRenderer.on(STUDYBUDDY_IPC.toolsInvalid,callback)
          return()=>{ipcRenderer.off(STUDYBUDDY_IPC.toolsInvalid,callback)}
        },
      },
      subscribeNavigation:(listener:(notice:unknown)=>void)=>{
        const callback=(_event:Electron.IpcRendererEvent,notice:unknown)=>listener(notice)
        ipcRenderer.on(STUDYBUDDY_IPC.toolNavigation,callback)
        return()=>{ipcRenderer.off(STUDYBUDDY_IPC.toolNavigation,callback)}
      },
    })
  }
  contextBridge.exposeInMainWorld('studybuddy', api)
}
