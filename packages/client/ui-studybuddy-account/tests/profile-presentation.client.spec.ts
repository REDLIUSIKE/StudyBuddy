// @vitest-environment jsdom
import {it,expect,vi} from 'vitest'
import {ProfileController} from '../src/client/profile-controller.ts'
import {ProfilePresentation} from '../src/client/ProfilePresentation.ts'

it('retains the same guest across tab returns, hides it under foreground menus and restores the dark palette',async()=>{
  const scope={accountId:'a',generation:1},setTheme=vi.fn(),release=vi.fn(async()=>{})
  const controller=new ProfileController({acquire:async()=>({scope,lease:'fixture',partition:'fixture',entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop'}),release,setTheme})
  const frames=new Map<number,FrameRequestCallback>();let next=0
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next})
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(0)}
  const create=document.createElement.bind(document)
  const container=create('div');document.body.append(container)
  vi.spyOn(container,'getBoundingClientRect').mockReturnValue(new DOMRect(200,100,600,400))
  document.body.setAttribute('data-ds-dark-theme','')
  const presentation=new ProfilePresentation(controller)
  try{
    controller.setScope(scope);const detach=presentation.attach(container);await controller.acquire();flush()
    const guest=document.querySelector('webview')!;expect(guest.getAttribute('aria-hidden')).toBe('false')
    const menu=create('div');menu.setAttribute('role','menu');document.body.append(menu);window.dispatchEvent(new Event('resize'));flush()
    expect(guest.getAttribute('aria-hidden')).toBe('true');expect(guest.getAttribute('tabindex')).toBe('-1')
    menu.remove();detach();flush();expect(document.querySelector('webview')).toBe(guest)
    presentation.attach(container);flush();expect(guest.getAttribute('aria-hidden')).toBe('false')
    expect(setTheme.mock.calls.at(-1)?.[1].mode).toBe('dark')
    controller.setScope({accountId:'b',generation:2});flush();expect(document.querySelector('webview')).toBeNull();expect(release).toHaveBeenCalledWith('fixture')
  }finally{presentation.dispose();controller.dispose();container.remove();document.body.removeAttribute('data-ds-dark-theme');vi.restoreAllMocks();vi.unstubAllGlobals()}
})
