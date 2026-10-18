import {expect,it,vi} from 'vitest'
import {CapabilityCanvasViews} from '../../src/studybuddy/capabilities/views.ts'
import {caller} from './fixture.ts'
const target={moduleId:'aigc',projectRef:'canvas-a'}
function setup(){
 let current=true
 const controller={id:'controller-a',ready:vi.fn(async()=>{}),state:vi.fn(async()=>({canvasId:'画布1.json',revision:2})),flush:vi.fn(async()=>{}),close:vi.fn(async()=>{})}
 const create=vi.fn(async()=>controller),find=vi.fn(async()=>null)
 const views=new CapabilityCanvasViews({assert:()=>{if(!current)throw Error('CAPABILITY_SCOPE_REVOKED')},find,create})
 return{views,create,find,controller,revoke:()=>{current=false}}
}
it('closedCanvasLoadsWithoutFocus and reuses one writable controller',async()=>{
 const f=setup(),[a,b]=await Promise.all([f.views.acquire(caller,target),f.views.acquire(caller,target)])
 expect(a.controller).toBe(b.controller);expect(f.create).toHaveBeenCalledTimes(1)
 expect(f.create.mock.calls[0]?.length).toBe(2)
 expect(await a.state()).toEqual({canvasId:'画布1.json',revision:2})
 await a.release();await b.release();expect(f.controller.close).not.toHaveBeenCalled();await f.views.close()
})
it('showUsesSameWritableController or waits for flush before a foreground handoff',async()=>{
 const f=setup(),lease=await f.views.acquire(caller,target);let handed=false
 const handoff=f.views.handoff(caller,target).then(()=>{handed=true})
 await Promise.resolve();expect(handed).toBe(false);await lease.release();await handoff
 expect(f.controller.flush).toHaveBeenCalledTimes(1);expect(f.controller.close).toHaveBeenCalledTimes(1)
 await f.views.close()
})
it('lateResultAfterAccountSwitchRejects',async()=>{
 const f=setup(),gate=Promise.withResolvers<void>();f.controller.ready.mockImplementationOnce(()=>gate.promise)
 const work=f.views.acquire(caller,target);await Promise.resolve();f.revoke();gate.resolve()
 await expect(work).rejects.toThrow('CAPABILITY_SCOPE_REVOKED');await f.views.close()
})
it('handoff drains every nested lease before closing a controller',async()=>{
 const f=setup(),a=await f.views.acquire(caller,target),b=await f.views.acquire(caller,target)
 const work=f.views.handoff(caller,target);await new Promise(resolve=>setTimeout(resolve,0));await a.release();await b.release()
 await Promise.race([work,new Promise((_,reject)=>setTimeout(()=>reject(Error('handoff did not drain')),100))]);await f.views.close()
})
it('failed flush closes an owned background controller and permits a fresh foreground handoff',async()=>{
 const f=setup(),lease=await f.views.acquire(caller,target);await lease.release();f.controller.flush.mockRejectedValueOnce(Error('SAVE_FAILED'))
 await expect(f.views.handoff(caller,target)).rejects.toThrow('SAVE_FAILED');expect(f.controller.close).toHaveBeenCalledTimes(1)
 const next=await f.views.acquire(caller,target);expect(f.create).toHaveBeenCalledTimes(2);await next.release();await f.views.close()
})
it('a failed controller lookup is cleared so a later acquisition can load the canvas',async()=>{
 const f=setup();f.find.mockRejectedValueOnce(Error('TRANSIENT_STATE_FAILURE'))
 await expect(f.views.acquire(caller,target)).rejects.toThrow('TRANSIENT_STATE_FAILURE')
 const next=await f.views.acquire(caller,target);expect(f.find).toHaveBeenCalledTimes(2);await next.release();await f.views.close()
})
it('a failed page load is cleared so a later acquisition can create a new controller',async()=>{
 const f=setup();f.create.mockRejectedValueOnce(Error('PAGE_LOAD_FAILED'))
 await expect(f.views.acquire(caller,target)).rejects.toThrow('PAGE_LOAD_FAILED')
 const next=await f.views.acquire(caller,target);expect(f.create).toHaveBeenCalledTimes(2);await next.release();await f.views.close()
})
